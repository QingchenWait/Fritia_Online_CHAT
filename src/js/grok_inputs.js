import { dataUrlBytes } from './attachment_documents.js';
import { attachmentKey, assertModelResponse } from './attachment_state.js';

const transcripts = new Map();

export function isNativeGrokProvider(provider) {
  try { return new URL(provider?.baseUrl).hostname === 'api.x.ai'; } catch { return false; }
}

export async function transcribeGrokAudio(part, provider, info) {
  const format = part.input_audio.format || 'mp3';
  const bytes = dataUrlBytes(`data:audio/${format};base64,${part.input_audio.data}`);
  const key = JSON.stringify([provider.baseUrl, provider.apiKey, info?.keys?.at(-1) || await attachmentKey(bytes)]);
  let pending = transcripts.get(key);
  if (!pending) {
    pending = (async () => {
      const form = new FormData();
      form.append('model', 'grok-voice-transcribe-2.0');
      form.append('file', new Blob([bytes], { type: format === 'mp3' ? 'audio/mpeg' : `audio/${format}` }), info?.name || `audio.${format}`);
      const response = await fetch(`${provider.baseUrl.replace(/\/+$/, '')}/stt`, {
        method: 'POST', headers: { Authorization: `Bearer ${provider.apiKey}` }, body: form
      });
      if (!response.ok) {
        const body = await response.text();
        const error = new Error(`Grok 音频转写失败 (${response.status}): ${body}`);
        error.status = response.status; error.body = body; throw error;
      }
      const result = await response.json();
      assertModelResponse(result);
      if (typeof result.text !== 'string') throw new Error('Grok 音频转写未返回有效文本');
      return result.text;
    })();
    transcripts.set(key, pending);
    while (transcripts.size > 8) transcripts.delete(transcripts.keys().next().value);
  }
  try {
    const text = await pending;
    return { type: 'text', text: `音频 ${JSON.stringify(info?.name || '附件')} 的转写：\n${text || '未检测到语音'}` };
  } catch (error) {
    transcripts.delete(key);
    throw error;
  }
}

export async function grokVideoFrames(dataUrl, name, provenance) {
  const video = document.createElement('video');
  video.preload = 'auto'; video.muted = true; video.playsInline = true;
  function waitFor(event, action) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error('视频读取超时')), 15000);
      function finish(error) {
        clearTimeout(timeout); video.removeEventListener(event, done); video.removeEventListener('error', failed);
        error ? reject(error) : resolve();
      }
      const done = () => finish();
      const failed = () => finish(new Error(`浏览器无法解码视频：${name}${video.error?.message ? ` (${video.error.message})` : ''}`));
      video.addEventListener(event, done, { once: true });
      video.addEventListener('error', failed, { once: true });
      action();
    });
  }
  try {
    await waitFor('loadeddata', () => { video.src = dataUrl; video.load(); });
    if (video.duration === Infinity) {
      await waitFor('seeked', () => { video.currentTime = 1e10; });
      await waitFor('seeked', () => { video.currentTime = 0; });
    }
    if (!Number.isFinite(video.duration) || !video.videoWidth) throw new Error(`视频画面无效：${name}`);
    const count = Math.min(12, Math.max(1, Math.ceil(video.duration)));
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    const output = [{ type: 'text', text: `视频 ${JSON.stringify(name)}：时长 ${video.duration.toFixed(1)} 秒，均匀取样 ${count} 帧，仅包含画面。` }];
    for (let index = 0; index < count; index++) {
      const time = Math.max(0, Math.min(video.duration - 0.01, count === 1 ? 0 : index * video.duration / count));
      if (time > 0) await waitFor('seeked', () => { video.currentTime = time; });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      output.push({ type: 'text', text: `视频画面 ${time.toFixed(1)} 秒` },
        { type: 'image_url', _fritiaAttachment: provenance, image_url: { url: canvas.toDataURL('image/jpeg', 0.82), detail: 'auto' } });
    }
    return output;
  } finally {
    video.removeAttribute('src'); video.load();
  }
}
