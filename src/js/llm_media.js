import { getMediaDataUrl, isMediaRef } from './media_store.js';
import { fileAttachmentParts, attachmentSource } from './attachment_inputs.js';
import { attachmentKey, blockedAttachment, AttachmentInputError } from './attachment_state.js';
import { dataUrlBytes } from './attachment_documents.js';
import { isNativeGrokProvider, grokVideoFrames } from './grok_inputs.js';

const DATA_URL_RE = /^data:([^;,]*)(?:;[^,]*)?,/i;

export async function resolveMediaDataUrl(source) {
  const value = normalizeMediaSource(source);
  if (!value) return '';
  if (isDataUrl(value)) return value;
  if (isMediaRef(value)) return getRequiredMediaDataUrl(value);
  return fetchPathAsDataUrl(value);
}

export async function buildModelMessageContent({ speakerName = '', text = '', attachments = [], historical = false, attachmentIssues = [], provider = null } = {}) {
  const cleanText = String(text || '').trim();
  const normalizedAttachments = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
  const prefix = speakerName ? `${speakerName}：` : '';
  const bodyText = cleanText || (normalizedAttachments.length ? '发送了以下附件。' : '');
  const textContent = `${prefix}${bodyText}`.trim();
  if (!normalizedAttachments.length) return textContent || `${prefix}`.trim();

  const parts = [], readable = [];
  for (const attachment of normalizedAttachments) {
    const converted = await attachmentToContentParts(attachment, { historical, issues: attachmentIssues, provider });
    if (converted.length) { readable.push(attachment); parts.push(...converted); }
  }
  if (!readable.length) return cleanText ? `${prefix}${cleanText}` : '';
  const content = [{
    type: 'text',
    text: [
      textContent || `${prefix}发送了以下附件。`.trim(),
      attachmentLabelText(readable)
    ].filter(Boolean).join('\n')
  }];
  content.push(...parts);
  return content;
}

export async function buildAttachmentContentParts(attachments = [], options = {}) {
  const content = [];
  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    content.push(...await attachmentToContentParts(attachment, options));
  }
  return content;
}

export function attachmentLabelText(attachments = []) {
  const list = (Array.isArray(attachments) ? attachments : []).filter(Boolean);
  if (!list.length) return '';
  return list.map((item, index) => {
    const type = attachmentKindLabel(item);
    const name = item.name || item.mime || `attachment-${index + 1}`;
    return `[${type}:${name}]`;
  }).join(' ');
}

export function isDataUrl(value) {
  return DATA_URL_RE.test(String(value || ''));
}

export function inferMimeFromDataUrl(dataUrl) {
  const match = DATA_URL_RE.exec(String(dataUrl || ''));
  return match?.[1] || '';
}

export function dataUrlPayload(dataUrl) {
  return String(dataUrl || '').split(',')[1] || '';
}

async function attachmentToContentParts(attachment = {}, options = {}) {
  const source = attachmentSource(attachment);
  const key = await attachmentKey(source || attachment.id || attachment.name || 'missing');
  const blocked = await blockedAttachment([key]);
  if (blocked) {
    if (options.historical) return [];
    throw new AttachmentInputError([{ ...blocked, keys: [key] }]);
  }
  let dataUrl;
  try { dataUrl = await resolveMediaDataUrl(source); }
  catch (error) {
    // Temporary fetch/IDB errors are not proof that a format is unsupported.
    if (options.historical) { options.issues?.push({name:attachment.name,reason:error.message}); return []; }
    throw error;
  }
  if (!dataUrl) {
    throw new Error(`无法读取附件数据：${attachment.name || attachment.mime || attachment.id || '未命名附件'}`);
  }
  const mime = attachment.mime || inferMimeFromDataUrl(dataUrl) || 'application/octet-stream';
  const name = attachment.name || attachment.fileName || 'attachment';
  const provenance = async () => ({ name, keys: [key, await attachmentKey(dataUrlBytes(dataUrl))], current: !options.historical });

  if ((mime.startsWith('video/') || attachment.type === 'video') && isNativeGrokProvider(options.provider)) {
    return grokVideoFrames(dataUrl, name, await provenance());
  }

  if ((mime.startsWith('image/') || attachment.type === 'image') && mime !== 'image/svg+xml') {
    return [{
      type: 'image_url',
      _fritiaAttachment: await provenance(),
      image_url: {
        url: dataUrl,
        detail: 'auto'
      }
    }];
  }

  if (mime.startsWith('audio/') || attachment.type === 'audio') {
    return [{
      type: 'input_audio',
      _fritiaAttachment: await provenance(),
      input_audio: {
        data: dataUrlPayload(dataUrl),
        format: audioFormatFromMime(mime, name)
      }
    }];
  }

  return fileAttachmentParts({ ...attachment, name, mime }, dataUrl, options);
}

async function getRequiredMediaDataUrl(ref) {
  const dataUrl = await getMediaDataUrl(ref);
  if (!dataUrl) throw new Error(`IndexedDB 媒体数据不存在：${ref}`);
  return dataUrl;
}

async function fetchPathAsDataUrl(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`读取媒体资源失败：${path} (${response.status})`);
  const blob = await response.blob();
  const mime = inferMimeFromPath(path);
  const normalizedBlob = mime && (!blob.type || blob.type === 'application/octet-stream')
    ? new Blob([blob], { type: mime })
    : blob;
  return blobToDataUrl(normalizedBlob);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取媒体 Blob 失败。'));
    reader.readAsDataURL(blob);
  });
}

function normalizeMediaSource(source) {
  if (!source) return '';
  if (typeof source === 'string') return source.trim();
  if (typeof source === 'object') {
    return source.dataRef || source.mediaRef || source.dataUrl || source.fileData || source.audio || source.url || source.path || '';
  }
  return '';
}

function attachmentKindLabel(attachment = {}) {
  const mime = attachment.mime || '';
  if (attachment.type === 'image' || mime.startsWith('image/')) return '图片';
  if (attachment.type === 'audio' || mime.startsWith('audio/')) return '音频';
  return '附件';
}

function audioFormatFromMime(mime = '', name = '') {
  const lower = `${mime} ${name}`.toLowerCase();
  if (lower.includes('wav')) return 'wav';
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3';
  if (lower.includes('ogg')) return 'ogg';
  if (lower.includes('webm')) return 'webm';
  if (lower.includes('m4a') || lower.includes('mp4')) return 'mp4';
  return 'mp3';
}

function inferMimeFromPath(path = '') {
  const clean = String(path || '').split(/[?#]/)[0].toLowerCase();
  if (clean.endsWith('.mp3')) return 'audio/mpeg';
  if (clean.endsWith('.wav')) return 'audio/wav';
  if (clean.endsWith('.m4a')) return 'audio/mp4';
  if (clean.endsWith('.ogg')) return 'audio/ogg';
  if (clean.endsWith('.webm')) return 'audio/webm';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.gif')) return 'image/gif';
  return '';
}
