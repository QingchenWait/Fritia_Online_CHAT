import { getDefaultChatProvider, getDefaultImageCaptionProvider, getSettings } from './settings.js';

const IMAGE_UNSUPPORTED_RE = /(image|vision|multimodal|image_url|input image|图片|图像).*(unsupported|not supported|不支持|无法|不能)|unsupported.*(image|vision|multimodal|image_url)/i;

export async function requestLlmCompletion({ settings = getSettings(), messages = [], body = {} } = {}) {
  const requestMessages = Array.isArray(messages) && messages.length ? messages : (body.messages || []);
  const needsImages = messagesContainImages(requestMessages);
  const defaultProvider = getDefaultChatProvider(settings);
  const imageProvider = getDefaultImageCaptionProvider(settings);
  const imageSupport = providerImageInputSupport(defaultProvider);
  const primaryProvider = needsImages && imageSupport === false
    ? imageProvider
    : defaultProvider;
  const primaryBody = buildProviderBody(primaryProvider, settings, body, requestMessages);

  try {
    return await fetchCompletion(primaryProvider, primaryBody);
  } catch (error) {
    if (!needsImages || primaryProvider?.id === imageProvider?.id || !isImageUnsupportedError(error)) {
      throw annotateProviderError(error, primaryProvider, needsImages);
    }
    try {
      return await fetchCompletion(imageProvider, buildProviderBody(imageProvider, settings, body, requestMessages));
    } catch (fallbackError) {
      fallbackError.message = `默认图像转述模型请求失败：${fallbackError.message || '未知错误'}`;
      fallbackError.cause = error;
      throw annotateProviderError(fallbackError, imageProvider, needsImages);
    }
  }
}

export function messagesContainImages(messages = []) {
  return flattenMessageContent(messages).some(part => part?.type === 'image_url' || part?.image_url);
}

export function providerSupportsImageInput(provider) {
  return providerImageInputSupport(provider) === true;
}

function providerImageInputSupport(provider) {
  const model = String(provider?.model || '').toLowerCase();
  if (!model) return null;
  if (/(deepseek|text-|embedding|tts|whisper|rerank)/i.test(model)) return false;
  if ([
    /gpt-4(?:o|\.1|\.5|-\d|-[a-z-]*vision|[-\w]*turbo)/,
    /\bo[34](?:-|$)/,
    /vision|multimodal|omni|image|pixtral/,
    /claude-3|claude-sonnet|claude-opus|claude-haiku/,
    /gemini/,
    /mimo-v2\.5/,
    /qwen[\w.-]*(?:vl|omni|vision)/,
    /glm-[\w.-]*v/,
    /internvl/,
    /llama[\w.-]*vision/,
    /minicpm[\w.-]*v/
  ].some(pattern => pattern.test(model))) return true;
  return null;
}

function buildProviderBody(provider, settings, body, messages) {
  if (!provider?.apiKey || !provider?.baseUrl || !provider?.model) {
    throw new Error('模型连接配置不完整，请检查默认模型和默认图像转述模型设置。');
  }
  return {
    ...body,
    model: provider.model,
    messages,
    temperature: body.temperature ?? settings.temperature,
    stream: body.stream ?? false
  };
}

async function fetchCompletion(provider, body) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + provider.apiKey
  };
  if (isXiaomiMimoProvider(provider)) headers['api-key'] = provider.apiKey;
  const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    const error = new Error(`API 请求失败 (${response.status}): ${errorBody}`);
    error.status = response.status;
    error.statusText = response.statusText || '';
    error.body = errorBody;
    throw error;
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await response.json();
    return extractCompletionText(json).trim() || JSON.stringify(json);
  }
  if (!response.body) throw new Error('API 没有返回可读取内容');
  return readCompletionStream(response);
}

function flattenMessageContent(messages = []) {
  const parts = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (Array.isArray(message?.content)) parts.push(...message.content);
  }
  return parts;
}

function extractCompletionText(json) {
  const choice = json?.choices?.[0];
  return choice?.message?.content
    || choice?.delta?.content
    || choice?.text
    || json?.output_text
    || '';
}

async function readCompletionStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';
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
        output += extractCompletionText(JSON.parse(payload));
      } catch {
        output += payload;
      }
    }
  }
  return output.trim();
}

function isImageUnsupportedError(error) {
  const message = `${error?.message || ''}\n${error?.body || ''}`;
  return IMAGE_UNSUPPORTED_RE.test(message);
}

function annotateProviderError(error, provider, needsImages) {
  error.providerId = provider?.id || '';
  error.model = provider?.model || '';
  error.usedForImageRequest = Boolean(needsImages);
  return error;
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function isXiaomiMimoProvider(provider) {
  try {
    return new URL(String(provider?.baseUrl || '')).hostname.toLowerCase().endsWith('xiaomimimo.com');
  } catch {
    return /xiaomimimo\.com/i.test(String(provider?.baseUrl || ''));
  }
}
