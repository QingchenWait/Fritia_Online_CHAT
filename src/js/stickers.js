import { createId, readFileAsDataUrl } from './storage.js';

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
  const dataUrl = clampText(raw.dataUrl, 12000000);
  if (!dataUrl) return null;
  const id = clampText(raw.id, 80) || createId('sticker');
  const width = Math.max(0, Number(raw.width) || 0);
  const height = Math.max(0, Number(raw.height) || 0);
  return {
    id,
    name: clampText(raw.name, 180) || '表情包',
    mime: clampText(raw.mime, 120) || 'image/png',
    size: Math.max(0, Number(raw.size) || 0),
    dataUrl,
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
    const dataUrl = await readFileAsDataUrl(file);
    const dimensions = await readImageDimensions(dataUrl);
    additions.push(normalizeSticker({
      id: createId('sticker'),
      name: file.name || '表情包',
      mime: file.type || 'image/png',
      size: file.size || 0,
      dataUrl,
      width: dimensions.width,
      height: dimensions.height,
      createdAt: now()
    }));
  }
  return saveStickerStore({
    stickers: [...additions.filter(Boolean), ...current.stickers].slice(0, MAX_STICKERS)
  });
}

export function deleteSticker(id) {
  const current = loadStickerStore();
  return saveStickerStore({
    stickers: current.stickers.filter(item => item.id !== id)
  });
}

export function stickerToAttachment(sticker) {
  const normalized = normalizeSticker(sticker);
  if (!normalized) return null;
  return {
    id: createId('att'),
    type: 'image',
    name: normalized.name,
    mime: normalized.mime,
    size: normalized.size,
    dataUrl: normalized.dataUrl,
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
