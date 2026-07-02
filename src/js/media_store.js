const DB_NAME = 'fritia_media_store';
const DB_VERSION = 1;
const STORE_NAME = 'media';
const MEDIA_REF_PREFIX = 'idb-media:';

let dbPromise = null;

export function isMediaRef(value) {
  return typeof value === 'string' && value.startsWith(MEDIA_REF_PREFIX);
}

export function mediaRefToId(ref) {
  return isMediaRef(ref) ? ref.slice(MEDIA_REF_PREFIX.length) : '';
}

export async function saveFileAsMedia(file, options = {}) {
  if (!file) throw new Error('缺少需要保存的文件。');
  const dataUrl = await readFileAsDataUrl(file);
  const id = options.id || createMediaId(options.prefix || 'media');
  await putMediaRecord({
    id,
    dataUrl,
    name: options.name || file.name || '',
    mime: options.mime || file.type || '',
    size: Number(options.size ?? file.size) || 0,
    category: options.category || '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  return {
    ref: `${MEDIA_REF_PREFIX}${id}`,
    id,
    dataUrl,
    name: options.name || file.name || '',
    mime: options.mime || file.type || '',
    size: Number(options.size ?? file.size) || 0
  };
}

export async function saveBlobAsMedia(blob, options = {}) {
  if (!blob) throw new Error('缺少需要保存的媒体 Blob。');
  const dataUrl = await readBlobAsDataUrl(blob);
  return saveDataUrlAsMedia(dataUrl, {
    ...options,
    mime: options.mime || blob.type || '',
    size: Number(options.size ?? blob.size) || 0
  });
}

export async function saveDataUrlAsMedia(dataUrl, options = {}) {
  const source = String(dataUrl || '');
  if (!source) throw new Error('缺少需要保存的媒体数据。');
  const id = options.id || createMediaId(options.prefix || 'media');
  await putMediaRecord({
    id,
    dataUrl: source,
    name: options.name || '',
    mime: options.mime || inferMimeFromDataUrl(source),
    size: Number(options.size) || estimateDataUrlSize(source),
    category: options.category || '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  return {
    ref: `${MEDIA_REF_PREFIX}${id}`,
    id,
    dataUrl: source,
    name: options.name || '',
    mime: options.mime || inferMimeFromDataUrl(source),
    size: Number(options.size) || estimateDataUrlSize(source)
  };
}

export async function getMediaDataUrl(refOrId) {
  const id = mediaRefToId(refOrId) || String(refOrId || '');
  if (!id) return '';
  const db = await openMediaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result?.dataUrl || '');
    request.onerror = () => reject(request.error || new Error('读取媒体数据失败。'));
  });
}

export async function deleteMedia(refOrId) {
  const id = mediaRefToId(refOrId) || String(refOrId || '');
  if (!id) return;
  const db = await openMediaDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('删除媒体数据失败。'));
  });
}

function putMediaRecord(record) {
  return openMediaDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error || new Error('保存媒体数据失败。'));
  }));
}

function openMediaDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('当前浏览器不支持 IndexedDB，无法持久化大媒体文件。'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('打开 IndexedDB 失败。'));
  });
  return dbPromise;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取文件失败。'));
    reader.readAsDataURL(file);
  });
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取媒体 Blob 失败。'));
    reader.readAsDataURL(blob);
  });
}

function createMediaId(prefix) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

function inferMimeFromDataUrl(dataUrl) {
  const match = /^data:([^;,]+)[;,]/.exec(String(dataUrl || ''));
  return match?.[1] || '';
}

function estimateDataUrlSize(dataUrl) {
  const payload = String(dataUrl || '').split(',')[1] || '';
  return Math.max(0, Math.floor(payload.length * 0.75));
}
