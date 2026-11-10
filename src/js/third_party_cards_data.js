import { createId, loadAppStore, normalizeCharacterRecord, saveAppStore } from './storage.js';
import { deleteMedia, saveBlobAsMedia } from './media_store.js';

export const THIRD_PARTY_ISSUES_URL = 'https://github.com/QingchenWait/Fritia_Online_CHAT_plugins/issues';
export const THIRD_PARTY_API_URL = 'https://api.github.com/repos/QingchenWait/Fritia_Online_CHAT_plugins/issues';
const REQUIRED_LABELS = ['角色卡', '初审通过'];
const ASSET_HOSTS = new Set(['github.com', 'raw.githubusercontent.com', 'user-images.githubusercontent.com', 'private-user-images.githubusercontent.com', 'objects.githubusercontent.com']);
const FIELDS = ['角色卡名称', '角色卡介绍', '头像', '人格提示词', '参考语音'];
const TEMPLATE_HEADINGS = new Set([...FIELDS, '详细描述', '必要上传声明', '可选声明']);

export function isApprovedCharacterIssue(issue) {
  const labels = new Set((Array.isArray(issue?.labels) ? issue.labels : []).map(label => typeof label === 'string' ? label : label?.name));
  return issue?.state === 'open' && !issue.pull_request && REQUIRED_LABELS.every(label => labels.has(label));
}

export function normalizeAttachmentUrl(value) {
  try {
    const url = new URL(String(value || '').replace(/&amp;/g, '&'));
    if (url.protocol !== 'https:' || url.username || url.password || !ASSET_HOSTS.has(url.hostname)) return '';
    if (url.hostname === 'github.com') {
      const blob = /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(url.pathname);
      if (blob) return `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}`;
      if (!/^\/(?:user-attachments\/(?:assets|files)\/|files\/)/.test(url.pathname)) return '';
    }
    return url.href;
  } catch { return ''; }
}

function extractAttachment(section, kind) {
  const candidates = [];
  const markdown = /!?\[([^\]]*)\]\(\s*<?(https:\/\/[^\s<>]+?)>?\s*(?:"[^"]*")?\)/g;
  for (const match of section.matchAll(markdown)) candidates.push({ name: match[1], url: match[2] });
  for (const match of section.matchAll(/(?:src|href)\s*=\s*["'](https:\/\/[^"']+)["']/gi)) candidates.push({ name: '', url: match[1] });
  for (const match of section.matchAll(/https:\/\/[^\s<>"')\]]+/g)) candidates.push({ name: '', url: match[0] });
  const extensions = { avatar: /\.(png|jpe?g|webp)$/i, prompt: /\.txt$/i, voice: /\.(mp3|wav)$/i };
  for (const candidate of candidates) {
    const url = normalizeAttachmentUrl(candidate.url);
    if (!url) continue;
    let filename = new URL(url).pathname.split('/').pop() || '';
    try { filename = decodeURIComponent(filename); } catch { /* Keep the encoded filename. */ }
    const name = extensions[kind].test(candidate.name) ? candidate.name : filename;
    // GitHub image/audio assets can use an opaque UUID without an extension.
    if (!extensions[kind].test(name) && (kind === 'prompt' || /\.[a-z0-9]{1,8}$/i.test(filename))) continue;
    return { url, name: name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') };
  }
  return null;
}

export function parseCharacterIssue(issue) {
  if (!isApprovedCharacterIssue(issue) || !Number.isSafeInteger(issue.id) || !Number.isSafeInteger(issue.number)) return null;
  const sections = {};
  let heading = '';
  let fence = '';
  for (const line of String(issue.body || '').replace(/\r\n?/g, '\n').split('\n')) {
    const marker = heading === '详细描述' && /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = '';
      sections[heading].push(line);
      continue;
    }
    const match = !fence && /^###\s+(.+?)\s*$/.exec(line);
    if (match && (heading !== '详细描述' || TEMPLATE_HEADINGS.has(match[1]))) { heading = match[1]; sections[heading] ||= []; }
    else if (heading) sections[heading].push(line);
  }
  const field = name => (sections[name] || []).join('\n').trim().replace(/^_No response_$/i, '').trim();
  if (!FIELDS.every(name => Object.hasOwn(sections, name)) || !field('角色卡名称') || !field('角色卡介绍')) return null;
  return {
    issueId: issue.id, issueNumber: issue.number,
    url: `${THIRD_PARTY_ISSUES_URL}/${issue.number}`,
    name: field('角色卡名称'), description: field('角色卡介绍'),
    detailedDescription: field('详细描述'),
    author: String(issue.user?.login || '未知用户'), createdAt: Date.parse(issue.created_at) || 0,
    avatar: extractAttachment(field('头像'), 'avatar'),
    prompt: extractAttachment(field('人格提示词'), 'prompt'),
    voice: extractAttachment(field('参考语音'), 'voice')
  };
}

async function requestThirdPartyResource(url, init) {
  const invoke = window.__FRITIA_ANDROID_SHELL__?.invoke
    || window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
  // Use the clients' generic HTTP proxy. The WebDAV bridge deliberately
  // restricts cross-origin redirects and cannot follow GitHub attachment CDNs.
  if (!invoke) return fetch(url, init);
  const native = await invoke('proxy_fetch', { request: {
    url, method: 'GET', headers: [...new Headers(init.headers)].map(([name, value]) => ({ name, value })), bodyBase64: null
  } });
  init.signal?.throwIfAborted();
  if (native?.error) throw new Error(native.error);
  const status = Number(native?.status);
  if (!Number.isInteger(status) || status < 200 || status > 599) throw new Error('客户端原生代理返回了无效的 HTTP 响应。');
  const bytes = Uint8Array.from(atob(native.bodyBase64 ?? native.body_base64 ?? native.body ?? ''), char => char.charCodeAt(0));
  const headers = Array.isArray(native.headers) ? native.headers.map(header => [header.name, header.value]) : native.headers;
  return new Response([204, 205, 304].includes(status) ? null : bytes, {
    status, statusText: native.statusText || native.status_text || '', headers
  });
}

async function requestFresh(url, { signal, accept = 'application/vnd.github+json', format = 'json' } = {}) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('连接 GitHub 超时，请检查网络后重试。')), 45000);
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = () => reject(controller.signal.reason); controller.signal.addEventListener('abort', rejectAbort, { once: true }); });
  try {
    // A unique URL also avoids native HTTP caches; nothing is put in CacheStorage.
    const freshUrl = new URL(url);
    freshUrl.searchParams.set('_fritia', createId('fresh'));
    return await Promise.race([(async () => {
      const response = await requestThirdPartyResource(freshUrl.href, {
        cache: 'no-store', credentials: 'omit', signal: controller.signal, headers: { Accept: accept }
      });
      if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GitHub 请求额度暂时受限，请稍后重试。' : `GitHub 返回 HTTP ${response.status}`);
      return format === 'blob' ? response.blob() : response.json();
    })(), aborted]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', rejectAbort);
  }
}

export async function fetchApprovedCharacterCards({ signal } = {}) {
  const cards = new Map();
  for (let page = 1; ; page += 1) {
    const url = new URL(THIRD_PARTY_API_URL);
    for (const [key, value] of Object.entries({ state: 'open', labels: REQUIRED_LABELS.join(','), sort: 'created', direction: 'desc', per_page: '100', page: String(page) })) url.searchParams.set(key, value);
    const payload = await requestFresh(url, { signal });
    if (!Array.isArray(payload)) throw new Error('GitHub 角色卡列表格式无效。');
    for (const issue of payload) {
      const card = parseCharacterIssue(issue);
      if (card) cards.set(card.issueId, card);
    }
    if (payload.length < 100) return [...cards.values()];
  }
}

export async function fetchCurrentCharacterCard(card, { signal } = {}) {
  const issue = await requestFresh(`${THIRD_PARTY_API_URL}/${card.issueNumber}`, { signal });
  const current = parseCharacterIssue(issue);
  if (!current || current.issueId !== card.issueId) throw new Error('该角色卡已关闭、撤销审核或不再符合投稿格式，请刷新列表。');
  return current;
}

export function isThirdPartyCardInstalled(card, store = loadAppStore()) {
  return store.characters.some(character => character.thirdPartyIssueId === card.issueId);
}

export async function downloadCharacterAttachment(attachment, kind, { signal } = {}) {
  if (!attachment?.url) throw new Error('投稿缺少必要附件。');
  const blob = await requestFresh(attachment.url, { signal, accept: '*/*', format: 'blob' });
  if (!blob.size) throw new Error('附件为空。');
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  let mime, extension, text;
  if (kind === 'avatar') {
    if (bytes[0] === 137 && ascii(1, 4) === 'PNG' && bytes[4] === 13 && bytes[5] === 10) { mime = 'image/png'; extension = 'png'; }
    else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) { mime = 'image/jpeg'; extension = 'jpg'; }
    else if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') { mime = 'image/webp'; extension = 'webp'; }
    else throw new Error('头像附件不是 PNG、JPG 或 WEBP 图片。');
  } else if (kind === 'voice') {
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') { mime = 'audio/wav'; extension = 'wav'; }
    else if (ascii(0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0)) { mime = 'audio/mpeg'; extension = 'mp3'; }
    else throw new Error('参考语音附件不是 MP3 或 WAV 音频。');
  } else if (kind === 'prompt') {
    const encoding = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le' : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be' : 'utf-8';
    try { text = new TextDecoder(encoding, { fatal: true }).decode(await blob.arrayBuffer()).trim(); }
    catch { throw new Error('人格提示词编码无效，请使用 UTF-8 或 UTF-16 的 TXT 文件。'); }
    if (!text || text.includes('\0') || /^\s*(?:<!doctype\s+html|<html\b)/i.test(text)) throw new Error('人格提示词不是有效的 TXT 纯文本。');
    mime = 'text/plain'; extension = 'txt';
  } else throw new Error('未知的角色附件类型。');
  if (kind === 'avatar' && typeof createImageBitmap === 'function') {
    let image;
    try { image = await createImageBitmap(blob); }
    catch { throw new Error('头像图片无法解码，附件可能损坏。'); }
    image.close();
  }
  if (kind === 'voice') {
    const AudioDecoder = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (AudioDecoder) {
      const context = new AudioDecoder();
      try {
        const audio = await context.decodeAudioData(await blob.arrayBuffer());
        if (!(audio.duration > 0)) throw new Error('空音频');
      } catch { throw new Error('参考语音无法解码，附件可能损坏。'); }
      finally { await context.close(); }
    }
  }
  const stem = String(attachment.name || kind).replace(/\.[^.]+$/, '').slice(0, 100).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') || kind;
  return { blob: new Blob([blob], { type: mime }), mime, filename: `${stem}.${extension}`, text };
}

let installing = false;
export async function installThirdPartyCharacter(card, { onProgress = () => {} } = {}) {
  if (installing) throw new Error('请等待当前第三方角色卡安装完成。');
  installing = true;
  const stagedIds = [];
  let committed = false;
  try {
    if (isThirdPartyCardInstalled(card)) throw new Error('该角色卡已安装。');
    onProgress('正在核对 GitHub 投稿状态…');
    const current = await fetchCurrentCharacterCard(card);
    if (!current.avatar || !current.prompt || !current.voice) throw new Error('投稿缺少头像、人格提示词或参考语音，无法完整安装。');
    if (current.name.length > 80 || current.description.length > 260) throw new Error('角色卡名称或介绍超出存档支持的长度，未导入。');
    const resources = {};
    for (const [kind, label] of [['avatar', '头像'], ['prompt', '人格提示词'], ['voice', '参考语音']]) {
      onProgress(`正在下载并校验${label}…`);
      resources[kind] = await downloadCharacterAttachment(current[kind], kind);
    }
    if (resources.prompt.text.length > 60000) throw new Error('人格提示词超出存档支持的长度，未导入。');
    // Recheck after downloads so revoked/edited submissions cannot be committed.
    const verified = await fetchCurrentCharacterCard(current);
    if (['name', 'description'].some(key => verified[key] !== current[key]) || ['avatar', 'prompt', 'voice'].some(key => verified[key]?.url !== current[key]?.url)) throw new Error('投稿内容在下载时发生变化，请刷新后重试。');
    if (isThirdPartyCardInstalled(current)) throw new Error('该角色卡已安装。');
    onProgress('正在保存到角色存档…');
    const media = {};
    for (const kind of ['avatar', 'voice']) {
      const id = createId(`third_party_${current.issueId}_${kind}`);
      stagedIds.push(id);
      media[kind] = await saveBlobAsMedia(resources[kind].blob, { id, category: kind === 'voice' ? 'voice' : 'avatar', name: resources[kind].filename, mime: resources[kind].mime });
    }
    const store = loadAppStore();
    if (isThirdPartyCardInstalled(current, store)) throw new Error('该角色卡已安装。');
    const id = createId('third_party_character');
    const timestamp = Date.now();
    const character = normalizeCharacterRecord({ id, name: current.name, description: current.description, prompt: resources.prompt.text,
      avatar: media.avatar.ref, voiceSample: media.voice.ref, source: 'custom', tags: ['第三方角色卡'],
      thirdPartyIssueId: current.issueId, thirdPartyIssueNumber: current.issueNumber, createdAt: timestamp, updatedAt: timestamp });
    const conversationId = `private:${id}`;
    // One app-store write; no upsert/overwrite of existing characters or conversations.
    saveAppStore({ ...store, characters: [...store.characters, character],
      conversations: [{ id: conversationId, type: 'private', title: character.name, avatar: character.avatar, memberIds: [id], createdAt: timestamp, updatedAt: timestamp }, ...store.conversations],
      messages: { ...store.messages, [conversationId]: [] }, activeConversationId: conversationId });
    committed = true;
    return character;
  } finally {
    try {
      if (!committed) {
        // Only IDs created by this attempt are eligible. Never sweep the media store.
        const referenced = JSON.stringify(loadAppStore());
        const results = await Promise.allSettled(stagedIds.filter(id => !referenced.includes(`idb-media:${id}`)).map(id => deleteMedia(id)));
        if (results.some(result => result.status === 'rejected')) throw new Error('安装失败，临时媒体清理未完成，请重试。');
      }
    } finally { installing = false; }
  }
}
