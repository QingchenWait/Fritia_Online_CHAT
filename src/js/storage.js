export const STORAGE_KEYS = {
  settings: 'fritia-settings',
  advanced: 'fritia_advanced_settings',
  app: 'fritia_next_chat_store',
  knowledgeState: 'fritia_knowledge_base_state',
  preloadedKnowledgeState: 'fritia_preloaded_knowledge_base_state',
  longTermMemory: 'fritia_long_term_memory'
};

const STORE_VERSION = 1;

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

export function loadAppStore() {
  const store = loadJson(STORAGE_KEYS.app, DEFAULT_STORE);
  return normalizeAppStore(store);
}

export function saveAppStore(store) {
  const normalized = normalizeAppStore({ ...store, updatedAt: now() });
  saveJson(STORAGE_KEYS.app, normalized);
  document.dispatchEvent(new CustomEvent('fritia-next-chat-store-updated', { detail: normalized }));
  return normalized;
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
  return {
    id,
    type,
    title: clampText(raw.title, 100),
    avatar: clampText(raw.avatar, 3000000),
    memberIds,
    createdAt: Number(raw.createdAt) || now(),
    updatedAt: Number(raw.updatedAt) || now(),
    unread: Math.max(0, Math.floor(Number(raw.unread) || 0))
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
  const type = ['image', 'audio', 'file'].includes(raw.type) ? raw.type : 'file';
  const dataUrl = clampText(raw.dataUrl, 8000000);
  const name = clampText(raw.name, 180);
  if (!dataUrl && !name) return null;
  return {
    id: clampText(raw.id, 80) || createId('att'),
    type,
    name,
    dataUrl,
    mime: clampText(raw.mime, 120),
    size: Math.max(0, Number(raw.size) || 0)
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
  const id = `group:${hashString(`${title}|${cleanMembers.join(',')}`)}`;
  const existing = store.conversations.find(item => item.id === id);
  const memberAvatars = cleanMembers
    .map(idValue => characters.find(item => item.id === idValue)?.avatar)
    .filter(Boolean);
  const conversation = {
    id,
    type: 'group',
    title: clampText(title, 80) || '圆桌密语',
    avatar: memberAvatars[0] || 'src/_logo/emoji/speech_balloon_3d.png',
    memberIds: cleanMembers,
    createdAt: existing?.createdAt || now(),
    updatedAt: now()
  };
  const next = structuredCloneSafe(store);
  const index = next.conversations.findIndex(item => item.id === id);
  if (index >= 0) next.conversations[index] = conversation;
  else next.conversations.unshift(conversation);
  if (!next.messages[id]) next.messages[id] = [];
  next.activeConversationId = id;
  saveAppStore(next);
  return conversation;
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

export function formatTime(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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
