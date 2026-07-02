import { getDefaultTtsProvider, getSettings } from './settings.js';
import { inferMimeFromDataUrl, resolveMediaDataUrl } from './llm_media.js';

const MIMO_VOICE_CLONE_FORMAT = 'wav';
const MIMO_VOICE_CLONE_ENDPOINT = 'chat/completions';

export function getActiveTtsProvider(settings = getSettings()) {
  return getDefaultTtsProvider(settings);
}

export async function buildMimoVoiceCloneRequest({ text, voiceSample, provider = getActiveTtsProvider() } = {}) {
  if (!provider) throw new Error('未配置文字转语音提供商源。');
  const input = String(text || '').trim();
  if (!input) throw new Error('文字转语音输入不能为空。');
  if (!voiceSample) throw new Error('mimo-v2.5-tts-voiceclone 需要角色参考声音文件。');
  const baseUrl = String(provider.baseUrl || '').trim().replace(/\/+$/, '');
  if (!provider.apiKey || !baseUrl || !provider.model) throw new Error('文字转语音提供商源配置不完整。');
  const voice = await normalizeVoiceSample(voiceSample);
  const body = {
    model: provider.model,
    messages: [
      {
        role: 'user',
        content: ''
      },
      {
        role: 'assistant',
        content: input
      }
    ],
    audio: {
      format: MIMO_VOICE_CLONE_FORMAT,
      voice
    },
    stream: false
  };
  const url = `${baseUrl}/${MIMO_VOICE_CLONE_ENDPOINT}`;

  return {
    url,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': provider.apiKey
      },
      body: JSON.stringify(body)
    },
    log: buildSafeRequestLog({ url, body, voice })
  };
}

export async function synthesizeMimoVoiceClone({ text, voiceSample, provider = getActiveTtsProvider() } = {}) {
  const request = await buildMimoVoiceCloneRequest({ text, voiceSample, provider });
  let response;
  try {
    response = await fetch(request.url, request.init);
  } catch (error) {
    throw createTtsRequestError(`TTS 网络请求失败：${error?.message || 'Failed to fetch'}`, {
      phase: 'fetch',
      requestLog: request.log,
      cause: error,
      hint: '浏览器在请求层失败。常见原因包括 CORS 预检被拒、网络不可达、Mixed Content，或 API 网关未允许浏览器来源。'
    });
  }
  try {
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw createTtsRequestError(`TTS 请求失败：${response.status} ${body.slice(0, 240)}`, {
        phase: 'response',
        requestLog: request.log,
        responseLog: {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get('content-type') || '',
          bodyPreview: body.slice(0, 1200)
        }
      });
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await response.json();
      return await normalizeTtsJsonResponse(json);
    }
    const blob = await response.blob();
    const mime = contentType.startsWith('audio/')
      ? contentType
      : (blob.type?.startsWith('audio/') ? blob.type : mimeFromAudioFormat(MIMO_VOICE_CLONE_FORMAT));
    const audioBlob = blob.type === mime ? blob : new Blob([blob], { type: mime });
    const dataUrl = await blobToDataUrl(audioBlob);
    return {
      dataUrl,
      mime: inferMimeFromDataUrl(dataUrl) || mime,
      size: audioBlob.size || estimateDataUrlSize(dataUrl)
    };
  } catch (error) {
    if (error?.name === 'TtsRequestError') throw error;
    throw createTtsRequestError(`TTS 响应解析失败：${error?.message || '未知错误'}`, {
      phase: 'parse',
      requestLog: request.log,
      cause: error
    });
  }
}

export function getTtsErrorLog(error) {
  if (error?.rawLog) return error.rawLog;
  return [
    'TTS 原始错误日志',
    `time: ${new Date().toISOString()}`,
    `name: ${error?.name || 'Error'}`,
    `message: ${error?.message || '未知错误'}`,
    error?.stack ? `stack:\n${error.stack}` : ''
  ].filter(Boolean).join('\n\n');
}

async function normalizeVoiceSample(voiceSample) {
  const dataUrl = await resolveMediaDataUrl(voiceSample);
  if (!dataUrl) throw new Error('无法读取角色参考声音文件。');
  const sourceName = typeof voiceSample === 'string'
    ? voiceSample
    : (voiceSample.name || voiceSample.fileName || voiceSample.path || '');
  const currentMime = inferMimeFromDataUrl(dataUrl);
  const normalizedMime = normalizeVoiceMime(currentMime, sourceName);
  return replaceDataUrlMime(dataUrl, normalizedMime);
}

async function normalizeTtsJsonResponse(json) {
  const firstData = Array.isArray(json?.data) ? json.data[0] : null;
  const firstChoice = Array.isArray(json?.choices) ? json.choices[0] : null;
  const messageAudio = firstChoice?.message?.audio || firstChoice?.delta?.audio || null;
  const direct = (typeof json?.audio === 'string' ? json.audio : '')
    || json?.audio?.data
    || json?.audio?.audio
    || messageAudio?.data
    || messageAudio?.audio
    || json?.data?.audio
    || firstData?.audio
    || json?.audio_data
    || json?.data?.audio_data
    || firstData?.audio_data
    || json?.b64_json
    || json?.data?.b64_json
    || firstData?.b64_json
    || json?.result?.audio;
  const url = json?.url
    || json?.data?.url
    || firstData?.url
    || json?.audio_url
    || json?.data?.audio_url
    || firstData?.audio_url;
  const responseFormat = messageAudio?.format || json?.audio?.format || json?.format || MIMO_VOICE_CLONE_FORMAT;
  const mime = json?.mime
    || json?.mime_type
    || json?.data?.mime
    || json?.data?.mime_type
    || messageAudio?.mime
    || messageAudio?.mime_type
    || mimeFromAudioFormat(responseFormat);
  const audio = String(direct || '').trim();
  if (audio) {
    const dataUrl = audio.startsWith('data:') ? audio : `data:${mime};base64,${audio}`;
    return {
      dataUrl,
      mime: inferMimeFromDataUrl(dataUrl) || mime,
      size: estimateDataUrlSize(dataUrl)
    };
  }
  if (url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`读取 TTS 远程音频失败：${response.status}`);
    const blob = await response.blob();
    const audioBlob = blob.type?.startsWith('audio/') ? blob : new Blob([blob], { type: mime });
    const dataUrl = await blobToDataUrl(audioBlob);
    return {
      dataUrl,
      mime: inferMimeFromDataUrl(dataUrl) || mime,
      size: audioBlob.size || estimateDataUrlSize(dataUrl)
    };
  }
  throw new Error('TTS 返回内容中没有可用音频数据。');
}

function createTtsRequestError(message, detail = {}) {
  const error = new Error(message);
  error.name = 'TtsRequestError';
  error.detail = detail;
  error.rawLog = buildErrorLog(message, detail);
  if (detail.cause) error.cause = detail.cause;
  return error;
}

function buildSafeRequestLog({ url, body, voice }) {
  return {
    url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': '[redacted]'
    },
    body: {
      model: body.model,
      messages: body.messages,
      audio: {
        format: body.audio?.format || MIMO_VOICE_CLONE_FORMAT,
        voice: summarizeDataUrl(voice)
      },
      stream: body.stream
    }
  };
}

function buildErrorLog(message, detail = {}) {
  const payload = {
    title: 'TTS 原始错误日志',
    time: new Date().toISOString(),
    message,
    phase: detail.phase || '',
    hint: detail.hint || '',
    request: detail.requestLog || null,
    response: detail.responseLog || null,
    cause: detail.cause
      ? {
        name: detail.cause.name || 'Error',
        message: detail.cause.message || String(detail.cause),
        stack: detail.cause.stack || ''
      }
      : null
  };
  return JSON.stringify(payload, null, 2);
}

function summarizeDataUrl(dataUrl) {
  const source = String(dataUrl || '');
  const mime = inferMimeFromDataUrl(source) || '';
  const payload = source.split(',')[1] || '';
  return {
    mime,
    bytesApprox: estimateDataUrlSize(source),
    base64Chars: payload.length,
    prefix: source.slice(0, Math.min(source.indexOf(',') + 1 || 64, 96)),
    value: '[base64 redacted]'
  };
}

function normalizeVoiceMime(mime, sourceName = '') {
  const lowerMime = String(mime || '').toLowerCase();
  const lowerName = String(sourceName || '').toLowerCase();
  if (lowerMime === 'audio/mp3') return 'audio/mpeg';
  if (lowerMime === 'audio/mpeg' || lowerMime === 'audio/wav' || lowerMime === 'audio/x-wav') {
    return lowerMime === 'audio/x-wav' ? 'audio/wav' : lowerMime;
  }
  if (lowerName.endsWith('.wav')) return 'audio/wav';
  return 'audio/mpeg';
}

function replaceDataUrlMime(dataUrl, mime) {
  return String(dataUrl || '').replace(/^data:[^;,]+/, `data:${mime}`);
}

function mimeFromAudioFormat(format = '') {
  const normalized = String(format || '').toLowerCase();
  if (normalized === 'wav') return 'audio/wav';
  if (normalized === 'pcm16') return 'audio/L16';
  if (normalized === 'mp3') return 'audio/mpeg';
  return 'audio/wav';
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取 TTS 音频失败。'));
    reader.readAsDataURL(blob);
  });
}

function estimateDataUrlSize(dataUrl) {
  const payload = String(dataUrl || '').split(',')[1] || '';
  return Math.max(0, Math.floor(payload.length * 0.75));
}
