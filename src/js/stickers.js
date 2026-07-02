import { createId } from './storage.js';
import { deleteMedia, saveDataUrlAsMedia, saveFileAsMedia } from './media_store.js';

const STICKER_STORE_KEY = 'fritia_sticker_store';
const MAX_STICKERS = 240;

function now() {
  return Date.now();
}

function dispatchStickerUpdate(stickers) {
  document.dispatchEvent(new CustomEvent('fritia-stickers-updated', { detail: stickers }));
}

function clampText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeSticker(raw = {}) {
  const dataRef = clampText(raw.dataRef || raw.mediaRef, 180);
  const dataUrl = dataRef ? '' : clampText(raw.dataUrl, 12000000);
  if (!dataRef && !dataUrl) return null;
  const id = clampText(raw.id, 80) || createId('sticker');
  const width = Math.max(0, Number(raw.width) || 0);
  const height = Math.max(0, Number(raw.height) || 0);
  return {
    id,
    name: clampText(raw.name, 180) || '表情包',
    mime: clampText(raw.mime, 120) || 'image/png',
    size: Math.max(0, Number(raw.size) || 0),
    dataUrl,
    dataRef,
    width,
    height,
    createdAt: Number(raw.createdAt) || now()
  };
}

export function loadStickerStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STICKER_STORE_KEY) || '{}');
    const stickers = Array.isArray(parsed.stickers)
      ? parsed.stickers.map(normalizeSticker).filter(Boolean).slice(0, MAX_STICKERS)
      : [];
    return { stickers };
  } catch {
    return { stickers: [] };
  }
}

export function listStickers() {
  return loadStickerStore().stickers;
}

export async function migrateLegacyStickersToIndexedDb() {
  const current = loadStickerStore();
  let changed = false;
  const stickers = [];
  for (const sticker of current.stickers) {
    if (!sticker.dataRef && sticker.dataUrl) {
      const media = await saveDataUrlAsMedia(sticker.dataUrl, {
        id: sticker.id,
        name: sticker.name,
        mime: sticker.mime,
        size: sticker.size,
        category: 'sticker',
        prefix: 'sticker'
      });
      stickers.push(normalizeSticker({ ...sticker, dataUrl: '', dataRef: media.ref }));
      changed = true;
    } else {
      stickers.push(sticker);
    }
  }
  if (changed) saveStickerStore({ stickers });
  return changed;
}

function saveStickerStore(next) {
  const normalized = {
    stickers: Array.isArray(next?.stickers)
      ? next.stickers.map(normalizeSticker).filter(Boolean).slice(0, MAX_STICKERS)
      : []
  };
  localStorage.setItem(STICKER_STORE_KEY, JSON.stringify(normalized));
  dispatchStickerUpdate(normalized.stickers);
  return normalized;
}

export async function addStickerFiles(files = []) {
  const imageFiles = [...files].filter(file => file?.type?.startsWith('image/'));
  if (!imageFiles.length) return loadStickerStore();
  const current = loadStickerStore();
  const additions = [];
  for (const file of imageFiles) {
    const media = await saveFileAsMedia(file, { category: 'sticker', prefix: 'sticker' });
    const dimensions = await readImageDimensions(media.dataUrl);
    additions.push(normalizeSticker({
      id: media.id,
      name: file.name || '表情包',
      mime: file.type || 'image/png',
      size: file.size || 0,
      dataRef: media.ref,
      width: dimensions.width,
      height: dimensions.height,
      createdAt: now()
    }));
  }
  return saveStickerStore({
    stickers: [...additions.filter(Boolean), ...current.stickers].slice(0, MAX_STICKERS)
  });
}

export async function deleteSticker(id) {
  const current = loadStickerStore();
  const sticker = current.stickers.find(item => item.id === id);
  if (sticker?.dataRef) await deleteMedia(sticker.dataRef);
  return saveStickerStore({
    stickers: current.stickers.filter(item => item.id !== id)
  });
}

export async function stickerToAttachment(sticker) {
  let normalized = normalizeSticker(sticker);
  if (!normalized) return null;
  if (!normalized.dataRef && normalized.dataUrl) {
    const media = await saveDataUrlAsMedia(normalized.dataUrl, {
      id: normalized.id,
      name: normalized.name,
      mime: normalized.mime,
      size: normalized.size,
      category: 'sticker',
      prefix: 'sticker'
    });
    normalized = normalizeSticker({ ...normalized, dataUrl: '', dataRef: media.ref });
    const current = loadStickerStore();
    saveStickerStore({
      stickers: current.stickers.map(item => item.id === normalized.id ? normalized : item)
    });
  }
  return {
    id: createId('att'),
    type: 'image',
    name: normalized.name,
    mime: normalized.mime,
    size: normalized.size,
    dataRef: normalized.dataRef,
    source: 'sticker',
    width: normalized.width,
    height: normalized.height
  };
}

export function isWideSticker(sticker) {
  const width = Number(sticker?.width) || 0;
  const height = Number(sticker?.height) || 0;
  if (!width || !height) return true;
  return Math.max(width, height) / Math.min(width, height) > 1.2;
}

function readImageDimensions(dataUrl) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve({
      width: image.naturalWidth || image.width || 0,
      height: image.naturalHeight || image.height || 0
    });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = dataUrl;
  });
}
