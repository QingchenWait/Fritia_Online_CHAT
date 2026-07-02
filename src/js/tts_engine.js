import { getDefaultTtsProvider, getSettings } from './settings.js';
import { inferMimeFromDataUrl, resolveMediaDataUrl } from './llm_media.js';

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

  return {
    url: `${baseUrl}/audio/speech`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        input,
        response_format: 'mp3',
        speed: provider.speed,
        voice_clone: await normalizeVoiceSample(voiceSample)
      })
    }
  };
}

async function normalizeVoiceSample(voiceSample) {
  const dataUrl = await resolveMediaDataUrl(voiceSample);
  if (!dataUrl) throw new Error('无法读取角色参考声音文件。');
  if (typeof voiceSample === 'string') {
    return {
      audio: dataUrl,
      mime_type: inferMimeFromDataUrl(dataUrl) || 'audio/mpeg'
    };
  }
  return {
    audio: dataUrl,
    name: voiceSample.name || voiceSample.fileName || '',
    mime_type: voiceSample.type || voiceSample.mimeType || inferMimeFromDataUrl(dataUrl) || 'audio/mpeg'
  };
}
