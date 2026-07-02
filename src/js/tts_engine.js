import { getDefaultTtsProvider, getSettings } from './settings.js';

export function getActiveTtsProvider(settings = getSettings()) {
  return getDefaultTtsProvider(settings);
}

export function buildMimoVoiceCloneRequest({ text, voiceSample, provider = getActiveTtsProvider() } = {}) {
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
        voice_clone: normalizeVoiceSample(voiceSample)
      })
    }
  };
}

function normalizeVoiceSample(voiceSample) {
  if (typeof voiceSample === 'string') {
    return {
      audio: voiceSample
    };
  }
  return {
    audio: voiceSample.dataUrl || voiceSample.audio || voiceSample.url || '',
    name: voiceSample.name || voiceSample.fileName || '',
    mime_type: voiceSample.type || voiceSample.mimeType || 'audio/mpeg'
  };
}
