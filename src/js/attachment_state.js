// Local request quarantine, separate from chat/media/knowledge databases.
// Original attachments stay downloadable and are never changed or deleted.
const memory = new Map();
async function database() {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fritia_attachment_inputs', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('blocked');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function attachmentKey(source) {
  const data = typeof source === 'string' ? new TextEncoder().encode(source) : source;
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function blockedAttachment(keys) {
  const known = keys.map(key => memory.get(key)).find(Boolean);
  if (known) return known;
  const db = await database();
  if (!db) return null;
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('blocked');
      const requests = keys.map(key => tx.objectStore('blocked').get(key));
      tx.oncomplete = () => {
        const found = requests.map(request => request.result).find(Boolean) || null;
        if (found) keys.forEach(key => memory.set(key, found));
        resolve(found);
      };
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('无法读取附件隔离状态'));
    });
  } finally { db.close(); }
}

export async function quarantineAttachment(info, reason, apiError = '') {
  const record = { name: info.name, reason, apiError, at: Date.now() };
  info.keys.forEach(key => memory.set(key, record));
  const db = await database();
  if (!db) return record;
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('blocked', 'readwrite');
      info.keys.forEach(key => tx.objectStore('blocked').put(record, key));
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('无法保存附件隔离状态'));
    });
  } finally { db.close(); }
  return record;
}

export class AttachmentInputError extends Error {
  constructor(issues, apiError = null) {
    apiError ||= issues.find(item => item.apiError) ? { body: issues.find(item => item.apiError).apiError, status: 400 } : null;
    super(formatAttachmentError(issues, apiError));
    this.name = 'AttachmentInputError';
    this.kind = 'attachment-input';
    this.issues = issues;
    this.cause = apiError;
    this.body = apiError?.body || '';
    this.status = apiError?.status || 0;
  }
}

export function formatAttachmentError(issues, apiError) {
  const raw = apiError ? apiError.body || apiError.message || String(apiError) : '';
  return ['附件读取失败（与模型连接配置错误不同）',
    ...issues.map(item => `${item.name || '未命名附件'}：${item.reason}`),
    '这些附件已从后续模型上下文中隔离，不会自动写入知识库或记忆。原文件仍保留在聊天中，可下载。后续纯文本对话可以继续。',
    raw ? (raw.length <= 8000 ? `模型接口原始错误：\n${raw}` : '模型接口返回了较长错误，请展开气泡中的“模型接口原始错误（完整内容）”。') : ''
  ].filter(Boolean).join('\n');
}

export function isAttachmentErrorMessage(message) {
  if (message?.meta?.attachmentInputError) return true;
  if (message?.status === 'error' && isFileRejection(message.text || '')) return true;
  if (message?.role === 'assistant') {
    try { const payload = JSON.parse(message.text); return Boolean(payload?.error && isFileRejection(JSON.stringify(payload.error))); }
    catch { /* Ordinary assistant prose is not an API error. */ }
  }
  return false;
}

export function isFileRejection(text) {
  return /(?:\bfile(?:_data|_id| type)?\b|\binput_file\b|\bmime\b|\bimage(?:_url| type| format)?\b|\binput_audio\b|\baudio(?: type| format)?\b|附件|文件|图片格式|音频格式)/i.test(text)
    && /(?:unsupported|not supported|not support|invalid|must have|expected|不支持|无法读取|附件读取失败)/i.test(text);
}

// Some compatible gateways return an API error in HTTP 200 JSON/SSE bodies.
// Such a payload is an error, never assistant prose to store in memory.
export function assertModelResponse(payload, raw = '') {
  if (!payload?.error) return;
  const body = raw || JSON.stringify(payload);
  const status = Number(payload.error.status || payload.error.code) || 400;
  const error = new Error(`API 请求失败 (${status}): ${body}`);
  error.body = body; error.status = status;
  throw error;
}
