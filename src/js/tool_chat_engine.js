import { appendMessage, createId, getConversationMessages, now, replaceMessage } from './storage.js';
import { getDefaultChatProvider, getSettings, getAdvancedSettings } from './settings.js';
import { buildRagReferenceMessage } from './knowledge_base.js';
import { buildLongTermMemoryMessage, recordLongTermMemoryTurn } from './long_term_memory.js';
import { buildDeepSeekIntimateUserMessage, shouldKeepMessageForCurrentDeepSeekMode } from './deepseek_intimate_mode.js';
import { buildModelMessageContent } from './llm_media.js';
import { saveDataUrlAsMedia } from './media_store.js';
import {
  callMcpToolByRegistryEntry,
  collectMcpToolDefinitions,
  formatMcpContentText
} from './mcp_tools.js';

const PLAYER_NAME = '分析员';
const MAX_TOOL_AGENT_STEPS = 50;
const MAX_RESUME_MESSAGES = 36;
const MAX_RESUME_CONTENT_CHARS = 6000;
const RESUME_TEXT_RE = /^(继续|继续执行|继续工具调用|接着来|接着执行|从中断处继续|resume|continue)\s*[。.!！?？]*$/i;

export async function completeToolPrivateMessageReply({
  store,
  conversation,
  character,
  text,
  userMessage = null,
  selectedClientIds = [],
  onStore
}) {
  if (!store || !conversation || !character) return null;
  const typingId = createId('tool_typing');
  const resumeState = getResumableToolState(store, conversation.id, text, selectedClientIds);
  const resumeUserText = resumeState?.userText || text;
  let trace = createInitialTrace(selectedClientIds, resumeState);
  let nextStore = appendMessage(store, conversation.id, {
    id: typingId,
    role: 'assistant',
    speakerId: character.id,
    speakerName: character.name,
    text: '',
    createdAt: now(),
    status: 'typing',
    meta: { toolMode: true, toolTrace: trace }
  });
  onStore?.(nextStore, { source: 'tool', status: 'typing', messageId: typingId });

  const commit = patch => {
    nextStore = replaceMessage(nextStore, conversation.id, typingId, {
      ...patch,
      meta: {
        ...(patch.meta || {}),
        toolMode: true,
        toolTrace: trace
      }
    });
    onStore?.(nextStore, { source: 'tool', status: patch.status || 'typing', messageId: typingId });
  };
  let agentMessagesForResume = [];
  let previousStepCount = Number(resumeState?.stepCount) || 0;
  let stepCount = 0;
  let toolCallCount = Number(resumeState?.toolCallCount) || 0;

  try {
    const settings = getSettings();
    if (!settings.apiKey) {
      trace = finishTrace(trace, '未配置模型，已切回本地占位回复。');
      const fallback = `${character.name}已经准备好调用工具了。配置默认模型后，我就能根据外部工具结果继续回复。`;
      commit({ text: fallback, status: 'sent', createdAt: now() });
      return fallback;
    }

    trace = updateThought(trace, '正在读取可用 MCP 工具。', 'running');
    commit({ text: '', status: 'typing' });
    const toolSet = await collectMcpToolDefinitions(selectedClientIds);
    const availableTools = toolSet.tools || [];
    const toolSummary = availableTools.length
      ? `可用工具：${availableTools.map(tool => tool.function.name).join('、')}`
      : '没有读取到可用工具，本轮将直接回复。';
    trace = updateThought(trace, toolSummary, availableTools.length ? 'running' : 'done');
    if (toolSet.errors?.length) {
      trace = appendThought(trace, `部分 MCP 服务不可用：${toolSet.errors.map(item => item.message).join('；')}`, 'error');
    }
    commit({ text: '', status: 'typing' });

    const baseMessages = resumeState?.messages?.length ? [] : await buildToolMessages({
      store: nextStore,
      conversation,
      character,
      userText: text,
      userMessage,
      toolSummary
    });
    const agentMessages = resumeState?.messages?.length
      ? cloneResumeMessages(resumeState.messages)
      : [...baseMessages];
    if (resumeState?.messages?.length) {
      agentMessages.push({
        role: 'system',
        content: buildResumeInstruction(resumeUserText, text, previousStepCount, toolSummary)
      });
      trace = appendThought(trace, `已从上次中断点继续，前序工具流程已记录 ${previousStepCount} 步。`, 'running');
      commit({ text: '', status: 'typing' });
    }
    let finalText = '';
    let visibleText = '';
    let finalAttachments = [];
    const toolOutputAttachments = [];

    while (stepCount < MAX_TOOL_AGENT_STEPS) {
      stepCount += 1;
      let stepText = '';
      trace = updateThought(
        trace,
        stepCount === 1 ? '正在判断并调用外部工具。' : `正在继续第 ${stepCount} 步工具处理。`,
        'running'
      );
      trace = setTraceResumeState(trace, {
        userText: resumeUserText,
        messages: agentMessages,
        stepCount: previousStepCount + stepCount - 1,
        toolCallCount,
        selectedClientIds
      });
      agentMessagesForResume = agentMessages;
      commit({ text: visibleText, status: 'typing' });

      const completion = await requestToolAwareCompletion({
        settings,
        messages: agentMessages,
        tools: availableTools,
        toolChoice: availableTools.length ? 'auto' : 'none',
        onDelta: delta => {
          stepText += delta;
          visibleText = stepText;
          commit({ text: visibleText, status: 'typing' });
        }
      });
      stepText = stepText || completion.content || '';
      if (stepText) visibleText = stepText;
      const completionAttachments = await normalizeGeneratedAttachments(completion.attachments || []);

      const toolCalls = normalizeToolCalls(completion.toolCalls);
      if (toolCalls.length) {
        const assistantContent = completion.content || stepText || '';
        const assistantToolMessage = {
          role: 'assistant',
          content: assistantContent,
          tool_calls: toolCalls.map(call => ({
            id: call.id,
            type: 'function',
            function: {
              name: call.name,
              arguments: JSON.stringify(call.arguments || {})
            }
          }))
        };
        const toolMessages = [];
        agentMessages.push(assistantToolMessage);

        for (const call of toolCalls) {
          const entry = toolSet.registry[call.name];
          const traceCallId = createId('trace_call');
          trace = appendToolCall(trace, {
            id: traceCallId,
            clientName: entry?.client?.name || 'MCP',
            toolName: entry?.toolName || call.name,
            args: call.arguments || {},
            status: 'running',
            result: ''
          });
          commit({ text: visibleText, status: 'typing' });
          try {
            if (!entry) throw new Error(`未找到工具映射：${call.name}`);
            const result = await callMcpToolByRegistryEntry(entry, call.arguments || {});
            const resultText = formatMcpContentText(result);
            const resultAttachments = await extractMcpResultAttachments(result, entry?.toolName || call.name, call.arguments || {});
            if (resultAttachments.length) toolOutputAttachments.push(...resultAttachments);
            trace = updateToolCall(trace, traceCallId, {
              status: 'success',
              result: resultText,
              attachments: resultAttachments.map(summarizeAttachmentForTrace)
            });
            toolMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: [
                resultText || JSON.stringify(result),
                resultAttachments.length
                  ? `附件：${resultAttachments.map(item => item.name || item.mime || item.type || '附件').join('、')}`
                  : ''
              ].filter(Boolean).join('\n\n')
            });
          } catch (error) {
            const message = error?.message || 'MCP 工具调用失败';
            trace = updateToolCall(trace, traceCallId, {
              status: 'error',
              result: message
            });
            toolMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: `工具调用失败：${message}`
            });
          }
          commit({ text: visibleText, status: 'typing' });
        }

        agentMessages.push(...toolMessages);
        toolCallCount += toolCalls.length;
        trace = setTraceResumeState(trace, {
          userText: resumeUserText,
          messages: agentMessages,
          stepCount: previousStepCount + stepCount,
          toolCallCount,
          selectedClientIds
        });
        agentMessagesForResume = agentMessages;
        trace = updateThought(trace, '工具结果已返回，正在判断是否还需要继续调用工具。', 'running');
        commit({ text: visibleText, status: 'typing' });
        continue;
      }

      if (shouldContinueToolLoop(stepText, { availableToolCount: availableTools.length, toolCallCount })) {
        agentMessages.push({ role: 'assistant', content: stepText || '' });
        agentMessages.push({
          role: 'system',
          content: buildToolContinuationInstruction(text, stepText)
        });
        trace = setTraceResumeState(trace, {
          userText: resumeUserText,
          messages: agentMessages,
          stepCount: previousStepCount + stepCount,
          toolCallCount,
          selectedClientIds
        });
        agentMessagesForResume = agentMessages;
        trace = updateThought(trace, '模型输出了中间话术，正在继续工具流程。', 'running');
        commit({ text: visibleText, status: 'typing' });
        continue;
      }

      finalText = stepText;
      finalAttachments = mergeToolAttachments(completionAttachments, toolOutputAttachments);
      break;
    }

    if (!finalText && !finalAttachments.length) {
      finalText = visibleText;
      if (stepCount >= MAX_TOOL_AGENT_STEPS) {
        trace = markTraceInterrupted(appendThought(trace, `已达到 ${MAX_TOOL_AGENT_STEPS} 步工具调用上限，本轮已暂停。发送“继续”可以从当前中断点续跑。`, 'error'));
      }
    }
    if (!finalAttachments.length && toolOutputAttachments.length) {
      finalAttachments = mergeToolAttachments(toolOutputAttachments).slice(0, 8);
    }

    const reply = sanitizeReply(finalText, character.name, { allowEmpty: finalAttachments.length > 0 });
    trace = setTraceResumeState(trace, {
      userText: resumeUserText,
      messages: agentMessagesForResume.length ? agentMessagesForResume : agentMessages,
      stepCount: previousStepCount + stepCount,
      toolCallCount,
      selectedClientIds
    });
    trace = finishTrace(trace, trace.interrupted
      ? '本轮工具对话已中断，可发送“继续”从中断点续跑。'
      : '本轮工具对话已完成。');
    commit({
      text: reply,
      attachments: finalAttachments.map(prepareToolAttachmentForPersistence),
      status: 'sent',
      createdAt: now()
    });
    if (!trace.interrupted) {
      recordLongTermMemoryTurn({
        source: 'private',
        characterId: character.id,
        characterName: character.name,
        userText: text,
        assistantText: reply,
        sourceMessageIds: [userMessage?.id, typingId].filter(Boolean)
      });
    }
    return reply;
  } catch (error) {
    if (agentMessagesForResume.length) {
      trace = setTraceResumeState(trace, {
        userText: resumeUserText,
        messages: agentMessagesForResume,
        stepCount: previousStepCount + stepCount,
        toolCallCount,
        selectedClientIds
      });
    }
    trace = markTraceInterrupted(trace);
    trace = finishTrace(appendThought(trace, error?.message || '工具对话失败', 'error'), '本轮工具对话异常中断，可发送“继续”从中断点续跑。');
    const fallback = `工具调用流程失败：${error?.message || '未知错误'}`;
    commit({ text: fallback, status: 'error', createdAt: now() });
    return fallback;
  }
}

async function buildToolMessages({ store, conversation, character, userText, userMessage, toolSummary }) {
  const settings = getSettings();
  const advanced = getAdvancedSettings();
  const history = getConversationMessages(store, conversation.id)
    .filter(item => item.status !== 'typing')
    .filter(item => shouldKeepMessageForCurrentDeepSeekMode(item, settings));
  const intimateMessage = await buildDeepSeekIntimateUserMessage(settings);
  const ragMessage = await buildRagReferenceMessage({
    mode: 'private',
    query: userText,
    userText,
    history
  });
  const memoryMessage = await buildLongTermMemoryMessage({
    mode: 'private',
    characterId: character.id,
    characterName: character.name,
    query: userText,
    userText,
    history
  });
  const system = [
    '你正在一个 QQ / Telegram 风格的角色扮演聊天软件中发言。',
    `本次你只扮演：${character.name}。不要代替用户或其他角色发言。`,
    '这是启用了外部工具调用的私聊。你可以在确有必要时调用 MCP 工具；工具状态会显示给用户。',
    '当用户目标需要外部系统、文件、网页、数据库、运行环境、设备能力或任意已暴露 MCP 工具才能完成时，请根据工具名称、描述和参数 schema 选择合适工具调用；不要只用文字描述你会怎么做。',
    '如果任务还没有完成，你必须继续发起 tool_calls。不要在“我继续处理”“下一步我会操作”“要我继续吗”这类中间话术后停止，也不要要求用户再次确认本来可以继续用工具完成的步骤。',
    '只有在用户目标已经完成、工具明确不可用、权限被拒绝或达到无法继续的错误条件时，才输出最终回复。',
    '工具调用过程中的思考、参数和结果不会进入长期记忆，也不要把内部 JSON 当作最终回复。',
    toolSummary,
    `你的完整人格设定如下：\n${character.prompt || `你正在扮演 ${character.name}。`}`,
    character.examples ? `示例对话：\n${character.examples}` : ''
  ].filter(Boolean).join('\n\n');
  const currentMessageId = userMessage?.id || '';
  const recent = await Promise.all(history
    .filter(item => !currentMessageId || item.id !== currentMessageId)
    .slice(-advanced.historyLimit)
    .map(async item => ({
      role: item.role === 'assistant' ? 'assistant' : item.role === 'system' ? 'system' : 'user',
      content: await buildModelMessageContent({
        speakerName: item.speakerName || (item.role === 'user' ? PLAYER_NAME : character.name),
        text: item.text || '',
        attachments: item.meta?.voiceReply === true || item.meta?.toolMode === true ? [] : (item.attachments || [])
      })
    })));
  const currentUserContent = await buildModelMessageContent({
    speakerName: PLAYER_NAME,
    text: userText,
    attachments: userMessage?.attachments || []
  });
  return [
    { role: 'system', content: system },
    ...(ragMessage ? [ragMessage] : []),
    ...(memoryMessage ? [memoryMessage] : []),
    ...(intimateMessage ? [intimateMessage] : []),
    ...recent,
    { role: 'user', content: currentUserContent }
  ];
}

async function requestToolAwareCompletion({ settings, messages, tools = [], toolChoice = 'auto', onDelta }) {
  const provider = getDefaultChatProvider(settings);
  if (!provider?.apiKey || !provider?.baseUrl || !provider?.model) {
    throw new Error('模型连接配置不完整，请检查默认模型设置。');
  }
  const body = {
    model: provider.model,
    messages,
    temperature: settings.temperature,
    stream: true,
    ...(tools.length ? { tools, tool_choice: toolChoice } : {})
  };
  const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`API 请求失败 (${response.status}): ${errorBody || response.statusText}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json') || !response.body) {
    const json = await response.json();
    return extractJsonCompletion(json);
  }
  return readStreamingCompletion(response, onDelta);
}

async function readStreamingCompletion(response, onDelta) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  const toolCalls = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      const clean = line.trim();
      if (!clean || clean === 'data: [DONE]') continue;
      const payload = clean.startsWith('data:') ? clean.slice(5).trim() : clean;
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta || {};
        if (delta.content) {
          content += delta.content;
          onDelta?.(delta.content);
        }
        if (Array.isArray(delta.tool_calls)) mergeToolCallDeltas(toolCalls, delta.tool_calls);
      } catch {
        content += payload;
        onDelta?.(payload);
      }
    }
  }
  return { content, toolCalls, attachments: [] };
}

function extractJsonCompletion(json) {
  const message = json?.choices?.[0]?.message || {};
  return {
    content: extractMessageText(message.content || json?.output_text || ''),
    toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
    attachments: extractMessageAttachments(message, json)
  };
}

function extractMessageText(content) {
  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === 'string') return part;
      if (part?.type === 'text' || part?.type === 'output_text' || part?.type === 'input_text') {
        return part.text || part.content || '';
      }
      return '';
    }).filter(Boolean).join('\n');
  }
  return String(content || '');
}

function extractMessageAttachments(message = {}, json = {}) {
  const attachments = [];
  const content = Array.isArray(message.content) ? message.content : [];
  for (const part of content) {
    const attachment = attachmentFromContentPart(part);
    if (attachment) attachments.push(attachment);
  }
  if (message.audio?.data) {
    attachments.push({
      type: 'audio',
      name: message.audio.name || 'assistant-audio',
      mime: message.audio.mime_type || message.audio.mimeType || 'audio/wav',
      dataUrl: base64ToDataUrl(message.audio.data, message.audio.mime_type || message.audio.mimeType || 'audio/wav')
    });
  }
  const output = Array.isArray(json.output) ? json.output : [];
  for (const item of output) {
    const outputContent = Array.isArray(item?.content) ? item.content : [];
    for (const part of outputContent) {
      const attachment = attachmentFromContentPart(part);
      if (attachment) attachments.push(attachment);
    }
  }
  return attachments;
}

function attachmentFromContentPart(part = {}) {
  if (!part || typeof part !== 'object') return null;
  const type = String(part.type || '').toLowerCase();
  if (type.includes('image')) {
    const imageUrl = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
    return {
      type: 'image',
      name: part.name || 'image',
      mime: part.mimeType || part.mime_type || 'image/png',
      dataUrl: part.data ? base64ToDataUrl(part.data, part.mimeType || part.mime_type || 'image/png') : (isDataUrl(imageUrl) ? imageUrl : ''),
      url: imageUrl && !isDataUrl(imageUrl) ? imageUrl : ''
    };
  }
  if (type.includes('audio')) {
    const audioUrl = typeof part.audio_url === 'string' ? part.audio_url : part.audio_url?.url;
    return {
      type: 'audio',
      name: part.name || 'audio',
      mime: part.mimeType || part.mime_type || 'audio/wav',
      dataUrl: part.data ? base64ToDataUrl(part.data, part.mimeType || part.mime_type || 'audio/wav') : (isDataUrl(audioUrl) ? audioUrl : ''),
      url: audioUrl && !isDataUrl(audioUrl) ? audioUrl : '',
      duration: Number(part.duration) || 0
    };
  }
  if (type.includes('file') || part.file || part.file_data) {
    const file = part.file || part.file_data || {};
    const fileUrl = file.url || part.url || '';
    const mime = file.mimeType || file.mime_type || part.mimeType || part.mime_type || 'application/octet-stream';
    return {
      type: 'file',
      name: file.filename || file.name || part.name || 'attachment',
      mime,
      size: Number(file.size || part.size) || 0,
      dataUrl: file.data ? base64ToDataUrl(file.data, mime) : (isDataUrl(fileUrl) ? fileUrl : ''),
      url: fileUrl && !isDataUrl(fileUrl) ? fileUrl : ''
    };
  }
  return null;
}

function mergeToolCallDeltas(toolCalls, deltas) {
  for (const delta of deltas) {
    const index = Number(delta.index) || 0;
    if (!toolCalls[index]) {
      toolCalls[index] = {
        id: delta.id || createId('tool_call'),
        type: 'function',
        function: { name: '', arguments: '' }
      };
    }
    if (delta.id) toolCalls[index].id = delta.id;
    if (delta.function?.name) toolCalls[index].function.name += delta.function.name;
    if (delta.function?.arguments) toolCalls[index].function.arguments += delta.function.arguments;
  }
}

function normalizeToolCalls(toolCalls = []) {
  return toolCalls.map(call => {
    const name = call?.function?.name || call?.name || '';
    const rawArgs = call?.function?.arguments ?? call?.arguments ?? '{}';
    return {
      id: call.id || createId('tool_call'),
      name,
      arguments: parseToolArguments(rawArgs)
    };
  }).filter(call => call.name);
}

function parseToolArguments(value) {
  if (value && typeof value === 'object') return value;
  const source = String(value || '').trim();
  if (!source) return {};
  try {
    return JSON.parse(source);
  } catch {
    return { input: source };
  }
}

async function extractMcpResultAttachments(result, toolName = 'tool', args = {}) {
  const content = Array.isArray(result?.content) ? result.content : [];
  const raw = [];
  for (const item of content) {
    const attachment = attachmentFromMcpContent(item, toolName);
    if (attachment) raw.push(attachment);
  }
  raw.push(...extractChangedFileAttachments(result, toolName));
  raw.push(...extractFileReferenceAttachments(formatMcpContentText(result), args, toolName));
  return mergeToolAttachments(await normalizeGeneratedAttachments(raw));
}

function attachmentFromMcpContent(item = {}, toolName = 'tool') {
  if (!item || typeof item !== 'object') return null;
  const type = String(item.type || '').toLowerCase();
  if (type === 'image') {
    const mime = item.mimeType || item.mime_type || item.mime || 'image/png';
    return {
      type: 'image',
      name: item.name || `${toolName}-image`,
      mime,
      dataUrl: item.data ? base64ToDataUrl(item.data, mime) : '',
      url: isLocalFileReference(item.url) ? '' : item.url || '',
      path: normalizeLocalFileReference(item.path || item.filePath || item.file_path || item.url || '')
    };
  }
  if (type === 'audio') {
    const mime = item.mimeType || item.mime_type || item.mime || 'audio/wav';
    return {
      type: 'audio',
      name: item.name || `${toolName}-audio`,
      mime,
      dataUrl: item.data ? base64ToDataUrl(item.data, mime) : '',
      url: isLocalFileReference(item.url) ? '' : item.url || '',
      path: normalizeLocalFileReference(item.path || item.filePath || item.file_path || item.url || ''),
      duration: Number(item.duration) || 0
    };
  }
  if (type === 'resource') {
    const resource = item.resource || {};
    const mime = resource.mimeType || resource.mime_type || item.mimeType || item.mime_type || 'application/octet-stream';
    const uri = resource.uri || item.uri || '';
    const path = normalizeLocalFileReference(resource.path || item.path || uri);
    const name = resource.name || fileNameFromUri(path || uri) || `${toolName}-resource`;
    const data = resource.blob || resource.data || item.blob || item.data || '';
    const text = typeof resource.text === 'string' ? resource.text : '';
    return {
      type: attachmentTypeFromMime(mime),
      name,
      mime,
      dataUrl: data ? base64ToDataUrl(data, mime) : (text ? textToDataUrl(text, mime || 'text/plain') : ''),
      url: !data && !text && !path ? uri : '',
      path
    };
  }
  if (item.data || item.blob || item.dataBase64 || item.data_base64 || item.dataUrl || item.url || item.uri || item.path || item.filePath || item.file_path) {
    const path = normalizeLocalFileReference(item.path || item.filePath || item.file_path || item.url || item.uri || '');
    const name = item.name || fileNameFromUri(path || item.url || item.uri) || `${toolName}-attachment`;
    const mime = item.mimeType || item.mime_type || item.mime || inferMimeFromName(name) || 'application/octet-stream';
    const data = item.data || item.blob || item.dataBase64 || item.data_base64 || '';
    return {
      type: attachmentTypeFromMime(mime),
      name,
      mime,
      dataUrl: item.dataUrl || item.data_url || (data ? base64ToDataUrl(data, mime) : ''),
      url: !path ? item.url || item.uri || '' : '',
      path
    };
  }
  return null;
}

function extractChangedFileAttachments(result, toolName = 'tool') {
  const candidates = [
    result?.changedFiles,
    result?.changed_files,
    result?.files,
    result?.metadata?.changedFiles,
    result?.metadata?.changed_files
  ].filter(Array.isArray).flat();
  return candidates
    .map(file => normalizeChangedFileAttachment(file, toolName))
    .filter(Boolean);
}

function normalizeChangedFileAttachment(file = {}, toolName = 'tool') {
  if (!file || typeof file !== 'object') return null;
  const rawPath = file.path || file.filePath || file.file_path || file.localPath || file.local_path || file.uri || file.url || '';
  const path = normalizeLocalFileReference(rawPath);
  const remoteUrl = !path ? String(file.url || file.uri || '').trim() : '';
  const name = file.name || fileNameFromUri(path || remoteUrl) || `${toolName}-file`;
  const mime = file.mime || file.mimeType || file.mime_type || inferMimeFromName(name || path || remoteUrl) || 'application/octet-stream';
  const data = file.dataBase64 || file.data_base64 || file.base64 || file.data || file.blob || '';
  const dataUrl = file.dataUrl || file.data_url || (data ? base64ToDataUrl(data, mime) : '');
  const text = typeof file.text === 'string' ? file.text : '';
  return {
    id: file.id || '',
    type: ['image', 'audio', 'file'].includes(file.type) ? file.type : attachmentTypeFromMime(mime),
    name,
    mime,
    size: Number(file.size) || 0,
    duration: Number(file.duration) || 0,
    dataUrl: dataUrl || (text ? textToDataUrl(text, mime || 'text/plain') : ''),
    url: remoteUrl,
    path,
    source: file.source || 'mcp-changed-file'
  };
}

function extractFileReferenceAttachments(resultText = '', args = {}, toolName = 'tool') {
  const refs = [];
  collectFileReferencesFromText(resultText, refs);
  collectFileReferencesFromValue(args, refs);
  return dedupeRawAttachments(refs).map(reference => {
    const name = fileNameFromUri(reference) || `${toolName}-file`;
    const mime = inferMimeFromName(name || reference) || 'application/octet-stream';
    return {
      type: attachmentTypeFromMime(mime),
      name,
      mime,
      path: normalizeLocalFileReference(reference) || reference,
      source: 'mcp-file-reference'
    };
  });
}

function collectFileReferencesFromText(text = '', refs = []) {
  const source = String(text || '');
  const patterns = [
    /file:\/\/\/?[^\s"'<>]+/gi,
    /[A-Za-z]:[\\/][^\s"'<>|]+/g,
    /(?:^|[\s"'(])((?:\/[^\/\s"'<>|]+)+\.[A-Za-z0-9]{1,12})/g,
    /[\w\u4e00-\u9fa5 .()[\]-]+\.(?:png|jpe?g|webp|gif|bmp|svg|mp3|wav|ogg|m4a|flac|aac|pdf|json|txt|csv|zip|7z|tar|gz|apk|docx?|xlsx?|pptx?)/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const value = String(match[1] || match[0] || '').trim().replace(/^[\s"'(]+|[\s"')，。；,;]+$/g, '');
      if (looksLikeFileReference(value)) refs.push(value);
    }
  }
  return refs;
}

function collectFileReferencesFromValue(value, refs = [], key = '') {
  if (Array.isArray(value)) {
    value.forEach(item => collectFileReferencesFromValue(item, refs, key));
    return refs;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([childKey, childValue]) => collectFileReferencesFromValue(childValue, refs, childKey));
    return refs;
  }
  if (typeof value !== 'string') return refs;
  const source = value.trim();
  if (!source) return refs;
  if (looksLikeFileReference(source) || /file|path|name|output|save|screenshot/i.test(key)) {
    collectFileReferencesFromText(source, refs);
    if (looksLikeFileReference(source)) refs.push(source);
  }
  return refs;
}

function dedupeRawAttachments(values = []) {
  const seen = new Set();
  return values.filter(value => {
    const key = String(value || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function normalizeGeneratedAttachments(attachments = []) {
  const normalized = [];
  for (const raw of attachments) {
    const attachment = normalizeToolAttachment(raw);
    if (!attachment) continue;
    if (attachment.dataUrl && isDataUrl(attachment.dataUrl)) {
      try {
        const media = await saveDataUrlAsMedia(attachment.dataUrl, {
          category: 'tool-output',
          prefix: 'mcp_att',
          name: attachment.name,
          mime: attachment.mime,
          size: attachment.size
        });
        normalized.push({
          ...attachment,
          dataRef: media.ref,
          dataUrl: media.dataUrl,
          mime: attachment.mime || media.mime,
          size: attachment.size || media.size
        });
        continue;
      } catch {}
    }
    normalized.push(attachment);
  }
  return normalized;
}

function normalizeToolAttachment(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const rawPath = String(raw.path || raw.filePath || raw.file_path || raw.localPath || raw.local_path || '').trim();
  const path = normalizeLocalFileReference(rawPath) || (rawPath && !/^https?:\/\//i.test(rawPath) ? rawPath : '');
  const url = path ? '' : raw.url || raw.uri || '';
  const name = raw.name || fileNameFromUri(path || url) || defaultAttachmentName(raw.type, raw.mime || raw.mimeType || raw.mime_type || '');
  const mime = raw.mime || raw.mimeType || raw.mime_type || mimeFromDataUrl(raw.dataUrl || raw.data_url || '') || inferMimeFromName(name || path || url) || '';
  const type = ['image', 'audio', 'file'].includes(raw.type) ? raw.type : attachmentTypeFromMime(mime);
  const data = raw.dataBase64 || raw.data_base64 || raw.base64 || raw.data || raw.blob || '';
  const dataUrl = raw.dataUrl || raw.data_url || (data ? base64ToDataUrl(data, mime) : '');
  if (!dataUrl && !url && !raw.dataRef && !path) return null;
  return {
    id: raw.id || createId('att'),
    type,
    name,
    mime,
    size: Number(raw.size) || estimateDataUrlSize(dataUrl),
    duration: Number(raw.duration) || 0,
    dataRef: raw.dataRef || '',
    dataUrl,
    url,
    path,
    source: raw.source || ''
  };
}

function prepareToolAttachmentForPersistence(attachment = {}) {
  const next = { ...attachment };
  if (next.dataRef) next.dataUrl = '';
  return next;
}

function summarizeAttachmentForTrace(attachment = {}) {
  return {
    type: attachment.type || 'file',
    name: attachment.name || attachment.mime || '附件',
    mime: attachment.mime || '',
    size: Number(attachment.size) || 0,
    path: attachment.path || ''
  };
}

function mergeToolAttachments(...groups) {
  const flattened = groups.flat().filter(Boolean);
  const seen = new Set();
  return flattened.filter(attachment => {
    const key = attachment.dataRef
      || attachment.url
      || attachment.path
      || (attachment.dataUrl ? attachment.dataUrl.slice(0, 160) : '')
      || `${attachment.name || ''}:${attachment.mime || ''}:${attachment.size || ''}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shouldContinueToolLoop(replyText, context = {}) {
  if (!context.availableToolCount) return false;
  const source = String(replyText || '').trim();
  const compact = compactText(replyText);
  if (!compact) return context.toolCallCount > 0;
  const chinesePatterns = [
    /要我.*?(继续|再|帮你|替你|给你).*?(点|点击|打开|搜索|搜|查|读取|分析|运行|执行|输入|提交|访问)/,
    /如果你.*?(要|需要|愿意).*?(我|就|可以).*?(继续|点|点击|打开|搜索|搜|查|读取|分析|运行|执行|输入|提交|访问)/,
    /我.*?(会|将|准备|现在|接着|继续|再|帮你|替你).*?(继续|下一步|点|点击|打开|搜索|搜|查|读取|分析|运行|执行|输入|提交|访问|进入)/,
    /(下一步|接下来|然后).*?(我|需要|就是|会|要).*?(点|点击|打开|搜索|搜|查|读取|分析|运行|执行|输入|提交|访问|进入)/,
    /(先|已经).*?(打开|进入|搜索|搜|读取|获取).*?(然后|接着|继续|下一步|再)/,
    /(做完|处理完|跑完|查完).*?(给你|回来|告诉你|汇报)/
  ];
  const englishPatterns = [
    /\b(if you want|shall i|should i|want me to)\b.*?\b(continue|click|open|search|read|analyze|run|execute|submit|visit)\b/i,
    /\b(i will|i'll|let me|next i|then i)\b.*?\b(continue|click|open|search|read|analyze|run|execute|submit|visit)\b/i
  ];
  return chinesePatterns.some(pattern => pattern.test(compact))
    || englishPatterns.some(pattern => pattern.test(source));
}

function buildToolContinuationInstruction(userText, previousReply) {
  return [
    '上一条 assistant 内容不是最终回复，而是工具流程中的中间话术。',
    '不要等待用户继续，不要询问“是否继续”，现在必须根据用户原始目标继续调用可用 MCP 工具。',
    `用户原始目标：${String(userText || '').trim()}`,
    `上一条中间话术：${String(previousReply || '').trim()}`
  ].join('\n');
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, '');
}

function isDataUrl(value) {
  return String(value || '').startsWith('data:');
}

function base64ToDataUrl(data, mime = 'application/octet-stream') {
  const source = String(data || '');
  if (!source) return '';
  if (isDataUrl(source)) return source;
  return `data:${mime || 'application/octet-stream'};base64,${source}`;
}

function textToDataUrl(text, mime = 'text/plain') {
  return `data:${mime || 'text/plain'};charset=utf-8,${encodeURIComponent(String(text || ''))}`;
}

function estimateDataUrlSize(dataUrl) {
  const payload = String(dataUrl || '').split(',')[1] || '';
  if (!payload) return 0;
  return Math.max(0, Math.floor(payload.length * 0.75));
}

function attachmentTypeFromMime(mime = '') {
  const lower = String(mime || '').toLowerCase();
  if (lower.startsWith('image/')) return 'image';
  if (lower.startsWith('audio/')) return 'audio';
  return 'file';
}

function fileNameFromUri(uri = '') {
  const source = String(uri || '').split(/[?#]/)[0];
  const last = source.split(/[\\/]/).filter(Boolean).pop() || '';
  return decodeURIComponent(last).slice(0, 120);
}

function normalizeLocalFileReference(value = '') {
  const source = String(value || '').trim();
  if (!isLocalFileReference(source)) return '';
  if (/^file:\/\//i.test(source)) {
    try {
      const url = new URL(source);
      const pathname = decodeURIComponent(url.pathname || '');
      if (/^\/[A-Za-z]:\//.test(pathname)) return pathname.slice(1).replace(/\//g, '\\');
      return pathname;
    } catch {
      return source.replace(/^file:\/\//i, '');
    }
  }
  return source;
}

function isLocalFileReference(value = '') {
  const source = String(value || '').trim();
  return /^file:\/\//i.test(source)
    || /^[A-Za-z]:[\\/]/.test(source)
    || /^\/[^/]+/.test(source);
}

function looksLikeFileReference(value = '') {
  const source = String(value || '').trim();
  if (!source || /^https?:\/\//i.test(source)) return false;
  return isLocalFileReference(source) || /\.[A-Za-z0-9]{1,12}(?:$|[?#])/.test(source);
}

function inferMimeFromName(name = '') {
  const lower = String(name || '').split(/[?#]/)[0].toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.7z')) return 'application/x-7z-compressed';
  if (lower.endsWith('.apk')) return 'application/vnd.android.package-archive';
  if (/\.[A-Za-z0-9]{1,12}$/.test(lower)) return 'application/octet-stream';
  return '';
}

function mimeFromDataUrl(dataUrl = '') {
  return /^data:([^;,]+)/.exec(String(dataUrl || ''))?.[1] || '';
}

function defaultAttachmentName(type, mime = '') {
  if (type === 'image') return 'mcp-image';
  if (type === 'audio') return 'mcp-audio';
  if (String(mime).includes('json')) return 'mcp-result.json';
  if (String(mime).startsWith('text/')) return 'mcp-result.txt';
  return 'mcp-attachment';
}

function createInitialTrace(clientIds, resumeState = null) {
  return {
    version: 1,
    collapsed: false,
    clientIds: [...clientIds],
    thoughts: [{
      id: createId('thought'),
      title: '思考中',
      content: resumeState ? '正在从上次中断点继续工具调用。' : '正在判断是否需要调用外部工具。',
      status: 'running',
      createdAt: now()
    }],
    calls: []
  };
}

function getResumableToolState(store, conversationId, text, selectedClientIds = []) {
  if (!RESUME_TEXT_RE.test(String(text || '').trim())) return null;
  const messages = getConversationMessages(store, conversationId);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const trace = messages[index]?.meta?.toolTrace;
    if (!trace?.interrupted || !trace.resumeState?.messages?.length) continue;
    const state = trace.resumeState;
    return {
      ...state,
      selectedClientIds: selectedClientIds.length ? [...selectedClientIds] : [...(state.selectedClientIds || [])]
    };
  }
  return null;
}

function buildResumeInstruction(originalUserText, resumeText, previousStepCount, toolSummary) {
  return [
    '用户要求从上次工具调用中断处继续执行。',
    `原始用户目标：${String(originalUserText || '').trim()}`,
    `本次续跑指令：${String(resumeText || '').trim()}`,
    `中断前已记录步骤数：${Number(previousStepCount) || 0}`,
    toolSummary,
    '请基于上文已有 tool_calls 和 tool 结果继续推进。不要重复已经完成的工具步骤；如果目标尚未完成，继续调用可用 MCP 工具。'
  ].filter(Boolean).join('\n\n');
}

function setTraceResumeState(trace, state = {}) {
  const messages = compactResumeMessages(state.messages || []);
  if (!messages.length) return trace;
  return {
    ...trace,
    resumeState: {
      version: 1,
      userText: String(state.userText || '').slice(0, MAX_RESUME_CONTENT_CHARS),
      messages,
      stepCount: Math.max(0, Number(state.stepCount) || 0),
      toolCallCount: Math.max(0, Number(state.toolCallCount) || 0),
      selectedClientIds: Array.isArray(state.selectedClientIds) ? state.selectedClientIds.map(String) : [],
      updatedAt: now()
    }
  };
}

function compactResumeMessages(messages = []) {
  return messages.slice(-MAX_RESUME_MESSAGES).map(message => {
    const next = {
      role: message.role,
      content: compactResumeContent(message.content)
    };
    if (message.tool_call_id) next.tool_call_id = message.tool_call_id;
    if (Array.isArray(message.tool_calls)) {
      next.tool_calls = message.tool_calls.map(call => ({
        id: call.id,
        type: call.type || 'function',
        function: {
          name: call.function?.name || call.name || '',
          arguments: String(call.function?.arguments ?? call.arguments ?? '{}').slice(0, MAX_RESUME_CONTENT_CHARS)
        }
      }));
    }
    return next;
  }).filter(message => message.role);
}

function compactResumeContent(content) {
  if (Array.isArray(content)) {
    return content.slice(0, 12).map(part => {
      if (!part || typeof part !== 'object') return part;
      if (part.text) return { ...part, text: String(part.text).slice(0, MAX_RESUME_CONTENT_CHARS) };
      if (part.image_url?.url?.startsWith?.('data:')) return { ...part, image_url: { ...part.image_url, url: '[image omitted for resume]' } };
      return part;
    });
  }
  return String(content || '').slice(0, MAX_RESUME_CONTENT_CHARS);
}

function cloneResumeMessages(messages = []) {
  return JSON.parse(JSON.stringify(messages));
}

function markTraceInterrupted(trace) {
  return { ...trace, interrupted: true };
}

function updateThought(trace, content, status = 'running') {
  const thoughts = trace.thoughts.length ? [...trace.thoughts] : [];
  const first = thoughts[0] || { id: createId('thought'), title: '思考中', createdAt: now() };
  thoughts[0] = { ...first, content, status, updatedAt: now() };
  return { ...trace, thoughts };
}

function appendThought(trace, content, status = 'done') {
  return {
    ...trace,
    thoughts: [
      ...trace.thoughts,
      {
        id: createId('thought'),
        title: status === 'error' ? '异常' : '思考中',
        content,
        status,
        createdAt: now()
      }
    ]
  };
}

function appendToolCall(trace, call) {
  return { ...trace, calls: [...trace.calls, { ...call, createdAt: now() }] };
}

function updateToolCall(trace, id, patch) {
  return {
    ...trace,
    calls: trace.calls.map(call => (call.id === id ? { ...call, ...patch, updatedAt: now() } : call))
  };
}

function finishTrace(trace, content) {
  const finished = updateThought(trace, content, trace.interrupted ? 'error' : 'done');
  const next = {
    ...finished,
    collapsed: true,
    calls: finished.calls.map(call => call.status === 'running' ? { ...call, status: 'done' } : call)
  };
  if (next.interrupted) return next;
  const { resumeState, interrupted, ...clean } = next;
  return clean;
}

function sanitizeReply(text = '', speakerName = '', options = {}) {
  let result = String(text || '').trim();
  result = result.replace(/^```(?:json|text)?/i, '').replace(/```$/i, '').trim();
  if (speakerName) {
    const re = new RegExp(`^\\s*(?:${escapeRegExp(speakerName)}|我)\\s*[:：]\\s*`);
    result = result.replace(re, '').trim();
  }
  if (!result && options.allowEmpty) return '';
  return result || '嗯……我在听。';
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}
