import { deleteMedia, isMediaRef, saveDataUrlAsMedia } from './media_store.js';
import { persistentChatStore } from './failed_turns.js';

export const STORAGE_KEYS = {
  settings: 'fritia-settings',
  advanced: 'fritia_advanced_settings',
  app: 'fritia_next_chat_store',
  knowledgeState: 'fritia_knowledge_base_state',
  preloadedKnowledgeState: 'fritia_preloaded_knowledge_base_state',
  longTermMemory: 'fritia_long_term_memory'
};

const STORE_VERSION = 1;
const MEDIA_REFERENCE_KEYS = new Set(['dataRef', 'mediaRef', 'avatar', 'voiceSample']);

export function now() {
  return Date.now();
}

export function createId(prefix = 'id') {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function clampText(value, maxLength = 2000) {
  return String(value || '').trim().slice(0, maxLength);
}

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredCloneSafe(fallback);
    const parsed = JSON.parse(raw);
    return parsed ?? structuredCloneSafe(fallback);
  } catch (err) {
    console.warn(`[storage] failed to load ${key}`, err);
    return structuredCloneSafe(fallback);
  }
}

export function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsText(file, 'utf-8');
  });
}

const DEFAULT_STORE = {
  version: STORE_VERSION,
  characters: [],
  conversations: [],
  messages: {},
  activeConversationId: '',
  updatedAt: 0
};

export const DEFAULT_GROUP_SETTINGS = Object.freeze({
  autoBotChat: true,
  idleTalk: false,
  botAtMentionTriggersReply: false,
  maxParticipants: 6,
  botChainLimit: 3
});

export function loadAppStore() {
  const store = loadJson(STORAGE_KEYS.app, DEFAULT_STORE);
  return normalizeAppStore(store);
}

export function saveAppStore(store) {
  const normalized = normalizeAppStore({ ...store, updatedAt: now() });
  saveJson(STORAGE_KEYS.app, persistentChatStore(normalized));
  document.dispatchEvent(new CustomEvent('fritia-next-chat-store-updated', { detail: normalized }));
  return normalized;
}

export async function migrateLegacyAppMediaToIndexedDb() {
  const store = loadAppStore();
  let changed = false;
  for (const character of store.characters) {
    if (isDataUrl(character.avatar)) {
      const media = await saveDataUrlAsMedia(character.avatar, {
        prefix: 'avatar',
        category: 'avatar',
        name: `${character.name || character.id || 'character'}-avatar`
      });
      character.avatar = media.ref;
      changed = true;
    }
    if (isDataUrl(character.voiceSample)) {
      const media = await saveDataUrlAsMedia(character.voiceSample, {
        prefix: 'voice',
        category: 'voice',
        name: `${character.name || character.id || 'character'}-voice`
      });
      character.voiceSample = media.ref;
      changed = true;
    }
  }
  for (const conversation of store.conversations) {
    if (isDataUrl(conversation.avatar)) {
      const media = await saveDataUrlAsMedia(conversation.avatar, {
        prefix: 'avatar',
        category: 'conversation-avatar',
        name: `${conversation.title || conversation.id || 'conversation'}-avatar`
      });
      conversation.avatar = media.ref;
      changed = true;
    }
  }
  for (const list of Object.values(store.messages || {})) {
    for (const message of Array.isArray(list) ? list : []) {
      for (const attachment of message.attachments || []) {
        if (!attachment.dataRef && isDataUrl(attachment.dataUrl)) {
          const media = await saveDataUrlAsMedia(attachment.dataUrl, {
            prefix: 'att',
            category: 'attachment',
            name: attachment.name || attachment.id || 'attachment',
            mime: attachment.mime,
            size: attachment.size
          });
          attachment.dataRef = media.ref;
          attachment.dataUrl = '';
          changed = true;
        }
      }
    }
  }
  if (changed) saveAppStore(store);
  return changed;
}

export function normalizeAppStore(raw = {}) {
  const conversations = Array.isArray(raw.conversations) ? raw.conversations.map(normalizeConversation).filter(Boolean) : [];
  const messages = raw.messages && typeof raw.messages === 'object' ? raw.messages : {};
  const normalizedMessages = {};
  for (const conversation of conversations) {
    const list = Array.isArray(messages[conversation.id]) ? messages[conversation.id] : [];
    normalizedMessages[conversation.id] = list.map(normalizeMessage).filter(Boolean);
  }
  return {
    version: STORE_VERSION,
    characters: Array.isArray(raw.characters) ? raw.characters.map(normalizeCharacterRecord).filter(Boolean) : [],
    conversations,
    messages: normalizedMessages,
    activeConversationId: typeof raw.activeConversationId === 'string' ? raw.activeConversationId : '',
    updatedAt: Number(raw.updatedAt) || 0
  };
}

export function normalizeCharacterRecord(raw = {}) {
  const id = clampText(raw.id || characterIdFromName(raw.name), 80);
  const name = clampText(raw.name, 80);
  if (!id || !name) return null;
  return {
    id,
    name,
    description: clampText(raw.description, 260),
    prompt: clampText(raw.prompt, 60000),
    examples: clampText(raw.examples, 30000),
    avatar: clampText(raw.avatar, 3000000),
    voiceSample: clampText(raw.voiceSample, 8000000),
    source: clampText(raw.source || 'custom', 40),
    tags: Array.isArray(raw.tags) ? raw.tags.map(item => clampText(item, 24)).filter(Boolean).slice(0, 8) : [],
    createdAt: Number(raw.createdAt) || now(),
    updatedAt: Number(raw.updatedAt) || now()
  };
}

export function normalizeConversation(raw = {}) {
  const id = clampText(raw.id, 100);
  if (!id) return null;
  const type = raw.type === 'group' ? 'group' : 'private';
  const memberIds = Array.isArray(raw.memberIds) ? [...new Set(raw.memberIds.map(item => clampText(item, 80)).filter(Boolean))] : [];
  const conversation = {
    id,
    type,
    title: clampText(raw.title, 100),
    avatar: clampText(raw.avatar, 3000000),
    memberIds,
    // Group conversations created before unique IDs were introduced fall back
    // to their persisted id so archive/record compatibility is preserved.
    ...(type === 'group' ? { unique_id: clampText(raw.unique_id || raw.uniqueId || id, 120) } : {}),
    createdAt: Number(raw.createdAt) || now(),
    updatedAt: Number(raw.updatedAt) || now(),
    unread: Math.max(0, Math.floor(Number(raw.unread) || 0))
  };
  if (type === 'group') {
    conversation.avatar = conversation.avatar || 'src/_char/Profile_GroupChat.png';
    conversation.groupSettings = normalizeGroupSettings(raw.groupSettings);
  } else {
    conversation.voiceReplyEnabled = raw.voiceReplyEnabled === true;
  }
  return conversation;
}

export function normalizeGroupSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    autoBotChat: source.autoBotChat !== false,
    idleTalk: source.idleTalk === true,
    botAtMentionTriggersReply: source.botAtMentionTriggersReply === true,
    maxParticipants: clampNumber(source.maxParticipants, 2, 20, DEFAULT_GROUP_SETTINGS.maxParticipants),
    botChainLimit: clampNumber(source.botChainLimit, 1, 6, DEFAULT_GROUP_SETTINGS.botChainLimit)
  };
}

export function normalizeMessage(raw = {}) {
  const id = clampText(raw.id, 100) || createId('msg');
  const role = ['user', 'assistant', 'system'].includes(raw.role) ? raw.role : 'user';
  return {
    id,
    role,
    speakerId: clampText(raw.speakerId, 80),
    speakerName: clampText(raw.speakerName, 80),
    text: clampText(raw.text, 12000),
    attachments: Array.isArray(raw.attachments) ? raw.attachments.map(normalizeAttachment).filter(Boolean).slice(0, 8) : [],
    createdAt: Number(raw.createdAt) || now(),
    status: clampText(raw.status || 'sent', 24),
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : {}
  };
}

export function normalizeAttachment(raw = {}) {
  const type = ['image', 'audio', 'video', 'file'].includes(raw.type) ? raw.type : 'file';
  const dataRef = clampText(raw.dataRef || raw.mediaRef, 180);
  const dataUrl = dataRef ? '' : clampText(raw.dataUrl, 8000000);
  const name = clampText(raw.name, 180);
  const url = clampText(raw.url || raw.uri, 4000);
  const path = clampText(raw.path || raw.filePath || raw.file_path, 4000);
  if (!dataRef && !dataUrl && !name && !url && !path) return null;
  return {
    id: clampText(raw.id, 80) || createId('att'),
    type,
    name,
    dataUrl,
    dataRef,
    url,
    path,
    mime: clampText(raw.mime, 120),
    size: Math.max(0, Number(raw.size) || 0),
    source: clampText(raw.source, 40),
    width: Math.max(0, Number(raw.width) || 0),
    height: Math.max(0, Number(raw.height) || 0),
    duration: Math.max(0, Number(raw.duration) || 0)
  };
}

export function characterIdFromName(name = '') {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base ? `char_${base}` : '';
}

export function getConversationMessages(store, conversationId) {
  return Array.isArray(store.messages?.[conversationId]) ? store.messages[conversationId] : [];
}

export function upsertCharacter(store, character) {
  const normalized = normalizeCharacterRecord(character);
  if (!normalized) return store;
  const next = structuredCloneSafe(store);
  const index = next.characters.findIndex(item => item.id === normalized.id);
  if (index >= 0) {
    next.characters[index] = { ...next.characters[index], ...normalized, updatedAt: now() };
  } else {
    next.characters.push(normalized);
  }
  return saveAppStore(next);
}

export function upsertConversation(store, conversation) {
  const normalized = normalizeConversation(conversation);
  if (!normalized) return store;
  const next = structuredCloneSafe(store);
  const index = next.conversations.findIndex(item => item.id === normalized.id);
  if (index >= 0) {
    next.conversations[index] = { ...next.conversations[index], ...normalized, updatedAt: now() };
  } else {
    next.conversations.push(normalized);
  }
  if (!next.messages[normalized.id]) next.messages[normalized.id] = [];
  next.activeConversationId = normalized.id;
  return saveAppStore(next);
}

export function appendMessage(store, conversationId, message) {
  const normalized = normalizeMessage(message);
  const next = structuredCloneSafe(store);
  if (!next.messages[conversationId]) next.messages[conversationId] = [];
  next.messages[conversationId].push(normalized);
  const conversation = next.conversations.find(item => item.id === conversationId);
  if (conversation) conversation.updatedAt = normalized.createdAt;
  return saveAppStore(next);
}

export function replaceMessage(store, conversationId, messageId, patch) {
  const next = structuredCloneSafe(store);
  const list = next.messages[conversationId] || [];
  const index = list.findIndex(item => item.id === messageId);
  if (index >= 0) {
    list[index] = normalizeMessage({ ...list[index], ...patch, id: messageId });
  }
  return saveAppStore(next);
}

export function ensurePrivateConversation(store, character) {
  const id = `private:${character.id}`;
  const existing = store.conversations.find(item => item.id === id);
  if (existing) return existing;
  const conversation = {
    id,
    type: 'private',
    title: character.name,
    avatar: character.avatar,
    memberIds: [character.id],
    createdAt: now(),
    updatedAt: now()
  };
  saveAppStore({
    ...store,
    conversations: [conversation, ...store.conversations],
    messages: { ...store.messages, [id]: [] },
    activeConversationId: id
  });
  return conversation;
}

export function createGroupConversation(store, title, memberIds, characters = []) {
  const cleanMembers = [...new Set(memberIds.map(item => clampText(item, 80)).filter(Boolean))];
  // Do not derive the conversation key from title/members: creating the same
  // group twice must produce two independent histories.
  const existingIds = new Set(store.conversations.map(item => item.id));
  const existingUniqueIds = new Set(store.conversations.map(item => item.unique_id || item.uniqueId).filter(Boolean));
  const idBase = `group:${createId('conversation')}`;
  const uniqueBase = createId('group');
  let id = idBase;
  let unique_id = uniqueBase;
  let suffix = 1;
  while (existingIds.has(id) || existingUniqueIds.has(unique_id)) {
    id = `${idBase}_${suffix}`;
    unique_id = `${uniqueBase}_${suffix}`;
    suffix += 1;
  }
  const conversation = {
    id,
    type: 'group',
    unique_id,
    title: clampText(title, 80) || '圆桌密语',
    avatar: 'src/_char/Profile_GroupChat.png',
    memberIds: cleanMembers,
    groupSettings: normalizeGroupSettings(),
    createdAt: now(),
    updatedAt: now()
  };
  const next = structuredCloneSafe(store);
  const index = next.conversations.findIndex(item => item.id === id);
  if (index >= 0) next.conversations[index] = conversation;
  else next.conversations.unshift(conversation);
  if (!next.messages[id]) next.messages[id] = [];
  next.activeConversationId = id;
  const saved = saveAppStore(next);
  return saved.conversations.find(item => item.id === id) || normalizeConversation(conversation);
}

/**
 * Remove exactly one group conversation and its message bucket.
 * Private conversations and all other groups are left untouched.
 */
export async function removeGroupConversation(store, conversationId) {
  const target = store?.conversations?.find(item => item.id === conversationId && item.type === 'group');
  if (!target) return store;
  const targetRefs = collectConversationMediaRefs(store, conversationId);
  const protectedRefs = collectProtectedMediaRefs(store, conversationId);
  const next = structuredCloneSafe(store);
  next.conversations = next.conversations.filter(item => item.id !== conversationId);
  if (next.messages && typeof next.messages === 'object') delete next.messages[conversationId];
  if (next.activeConversationId === conversationId) {
    next.activeConversationId = next.conversations[0]?.id || '';
  }
  const saved = saveAppStore(next);
  const removableRefs = [...targetRefs].filter(ref => !protectedRefs.has(ref));
  await Promise.all(removableRefs.map(ref => deleteMedia(ref).catch(error => {
    console.warn('[storage] failed to remove group media', ref, error);
  })));
  return saved;
}

function collectConversationMediaRefs(store, conversationId) {
  const refs = new Set();
  const conversation = store?.conversations?.find(item => item.id === conversationId);
  if (conversation) collectMediaRefsFromValue(conversation, refs);
  const messages = Array.isArray(store?.messages?.[conversationId]) ? store.messages[conversationId] : [];
  for (const message of messages) collectMediaRefsFromValue(message, refs);
  return refs;
}

function collectProtectedMediaRefs(store, conversationId) {
  const refs = new Set();
  for (const [id, messages] of Object.entries(store?.messages || {})) {
    if (id === conversationId) continue;
    for (const message of Array.isArray(messages) ? messages : []) collectMediaRefsFromValue(message, refs);
  }
  for (const character of store?.characters || []) collectMediaRefsFromValue(character, refs);
  for (const conversation of store?.conversations || []) {
    if (conversation.id === conversationId) continue;
    collectMediaRefsFromValue(conversation, refs);
  }
  // Sticker media lives in its own localStorage record and can be attached to
  // a group message, so keep those references as well.
  if (typeof localStorage !== 'undefined') {
    try {
      const stickers = JSON.parse(localStorage.getItem('fritia_sticker_store') || '{}').stickers;
      for (const sticker of Array.isArray(stickers) ? stickers : []) {
        if (isMediaRef(sticker?.dataRef)) refs.add(sticker.dataRef);
      }
    } catch {
      // Ignore malformed optional sticker data; deleting the conversation remains safe.
    }
  }
  return refs;
}

function collectMediaRefsFromValue(value, refs, key = '') {
  if (MEDIA_REFERENCE_KEYS.has(key) && isMediaRef(value)) {
    refs.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectMediaRefsFromValue(item, refs, key));
    return;
  }
  if (!value || typeof value !== 'object') return;
  Object.entries(value).forEach(([childKey, childValue]) => collectMediaRefsFromValue(childValue, refs, childKey));
}

export function updateGroupConversation(store, conversationId, patch = {}) {
  const next = structuredCloneSafe(store);
  const index = next.conversations.findIndex(item => item.id === conversationId && item.type === 'group');
  if (index < 0) return store;
  const current = next.conversations[index];
  const memberIds = Array.isArray(patch.memberIds)
    ? [...new Set(patch.memberIds.map(item => clampText(item, 80)).filter(Boolean))]
    : current.memberIds;
  const groupSettings = patch.groupSettings
    ? normalizeGroupSettings({ ...current.groupSettings, ...patch.groupSettings })
    : normalizeGroupSettings(current.groupSettings);
  const conversation = normalizeConversation({
    ...current,
    ...patch,
    id: current.id,
    type: 'group',
    title: patch.title === undefined ? current.title : clampText(patch.title, 80),
    avatar: 'src/_char/Profile_GroupChat.png',
    memberIds,
    groupSettings,
    updatedAt: now()
  });
  next.conversations[index] = conversation;
  if (!next.messages[current.id]) next.messages[current.id] = [];
  next.activeConversationId = current.id;
  return saveAppStore(next);
}

export function hashString(value = '') {
  let hash = 2166136261;
  const source = String(value);
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function isDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:');
}

export function formatTime(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  return formatClock(date);
}

export function formatConversationListTime(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  return isSameLocalDate(date, new Date()) ? formatClock(date) : formatMonthDay(date);
}

export function formatMessageTime(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  return isSameLocalDate(date, new Date()) ? formatClock(date) : `${formatMonthDay(date)} ${formatClock(date)}`;
}

function formatClock(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatMonthDay(date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

function isSameLocalDate(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

export function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
