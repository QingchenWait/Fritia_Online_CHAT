import { getMediaDataUrl, isMediaRef } from './media_store.js';

const DATA_URL_RE = /^data:([^;,]+)?(;base64)?,/i;
const TEXT_MIME_RE = /^(text\/|application\/(?:json|xml|javascript|x-javascript|ld\+json|csv))/i;

export async function resolveMediaDataUrl(source) {
  const value = normalizeMediaSource(source);
  if (!value) return '';
  if (isDataUrl(value)) return value;
  if (isMediaRef(value)) return getRequiredMediaDataUrl(value);
  return fetchPathAsDataUrl(value);
}

export async function buildModelMessageContent({ speakerName = '', text = '', attachments = [] } = {}) {
  const cleanText = String(text || '').trim();
  const normalizedAttachments = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
  const prefix = speakerName ? `${speakerName}：` : '';
  const bodyText = cleanText || (normalizedAttachments.length ? '发送了以下附件。' : '');
  const textContent = `${prefix}${bodyText}`.trim();
  if (!normalizedAttachments.length) return textContent || `${prefix}`.trim();

  const content = [{
    type: 'text',
    text: [
      textContent || `${prefix}发送了以下附件。`.trim(),
      attachmentLabelText(normalizedAttachments)
    ].filter(Boolean).join('\n')
  }];
  for (const attachment of normalizedAttachments) {
    content.push(...await attachmentToContentParts(attachment));
  }
  return content;
}

export async function buildAttachmentContentParts(attachments = []) {
  const content = [];
  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    content.push(...await attachmentToContentParts(attachment));
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

async function attachmentToContentParts(attachment = {}) {
  const source = attachment.dataRef || attachment.dataUrl || attachment.fileData || attachment.url || attachment.path || '';
  const dataUrl = await resolveMediaDataUrl(source);
  if (!dataUrl) {
    throw new Error(`无法读取附件数据：${attachment.name || attachment.mime || attachment.id || '未命名附件'}`);
  }
  const mime = attachment.mime || inferMimeFromDataUrl(dataUrl) || 'application/octet-stream';
  const name = attachment.name || attachment.fileName || 'attachment';

  if (mime.startsWith('image/') || attachment.type === 'image') {
    return [{
      type: 'image_url',
      image_url: {
        url: dataUrl,
        detail: 'auto'
      }
    }];
  }

  if (mime.startsWith('audio/') || attachment.type === 'audio') {
    return [{
      type: 'input_audio',
      input_audio: {
        data: dataUrlPayload(dataUrl),
        format: audioFormatFromMime(mime, name)
      }
    }];
  }

  if (TEXT_MIME_RE.test(mime) || /\.(?:txt|md|markdown|json|csv|xml|log|js|ts|css|html)$/i.test(name)) {
    return [{
      type: 'text',
      text: [
        `附件 ${name} 的文本内容：`,
        decodeDataUrlText(dataUrl)
      ].join('\n')
    }];
  }

  return [{
    type: 'file',
    file: {
      filename: name,
      file_data: dataUrl
    }
  }];
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
  return blobToDataUrl(blob);
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

function decodeDataUrlText(dataUrl) {
  const source = String(dataUrl || '');
  const comma = source.indexOf(',');
  if (comma < 0) return '';
  const header = source.slice(0, comma);
  const payload = source.slice(comma + 1);
  if (/;base64/i.test(header)) {
    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
  return decodeURIComponent(payload);
}
