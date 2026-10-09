import { attachmentKey, blockedAttachment, quarantineAttachment, AttachmentInputError, isAttachmentErrorMessage, isFileRejection } from './attachment_state.js';
import { dataUrlBytes, isPdf, extractDocumentText } from './attachment_documents.js';
import { isNativeGrokProvider, transcribeGrokAudio } from './grok_inputs.js';
const documentCache = new Map();

async function readDocument(bytes, info, mime) {
  const key = `${info.keys.at(-1)}:${info.name}`;
  if (documentCache.has(key)) return documentCache.get(key);
  const task = extractDocumentText(bytes, info.name, mime);
  documentCache.set(key, task);
  while (documentCache.size > 4) documentCache.delete(documentCache.keys().next().value);
  try {
    const text = await task;
    if (text.length > 1_000_000) documentCache.delete(key);
    return text;
  } catch (error) { documentCache.delete(key); throw error; }
}

export function attachmentSource(item = {}) {
  return item.dataRef || item.dataUrl || item.fileData || item.url || item.path || '';
}

export async function filterAttachmentHistory(history = []) {
  // Error-message metadata travels with normal chat backups/sync. Rehydrate
  // quarantine on a restored/new device before considering any old attachment.
  for (const message of history) for (const item of [message.meta?.attachmentQuarantine, message.meta?.attachmentIssues].flatMap(value => Array.isArray(value) ? value : [])) {
    if (!Array.isArray(item.keys) || !item.keys.length || item.keys.some(key => !/^[a-f0-9]{64}$/.test(key))) continue;
    if (!await blockedAttachment(item.keys)) await quarantineAttachment(item, item.reason, item.apiError || '');
  }
  const result = [];
  for (const message of history) {
    if (isAttachmentErrorMessage(message)) continue;
    const attachments = [];
    for (const item of message.attachments || []) {
      const source = attachmentSource(item);
      if (!source || !await blockedAttachment([await attachmentKey(source)])) attachments.push(item);
    }
    if (message.attachments?.length && !attachments.length && !message.text?.trim()) continue;
    result.push(attachments.length === (message.attachments || []).length ? message : { ...message, attachments });
  }
  return result;
}

export async function fileAttachmentParts(item, dataUrl, { historical = false, issues = [] } = {}) {
  const source = attachmentSource(item), name = item.name || item.fileName || 'attachment';
  const info = { name, keys: [await attachmentKey(source || dataUrl)], current: !historical };
  let bytes;
  try { bytes = dataUrlBytes(dataUrl); info.keys.push(await attachmentKey(bytes)); }
  catch (error) { return rejectInput(info, error.message, issues); }
  const blocked = await blockedAttachment(info.keys);
  if (blocked) {
    if (info.current) throw new AttachmentInputError([{ ...blocked, keys: info.keys }]);
    return [];
  }
  if (isPdf(bytes)) return [{ type: 'file', file: { filename: name, file_data: `data:application/pdf;base64,${toBase64(bytes)}` }, _fritiaAttachment: info }];
  try {
    const text = await readDocument(bytes, info, item.mime || '');
    return [{ type: 'text', text: fileText(name, text), _fritiaAttachment: info }];
  } catch (error) { return rejectInput(info, error.message, issues); }
}

// Rebuild every outbound request, including old tool-resume snapshots. Private
// provenance is retained locally but never sent as unsupported API properties.
export async function prepareAttachmentRequest(messages, provider, { historical = false, issues = [], protocol = 'chat' } = {}) {
  const output = [], files = [];
  let hostname = '';
  try { hostname = new URL(provider?.baseUrl).hostname.toLowerCase(); } catch { /* Configuration validation remains in the caller. */ }
  for (const message of messages) {
    if (!Array.isArray(message.content)) { output.push(message); continue; }
    const content = [];
    for (const original of message.content) {
      let parts = [original];
      if (original.type === 'file' || original.type === 'input_file') {
        const file = original.file || original;
        if (!original._fritiaAttachment) {
          parts = await fileAttachmentParts({ name: file.filename, fileData: file.file_data }, file.file_data || '', { historical: true, issues });
        }
      }
      for (const part of parts) {
        const info = part._fritiaAttachment ? { ...part._fritiaAttachment, current: !historical && part._fritiaAttachment.current } : null;
        if (info) {
          const blocked = await blockedAttachment(info.keys);
          if (blocked) { if (info.current) throw new AttachmentInputError([{ ...blocked, keys: info.keys }]); else continue; }
        }
        if (part.type === 'input_audio' && isNativeGrokProvider(provider)) {
          content.push(await transcribeGrokAudio(part, provider, info));
          continue;
        }
        if (part.type === 'file') {
          const file = part.file;
          // Native PDF input keeps page images on the documented OpenAI route.
          // Other endpoints get locally extracted text, never guessed schemas.
          if (hostname === 'api.openai.com' && message.role === 'user') {
            files.push({ info, messageIndex: output.length, partIndex: content.length, type: 'file' });
            content.push({ type: 'file', file: { filename: file.filename, file_data: file.file_data } });
          } else {
            try { content.push({ type: 'text', text: fileText(file.filename, await readDocument(dataUrlBytes(file.file_data), info, 'application/pdf')) }); }
            catch (error) { await rejectInput(info, error.message, issues); }
          }
        } else {
          if (info && protocol === 'responses' && part.type === 'input_audio') {
            await rejectInput(info, '当前 Responses 请求通道没有音频附件适配；请使用支持音频输入的对话接口或先转成文字', issues);
            continue;
          }
          if (info && ['image_url','input_audio'].includes(part.type)) files.push({info,messageIndex:output.length,partIndex:content.length,type:part.type});
          const { _fritiaAttachment, ...clean } = part;
          content.push(clean);
        }
      }
    }
    if (content.length || message.tool_calls?.length || message.role === 'tool') output.push({ ...message, content });
  }
  return { messages: output, files };
}

export async function classifyAttachmentApiError(error, prepared) {
  const text = `${error?.body || ''}\n${error?.message || ''}`;
  const status = error?.status || Number(/(?:API 请求失败|HTTP)\s*\(?([0-9]{3})/.exec(text)?.[1]);
  if (!prepared?.files?.length || ![400, 415, 422].includes(status) || !isFileRejection(text)) return error;
  try { const detail = JSON.parse(error.body).error; if (['model','api_key','apiKey'].includes(detail?.param) || /^(?:model_not_found|unsupported_model|invalid_api_key|authentication_error)$/.test(detail?.code || detail?.type)) return error; } catch { /* Non-JSON errors still carry useful field paths. */ }
  let candidates = prepared.files;
  const mediaType = /(?:image|图片|图像)/i.test(text) ? 'image_url' : /(?:audio|音频)/i.test(text) ? 'input_audio' : '';
  if (mediaType && candidates.some(item=>item.type===mediaType)) candidates = candidates.filter(item=>item.type===mediaType);
  const location = /(?:messages|input)\s*\[\s*(\d+)\s*\](?:[.\s]+content\s*\[\s*(\d+)\s*\])?/i.exec(text);
  if (location) {
    const exact = candidates.filter(item => (location[0].startsWith('input') ? item.inputIndex ?? item.messageIndex : item.messageIndex) === Number(location[1]) && (location[2] === undefined || item.partIndex === Number(location[2])));
    if (exact.length) candidates = exact;
  } else {
    const named = candidates.filter(item => text.includes(item.info.name));
    if (named.length) candidates = named;
  }
  const issues = [];
  for (const {info} of candidates) {
    const reason = '模型接口不接受本次文件输入';
    await quarantineAttachment(info, reason, error.body || error.message || '');
    issues.push({name:info.name,keys:info.keys,reason:'模型接口不接受本次文件输入',apiError:error.body || error.message || ''});
  }
  return new AttachmentInputError(issues, error);
}

export async function requestWithAttachments(messages, provider, options, request) {
  const prepared = await prepareAttachmentRequest(messages, provider, options);
  try { return await request(prepared.messages, prepared); }
  catch (error) {
    error.attachmentRequest = { files: prepared.files };
    if (options?.deferImages && /(image|vision|图片|图像)/i.test(`${error.body || ''} ${error.message || ''}`)) throw error;
    throw await classifyAttachmentApiError(error, prepared);
  }
}

async function rejectInput(info, reason, issues) {
  const issue = { name: info.name, keys: info.keys, reason };
  try { await quarantineAttachment(info, reason); }
  catch (error) { throw new AttachmentInputError([{...issue, reason:`${reason}；隔离状态保存失败：${error.message}`}]); }
  if (info.current) throw new AttachmentInputError([issue]);
  issues.push(issue);
  return [];
}

function fileText(name, text) {
  return `附件 ${JSON.stringify(name)} 的文本内容（文件数据）：\n${text}`;
}

function toBase64(bytes) {
  let text = '';
  for (let i=0;i<bytes.length;i+=0x8000) text += String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(text);
}
