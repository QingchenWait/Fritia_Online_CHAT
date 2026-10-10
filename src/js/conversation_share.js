import { getMediaDataUrl, isMediaRef } from './media_store.js';
import { Zlib } from '../vendor/fflate/fflate.js';

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function pngChunk(type, bytes) {
  const chunk = new Uint8Array(bytes.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, bytes.length);
  chunk.set(new TextEncoder().encode(type), 4);
  chunk.set(bytes, 8);
  let crc = 0xffffffff;
  for (let index = 4; index < chunk.length - 4; index++) crc = CRC_TABLE[(crc ^ chunk[index]) & 255] ^ (crc >>> 8);
  view.setUint32(chunk.length - 4, (crc ^ 0xffffffff) >>> 0);
  return chunk;
}

// One PNG, with bounded canvas/scanline buffers, regardless of transcript height.
export function createTranscriptPng(width, height) {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width); view.setUint32(4, height);
  header[8] = 8; header[9] = 6;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header)];
  const stream = new Zlib({ level: 6 }, data => { if (data.length) parts.push(pngChunk('IDAT', data)); });
  let rows = 0;
  return {
    push(rgba, rowCount) {
      if (rgba.length !== width * rowCount * 4 || rows + rowCount > height) throw new Error('聊天长图像素不完整。');
      const stride = width * 4;
      const filtered = new Uint8Array((stride + 1) * rowCount);
      for (let row = 0; row < rowCount; row++) {
        const offset = row * (stride + 1);
        filtered[offset] = 1; // PNG Sub filter; reduces memory and file size.
        for (let col = 0; col < stride; col++) filtered[offset + col + 1] = rgba[row * stride + col] - (col >= 4 ? rgba[row * stride + col - 4] : 0);
      }
      rows += rowCount;
      stream.push(filtered, rows === height);
    },
    finish() {
      if (rows !== height) throw new Error('聊天长图未完整生成。');
      return new Blob([...parts, pngChunk('IEND', new Uint8Array())], { type: 'image/png' });
    }
  };
}

async function prepareImage(image) {
  const source = image.dataset.mediaSource || image.getAttribute('src');
  if (isMediaRef(source)) {
    const data = await getMediaDataUrl(source);
    if (!data) throw new Error('图片原文件无法读取，请取消选择该消息后重试。');
    image.src = data;
  }
  if (/^https?:/i.test(image.src) && new URL(image.src).origin !== location.origin) {
    // Do not silently omit a remote image or taint the exported canvas.
    const response = await fetch(image.src, { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('远程图片无法读取，分享图未生成。');
    const blob = await response.blob();
    image.src = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  try { await image.decode(); }
  catch { throw new Error(`无法读取图片「${image.alt || '头像或消息图片'}」，分享图未生成。`); }
  // Rasterize the APP's white monochrome SVG treatment before embedding so
  // voice icons keep their color in every browser's image renderer.
  if (/brightness\(0\).*invert\(1\)/.test(getComputedStyle(image).filter)) {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || 24; canvas.height = image.naturalHeight || 24;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    context.globalCompositeOperation = 'source-in'; context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    image.src = canvas.toDataURL(); image.style.filter = 'none'; await image.decode();
  }
}

export async function renderConversationImage({ rows, header, onProgress = () => {}, signal }) {
  await import('../vendor/html-to-image/html-to-image.js');
  const { toCanvas } = globalThis.htmlToImage;
  const stage = document.createElement('section');
  stage.className = 'conversation-share-stage';
  stage.setAttribute('aria-hidden', 'true');
  const head = header.cloneNode(true);
  head.querySelectorAll('.mobile-back, .roundtable-error-btn, .conversation-management-actions').forEach(node => node.remove());
  stage.appendChild(head);
  const list = document.createElement('div');
  list.className = 'conversation-share-messages';
  rows.forEach(row => {
    const clone = row.cloneNode(true);
    clone.removeAttribute('role'); clone.removeAttribute('tabindex'); clone.removeAttribute('aria-checked');
    clone.classList.remove('is-management-selected', 'is-management-selectable');
    clone.querySelectorAll('.message-selection-control, .tool-stop-button').forEach(node => node.remove());
    clone.querySelectorAll('.is-playing').forEach(node => node.classList.remove('is-playing'));
    list.appendChild(clone);
  });
  stage.appendChild(list);
  document.body.appendChild(stage);
  try {
    signal?.throwIfAborted();
    await document.fonts.ready;
    await Promise.all([...stage.querySelectorAll('img')].map(prepareImage));
    signal?.throwIfAborted();
    const scale = 1.5;
    const layoutWidth = 512;
    const width = layoutWidth * scale;
    const layoutHeight = Math.max(layoutWidth * 9 / 16, stage.scrollHeight);
    const height = Math.ceil(layoutHeight * scale);
    const png = createTranscriptPng(width, height);
    const tileHeight = 768;
    for (let top = 0; top < height; top += tileHeight) {
      signal?.throwIfAborted();
      const count = Math.min(tileHeight, height - top);
      // Browser-native foreignObject rendering preserves actual text baselines,
      // Grid/Flex positions and the symmetric avatar gutters. Each tile gets a
      // translated full-height DOM inside a bounded image/canvas viewport.
      const canvas = await toCanvas(stage, { backgroundColor: '#f5f7fc', width: layoutWidth,
        height: count / scale, pixelRatio: scale, skipAutoScale: true, skipFonts: true,
        style: { position: 'static', inset: 'auto', margin: '0', width: `${layoutWidth}px`,
          height: `${layoutHeight}px`, transform: `translateY(-${top / scale}px)`, transformOrigin: '0 0' } });
      if (canvas.width !== width || canvas.height !== count) throw new Error('浏览器未能完整绘制聊天长图。');
      png.push(canvas.getContext('2d').getImageData(0, 0, width, count).data, count);
      canvas.width = canvas.height = 0;
      onProgress(Math.round((top + count) / height * 100));
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return { blob: png.finish(), width, height };
  } finally { stage.remove(); }
}

export async function saveConversationImage(blob, filename) {
  if (window.showDirectoryPicker) {
    const directory = await window.showDirectoryPicker({ mode: 'readwrite' });
    const handle = await directory.getFileHandle(filename, { create: true });
    await writeImage(handle, blob);
    return false;
  }
  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: '聊天记录图片', accept: { 'image/png': ['.png'] } }] });
    await writeImage(handle, blob);
    return false;
  }
  const dialog = window.__TAURI__?.dialog;
  const fs = window.__TAURI__?.fs;
  if (dialog?.save && fs?.writeFile) {
    const path = await dialog.save({ defaultPath: filename, filters: [{ name: 'PNG', extensions: ['png'] }] });
    if (!path) return null;
    await fs.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return false;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

async function writeImage(handle, blob) {
  const writable = await handle.createWritable();
  try { await writable.write(blob); await writable.close(); }
  catch (error) { await writable.abort().catch(() => {}); throw error; }
}

export async function copyConversationImage(blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('当前环境不支持图片剪贴板，请使用保存按钮。');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
