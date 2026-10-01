/**
 * LM Studio's browser-only OpenAI-compatible transport.
 *
 * This module intentionally owns all localhost/LAN handling so the existing
 * online provider transport can remain unchanged. A provider is considered a
 * local LM Studio provider when its configured base URL contains localhost or
 * 127.0.0.1 (including IPv6 loopback).
 */

import { getReasoningFields, mergeReasoningDelta } from './model_reasoning.js';

const LOCAL_HOST_RE = /localhost|127\.0\.0\.1|\[::1\]/i;
const MODEL_CATALOG_CACHE = new Map();

export function isLmStudioProvider(provider = {}) {
  return LOCAL_HOST_RE.test(String(provider?.baseUrl || '').trim());
}

export function isLmStudioSettings(settings = {}) {
  const provider = getSelectedProvider(settings);
  return isLmStudioProvider(provider || settings);
}

export function getSelectedProvider(settings = {}) {
  const providers = Array.isArray(settings?.chatProviders) ? settings.chatProviders : [];
  return providers.find(item => item.id === settings?.defaultChatProviderId)
    || providers[0]
    || settings;
}

export function getLmStudioReasoningProfile() {
  return {
    id: 'lm-studio',
    defaultValue: 'default',
    requestMode: 'default',
    options: [{ value: 'default', label: '普通', level: 1 }]
  };
}

export async function testLmStudioConnection(provider = {}, { signal } = {}) {
  if (!isLmStudioProvider(provider)) {
    throw new Error('当前模型不是 LM Studio 本地端点。');
  }
  const baseUrl = normalizeBaseUrl(provider.baseUrl);
  if (!baseUrl) throw new Error('LM Studio Base URL 为空。');
  const response = await localFetch(`${baseUrl}/models`, { method: 'GET', signal });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`LM Studio 连接失败 (${response.status})${detail ? `：${detail.slice(0, 240)}` : ''}`);
  }
  const catalog = await response.json().catch(() => ({}));
  cacheLmStudioModels(baseUrl, catalog);
  return catalog;
}

export async function requestLmStudioCompletion({
  provider = {},
  messages = [],
  body = {},
  signal = null,
  onDelta
} = {}) {
  if (!isLmStudioProvider(provider)) throw new Error('当前模型不是 LM Studio 本地端点。');
  const model = await resolveLmStudioModel(provider, signal);
  const requestBody = {
    ...body,
    model,
    // LM Studio Bionic's chat templates require one system block at the
    // beginning of the conversation. The app may keep personality, RAG,
    // memory and mode instructions as separate system messages; normalize
    // that shape only for this local transport so online providers receive
    // the original message array unchanged.
    messages: normalizeLmStudioMessages(messages)
  };
  const headers = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  const response = await localFetch(`${normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    signal
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const error = new Error(`LM Studio 请求失败 (${response.status}): ${detail || response.statusText}`);
    error.status = response.status;
    error.body = detail;
    throw error;
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json') || !response.body || requestBody.stream === false) {
    return extractJsonCompletion(await response.json());
  }
  return readStreamingCompletion(response, onDelta, signal);
}

async function resolveLmStudioModel(provider, signal) {
  const configured = String(provider?.model || '').trim();
  if (!configured) return configured;
  const baseUrl = normalizeBaseUrl(provider.baseUrl);
  let catalog = MODEL_CATALOG_CACHE.get(baseUrl);
  if (!catalog) {
    try {
      const response = await localFetch(`${baseUrl}/models`, { method: 'GET', signal });
      if (response.ok) {
        catalog = await response.json().catch(() => ({}));
        cacheLmStudioModels(baseUrl, catalog);
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
    }
  }
  const models = Array.isArray(catalog?.data) ? catalog.data : [];
  const match = models.find(item => modelKey(item?.id) === modelKey(configured));
  return String(match?.id || configured);
}

function cacheLmStudioModels(baseUrl, catalog) {
  if (Array.isArray(catalog?.data)) MODEL_CATALOG_CACHE.set(baseUrl, catalog);
}

function modelKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function normalizeLmStudioMessages(messages = []) {
  const source = Array.isArray(messages) ? messages : [];
  const systemMessages = source.filter(message => message?.role === 'system');
  if (systemMessages.length <= 1 && (systemMessages.length === 0 || source[0]?.role === 'system')) {
    return source;
  }

  const mergedSystem = {
    ...systemMessages[0],
    role: 'system',
    content: mergeSystemContents(systemMessages)
  };
  return [mergedSystem, ...source.filter(message => message?.role !== 'system')];
}

function mergeSystemContents(messages) {
  const contents = messages
    .map(message => message?.content)
    .filter(content => content !== undefined && content !== null && content !== '');
  if (contents.every(content => typeof content === 'string')) {
    return contents.join('\n\n');
  }
  const parts = [];
  contents.forEach((content, index) => {
    if (index > 0) parts.push({ type: 'text', text: '\n\n' });
    if (Array.isArray(content)) {
      parts.push(...content);
    } else {
      parts.push({ type: 'text', text: String(content) });
    }
  });
  return parts;
}

async function localFetch(url, init = {}) {
  // Chromium's Local Network Access permission is requested by this fetch when
  // a public Page deployment reaches localhost. Older runtimes ignore the
  // option, while browsers that do not accept it use the compatibility retry.
  const candidates = localEndpointCandidates(url);
  let lastError = null;
  for (const candidate of candidates) {
    const targetAddressSpace = getTargetAddressSpace(candidate);
    try {
      return await fetch(candidate, { ...init, mode: 'cors', targetAddressSpace });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      lastError = error;
    }
  }
  const error = new Error(
    '无法访问 LM Studio 本地 API。请确认使用 http://localhost:1234/v1（不要使用 https），'
      + '并在 LM Studio / Bionic 的 Local Model API 中开启 CORS。'
  );
  error.cause = lastError;
  throw error;
}

function getTargetAddressSpace(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
      ? 'loopback'
      : 'local';
  } catch {
    return 'local';
  }
}

function localEndpointCandidates(url) {
  const value = String(url || '');
  if (!/^https:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(value)) return [value];
  // LM Studio and Bionic expose their local server over plain HTTP by
  // default. Prefer that endpoint when HTTPS was entered accidentally, then
  // retain HTTPS as a fallback for users who configured local TLS.
  return [value.replace(/^https:/i, 'http:'), value];
}

async function readStreamingCompletion(response, onDelta, signal = null) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  const reasoning = {};
  const toolCalls = [];
  while (true) {
    if (signal?.aborted) throw abortError();
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      const clean = line.trim();
      if (!clean || clean === 'data: [DONE]') continue;
      if (/^(?:event:|id:|retry:|:)/.test(clean)) continue;
      const payload = clean.startsWith('data:') ? clean.slice(5).trim() : clean;
      try {
        const delta = JSON.parse(payload)?.choices?.[0]?.delta || {};
        mergeReasoningDelta(reasoning, delta);
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
  const tail = buffer.trim();
  if (tail && tail !== 'data: [DONE]') {
    const payload = tail.startsWith('data:') ? tail.slice(5).trim() : tail;
    try {
      const delta = JSON.parse(payload)?.choices?.[0]?.delta || {};
      mergeReasoningDelta(reasoning, delta);
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
  return { content, toolCalls, attachments: [], ...reasoning };
}

function extractJsonCompletion(json = {}) {
  const message = json?.choices?.[0]?.message || {};
  return {
    ...getReasoningFields(message),
    content: extractMessageText(message.content || json?.output_text || ''),
    toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
    attachments: []
  };
}

function extractMessageText(content) {
  if (Array.isArray(content)) {
    return content.map(part => typeof part === 'string' ? part : (part?.text || part?.content || '')).filter(Boolean).join('\n');
  }
  return String(content || '');
}

function mergeToolCallDeltas(toolCalls, deltas) {
  for (const delta of deltas) {
    const index = Number(delta.index) || 0;
    if (!toolCalls[index]) {
      toolCalls[index] = { id: delta.id || `lm_tool_${index}`, type: 'function', function: { name: '', arguments: '' } };
    }
    if (delta.id) toolCalls[index].id = delta.id;
    if (delta.type) toolCalls[index].type = delta.type;
    if (delta.function?.name) toolCalls[index].function.name += delta.function.name;
    if (delta.function?.arguments) toolCalls[index].function.arguments += delta.function.arguments;
  }
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function abortError() {
  const error = new Error('请求已取消');
  error.name = 'AbortError';
  return error;
}
