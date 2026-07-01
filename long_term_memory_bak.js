import { STORAGE_KEYS, loadJson, saveJson, createId, clampText, hashString } from './storage.js';
import { getAdvancedSettings } from './settings.js';

const STORE_VERSION = 1;
const EXTRACTOR_VERSION = 11;
const PLAYER_NAME = '分析员';
const PUBLIC_SCOPE = 'public:roundtable';

const DEFAULT_SETTINGS = {
  enabled: true,
  retentionDays: 60,
  blockedKeywords: [],
  includeIntimate: false
};

const RELATION_PATTERNS = [
  { relation: '喜欢', re: /(?:我|分析员|本小姐|琴诺|芙提雅)?(?:很|最|特别)?喜欢([^，。！？\n]{1,24})/g, weight: 5.2 },
  { relation: '想去', re: /(?:想|想要|打算|准备)去([^，。！？\n]{1,24})/g, weight: 4.8 },
  { relation: '讨厌', re: /(?:我|分析员)?(?:很|最)?讨厌([^，。！？\n]{1,24})/g, weight: 4.8 },
  { relation: '记得', re: /(?:记住|记得)([^，。！？\n]{1,28})/g, weight: 4.2 },
  { relation: '在意', re: /(?:在意|担心|关心)([^，。！？\n]{1,24})/g, weight: 4.0 }
];

export function createEmptyStore() {
  return {
    version: STORE_VERSION,
    extractorVersion: EXTRACTOR_VERSION,
    updatedAt: Date.now(),
    settings: { ...DEFAULT_SETTINGS },
    memories: [],
    edges: [],
    deletedIds: [],
    lifecycle: {
      lastMaintenanceAt: 0,
      lastMaintenanceReason: '',
      maintenanceRuns: 0,
      lastStats: {}
    }
  };
}

export function getLongTermMemoryStore() {
  return normalizeStore(loadJson(STORAGE_KEYS.longTermMemory, createEmptyStore()));
}

function saveStore(store) {
  const normalized = normalizeStore({ ...store, updatedAt: Date.now() });
  saveJson(STORAGE_KEYS.longTermMemory, normalized);
  document.dispatchEvent(new CustomEvent('fritia-long-term-memory-updated', {
    detail: { memories: normalized.memories.length, edges: normalized.edges.length }
  }));
  return normalized;
}

function normalizeStore(raw = {}) {
  const memories = Array.isArray(raw.memories) ? raw.memories.map(normalizeMemory).filter(Boolean) : [];
  const memoryIds = new Set(memories.map(item => item.id));
  const deletedIds = Array.isArray(raw.deletedIds) ? raw.deletedIds.map(item => String(item)).filter(Boolean) : [];
  const edges = Array.isArray(raw.edges)
    ? raw.edges.map(item => normalizeEdge(item, memoryIds)).filter(Boolean)
    : [];
  return {
    version: STORE_VERSION,
    extractorVersion: EXTRACTOR_VERSION,
    updatedAt: Number(raw.updatedAt) || Date.now(),
    settings: normalizeSettings(raw.settings),
    memories,
    edges: mergeEdges([...edges, ...deriveTopicEdges(memories, new Set(deletedIds))], new Set(deletedIds)),
    deletedIds,
    lifecycle: raw.lifecycle && typeof raw.lifecycle === 'object' ? raw.lifecycle : createEmptyStore().lifecycle
  };
}

function normalizeSettings(raw = {}) {
  return {
    enabled: raw.enabled !== false,
    retentionDays: clampNumber(raw.retentionDays, 1, 3650, DEFAULT_SETTINGS.retentionDays),
    blockedKeywords: Array.isArray(raw.blockedKeywords)
      ? raw.blockedKeywords.map(item => clampText(item, 40)).filter(Boolean).slice(0, 80)
      : [],
    includeIntimate: Boolean(raw.includeIntimate)
  };
}

function normalizeMemory(raw = {}) {
  const id = clampText(raw.id, 120);
  const text = clampText(raw.text, 4000);
  if (!id || !text) return null;
  const scope = normalizeScope(raw.scope, raw.characterId);
  return {
    id,
    type: clampText(raw.type || 'episode', 40),
    text,
    scope,
    characterId: clampText(raw.characterId || characterIdFromScope(scope), 80),
    characterName: clampText(raw.characterName, 80),
    source: clampText(raw.source || 'private', 40),
    sourceMessageIds: Array.isArray(raw.sourceMessageIds) ? raw.sourceMessageIds.map(item => clampText(item, 120)).filter(Boolean) : [],
    speakerRole: ['player', 'assistant', 'system', 'mixed'].includes(raw.speakerRole) ? raw.speakerRole : 'player',
    speakerId: clampText(raw.speakerId, 80),
    speakerName: clampText(raw.speakerName, 80),
    addresseeId: clampText(raw.addresseeId, 80),
    addresseeName: clampText(raw.addresseeName, 80),
    tags: Array.isArray(raw.tags) ? raw.tags.map(item => clampText(item, 40)).filter(Boolean).slice(0, 24) : [],
    importance: clampNumber(raw.importance, 0, 10, 3),
    accessCount: Math.max(0, Math.floor(Number(raw.accessCount) || 0)),
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now()
  };
}

function normalizeEdge(raw = {}, validMemoryIds = null) {
  const scope = normalizeScope(raw.scope, raw.characterId);
  const head = normalizeEntity(raw.head);
  const relation = clampText(raw.relation, 32);
  const tail = normalizeEntity(raw.tail);
  if (!head || !relation || !tail) return null;
  const sourceMemoryIds = Array.isArray(raw.sourceMemoryIds)
    ? raw.sourceMemoryIds.map(item => clampText(item, 120)).filter(id => !validMemoryIds || validMemoryIds.has(id))
    : [];
  if (validMemoryIds && sourceMemoryIds.length === 0) return null;
  return {
    id: clampText(raw.id, 140) || createEdgeId(scope, head, relation, tail),
    scope,
    characterId: clampText(raw.characterId || characterIdFromScope(scope), 80),
    head,
    relation,
    tail,
    sourceMemoryIds,
    weight: clampNumber(raw.weight, 1, 20, 1),
    provisional: Boolean(raw.provisional),
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now()
  };
}

export function getLongTermMemorySettings() {
  return getLongTermMemoryStore().settings;
}

export function updateLongTermMemorySettings(nextSettings = {}) {
  const store = getLongTermMemoryStore();
  return saveStore({ ...store, settings: normalizeSettings({ ...store.settings, ...nextSettings }) }).settings;
}

export function buildMemoryScope(characterId = 'fritia', options = {}) {
  return options.publicScope ? PUBLIC_SCOPE : `private:${characterId || 'unknown'}`;
}

export async function buildLongTermMemoryMessage(options = {}) {
  const result = searchLongTermMemory({
    query: [options.query, options.userText, ...(options.history || []).map(item => item.text || '')].filter(Boolean).join('\n'),
    scope: options.mode === 'roundtable' ? PUBLIC_SCOPE : buildMemoryScope(options.characterId),
    memoryLimit: options.memoryLimit || getAdvancedSettings().memoryLimit,
    edgeLimit: options.edgeLimit || getAdvancedSettings().edgeLimit
  });
  if (!result.memories.length && !result.edges.length) return null;
  const lines = ['以下是长期记忆参考。只在相关时自然使用，不要机械列出。'];
  if (result.edges.length) {
    lines.push('关系记忆：');
    result.edges.forEach((edge, index) => {
      lines.push(`${index + 1}. ${edge.head} ${edge.relation} ${edge.tail}`);
    });
  }
  if (result.memories.length) {
    lines.push('原文记忆：');
    result.memories.forEach((memory, index) => {
      lines.push(`${index + 1}. ${memory.text}`);
    });
  }
  touchReferencedItems([...result.memories.map(item => item.id), ...result.edges.flatMap(item => item.sourceMemoryIds || [])]);
  return { role: 'system', content: lines.join('\n') };
}

export function searchLongTermMemory(options = {}) {
  const store = getLongTermMemoryStore();
  if (!store.settings.enabled) return { memories: [], edges: [] };
  const query = clampText(options.query, 2000);
  if (!query) return { memories: [], edges: [] };
  const allowed = new Set([options.scope || PUBLIC_SCOPE]);
  if (options.includePublic !== false) allowed.add(PUBLIC_SCOPE);
  const queryTokens = tokenize(query);
  const memories = store.memories
    .filter(item => allowed.has(item.scope))
    .map(item => ({ item, score: scoreText([item.text, ...(item.tags || [])].join(' '), queryTokens, query) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || (b.item.updatedAt || 0) - (a.item.updatedAt || 0))
    .slice(0, options.memoryLimit || 5)
    .map(item => item.item);
  const edges = store.edges
    .filter(item => allowed.has(item.scope))
    .map(item => ({ item, score: scoreText(`${item.head} ${item.relation} ${item.tail}`, queryTokens, query) + (item.weight || 1) * 0.08 }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || (b.item.updatedAt || 0) - (a.item.updatedAt || 0))
    .slice(0, options.edgeLimit || 8)
    .map(item => item.item);
  return { memories, edges };
}

export function recordLongTermMemoryTurn(options = {}) {
  const store = getLongTermMemoryStore();
  if (!store.settings.enabled) return { added: 0, edges: 0, skipped: true };
  const source = options.source || (options.publicScope ? 'roundtable' : 'private');
  const scope = options.publicScope || source === 'roundtable'
    ? PUBLIC_SCOPE
    : buildMemoryScope(options.characterId || options.speakerId || 'unknown');
  const episodes = buildMemoryEpisodes({ ...options, source, scope });
  const filtered = episodes.filter(item => isUsefulMemory(item.text, store.settings));
  if (!filtered.length) return { added: 0, edges: 0, skipped: true };
  const deleted = new Set(store.deletedIds || []);
  const memoryMap = new Map(store.memories.map(item => [item.id, item]));
  const edgeMap = new Map(store.edges.map(item => [item.id, item]));
  let added = 0;
  let edgeAdded = 0;
  for (const episode of filtered) {
    const memory = createMemoryRecord(episode);
    const existing = memoryMap.get(memory.id);
    memoryMap.set(memory.id, existing ? mergeMemory(existing, memory) : memory);
    if (!existing) added += 1;
    const edges = extractFactEdges(memory, episode);
    for (const edge of edges) {
      if (deleted.has(edge.id)) continue;
      const existingEdge = edgeMap.get(edge.id);
      edge.sourceMemoryIds = [...new Set([...(existingEdge?.sourceMemoryIds || []), memory.id])];
      edgeMap.set(edge.id, existingEdge ? mergeEdge(existingEdge, edge) : edge);
      if (!existingEdge) edgeAdded += 1;
    }
  }
  saveStore({
    ...store,
    memories: [...memoryMap.values()],
    edges: [...edgeMap.values()]
  });
  return { added, edges: edgeAdded, skipped: false };
}

function buildMemoryEpisodes(options = {}) {
  const sourceMessageIds = Array.isArray(options.sourceMessageIds) ? options.sourceMessageIds : [];
  const episodes = [];
  if (options.userText) {
    episodes.push({
      ...options,
      text: `${PLAYER_NAME}在${sourceLabel(options.source)}中提到：${clampText(options.userText, 1200)}`,
      speakerRole: 'player',
      speakerId: 'player',
      speakerName: PLAYER_NAME,
      sourceMessageIds
    });
  }
  if (options.assistantText) {
    const name = options.characterName || options.speakerName || '角色';
    episodes.push({
      ...options,
      text: `${name}在${sourceLabel(options.source)}中回应：${clampText(options.assistantText, 1200)}`,
      speakerRole: 'assistant',
      speakerId: options.speakerId || options.characterId || '',
      speakerName: name,
      sourceMessageIds
    });
  }
  return episodes;
}

function createMemoryRecord(context) {
  const id = createStableMemoryId(context.scope, context.source, context.sourceMessageIds, context.text);
  return {
    id,
    type: inferMemoryType(context.text),
    text: context.text,
    scope: context.scope,
    characterId: context.characterId || characterIdFromScope(context.scope),
    characterName: context.characterName || '',
    source: context.source,
    sourceMessageIds: context.sourceMessageIds || [],
    speakerRole: context.speakerRole,
    speakerId: context.speakerId || '',
    speakerName: context.speakerName || '',
    addresseeId: context.addresseeId || '',
    addresseeName: context.addresseeName || '',
    tags: extractKeywords(context.text).slice(0, 10),
    importance: inferImportance(context.text),
    accessCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function extractFactEdges(memory, context) {
  const source = stripMemoryPrefix(memory.text);
  const head = context.speakerRole === 'assistant'
    ? (context.speakerName || context.characterName || '角色')
    : PLAYER_NAME;
  const edges = [];
  for (const pattern of RELATION_PATTERNS) {
    pattern.re.lastIndex = 0;
    let match;
    while ((match = pattern.re.exec(source)) && edges.length < 8) {
      const tail = normalizeEntity(match[1]);
      if (!tail || isBadEntity(tail)) continue;
      edges.push(createEdgeRecord(memory.scope, head, pattern.relation, tail, {
        characterId: memory.characterId,
        sourceMemoryIds: [memory.id],
        weight: pattern.weight
      }));
    }
  }
  for (const keyword of extractKeywords(source).slice(0, 4)) {
    edges.push(createEdgeRecord(memory.scope, head, memory.scope === PUBLIC_SCOPE ? '共同聊到' : '常聊到', keyword, {
      characterId: memory.characterId,
      sourceMemoryIds: [memory.id],
      weight: 2.2,
      provisional: true
    }));
  }
  return dedupeEdges(edges);
}

function deriveTopicEdges(memories = [], deleted = new Set()) {
  const buckets = new Map();
  for (const memory of memories) {
    const head = memory.speakerRole === 'assistant'
      ? (memory.speakerName || memory.characterName || '角色')
      : PLAYER_NAME;
    for (const keyword of extractKeywords(stripMemoryPrefix(memory.text)).slice(0, 5)) {
      const key = `${memory.scope}|${head}|${keyword}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          scope: memory.scope,
          head,
          tail: keyword,
          characterId: memory.characterId,
          memoryIds: new Set(),
          updatedAt: 0
        });
      }
      const bucket = buckets.get(key);
      bucket.memoryIds.add(memory.id);
      bucket.updatedAt = Math.max(bucket.updatedAt, memory.updatedAt || memory.createdAt || 0);
    }
  }
  const edges = [];
  for (const bucket of buckets.values()) {
    if (bucket.memoryIds.size < 3) continue;
    const relation = bucket.scope === PUBLIC_SCOPE ? '共同聊到' : '常聊到';
    const edge = createEdgeRecord(bucket.scope, bucket.head, relation, bucket.tail, {
      characterId: bucket.characterId,
      sourceMemoryIds: [...bucket.memoryIds],
      weight: Math.min(12, 2 + bucket.memoryIds.size),
      provisional: false,
      updatedAt: bucket.updatedAt
    });
    if (!deleted.has(edge.id)) edges.push(edge);
  }
  return edges;
}

function mergeEdges(edges, deleted = new Set()) {
  const map = new Map();
  for (const edge of edges) {
    if (!edge || deleted.has(edge.id)) continue;
    const current = map.get(edge.id);
    map.set(edge.id, current ? mergeEdge(current, edge) : edge);
  }
  return [...map.values()].sort((a, b) => (b.weight || 0) - (a.weight || 0));
}

function mergeMemory(a, b) {
  return {
    ...a,
    ...b,
    createdAt: Math.min(a.createdAt || Date.now(), b.createdAt || Date.now()),
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0, Date.now()),
    sourceMessageIds: [...new Set([...(a.sourceMessageIds || []), ...(b.sourceMessageIds || [])])],
    tags: [...new Set([...(a.tags || []), ...(b.tags || [])])].slice(0, 24),
    importance: Math.min(10, Math.max(a.importance || 0, b.importance || 0) + 0.2),
    accessCount: Math.max(a.accessCount || 0, b.accessCount || 0)
  };
}

function mergeEdge(a, b) {
  return {
    ...a,
    ...b,
    createdAt: Math.min(a.createdAt || Date.now(), b.createdAt || Date.now()),
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0, Date.now()),
    sourceMemoryIds: [...new Set([...(a.sourceMemoryIds || []), ...(b.sourceMemoryIds || [])])],
    weight: Math.min(20, Math.max(a.weight || 1, b.weight || 1) + 0.4)
  };
}

export function deleteLongTermMemoryEdge(edgeId) {
  const store = getLongTermMemoryStore();
  const target = store.edges.find(edge => edge.id === edgeId);
  if (!target) return { deletedEdges: 0, deletedMemories: 0 };
  const sourceIds = new Set(target.sourceMemoryIds || []);
  const deleted = new Set([...(store.deletedIds || []), edgeId, ...sourceIds]);
  const memories = store.memories.filter(memory => !sourceIds.has(memory.id));
  const edges = store.edges
    .filter(edge => edge.id !== edgeId)
    .map(edge => ({ ...edge, sourceMemoryIds: (edge.sourceMemoryIds || []).filter(id => !sourceIds.has(id)) }))
    .filter(edge => edge.sourceMemoryIds.length > 0);
  saveStore({ ...store, memories, edges, deletedIds: [...deleted] });
  return { deletedEdges: store.edges.length - edges.length, deletedMemories: sourceIds.size };
}

export function deleteLongTermMemoryMemory(memoryId) {
  const store = getLongTermMemoryStore();
  const deleted = new Set([...(store.deletedIds || []), memoryId]);
  const memories = store.memories.filter(memory => memory.id !== memoryId);
  const edges = store.edges
    .map(edge => ({ ...edge, sourceMemoryIds: (edge.sourceMemoryIds || []).filter(id => id !== memoryId) }))
    .filter(edge => edge.sourceMemoryIds.length > 0);
  saveStore({ ...store, memories, edges, deletedIds: [...deleted] });
  return { deletedMemories: store.memories.length - memories.length };
}

export function exportLongTermMemory() {
  return getLongTermMemoryStore();
}

export function importLongTermMemory(data = {}) {
  if (!data || typeof data !== 'object') return { imported: 0, edges: 0, skipped: 0 };
  const current = getLongTermMemoryStore();
  const memories = new Map(current.memories.map(item => [item.id, item]));
  const edges = new Map(current.edges.map(item => [item.id, item]));
  let imported = 0;
  let edgeImported = 0;
  for (const raw of data.memories || []) {
    const memory = normalizeMemory(raw);
    if (!memory || current.deletedIds.includes(memory.id)) continue;
    memories.set(memory.id, memories.has(memory.id) ? mergeMemory(memories.get(memory.id), memory) : memory);
    imported += 1;
  }
  const validIds = new Set(memories.keys());
  for (const raw of data.edges || []) {
    const edge = normalizeEdge(raw, validIds);
    if (!edge || current.deletedIds.includes(edge.id)) continue;
    edges.set(edge.id, edges.has(edge.id) ? mergeEdge(edges.get(edge.id), edge) : edge);
    edgeImported += 1;
  }
  saveStore({ ...current, memories: [...memories.values()], edges: [...edges.values()] });
  return { imported, edges: edgeImported, skipped: 0 };
}

export function buildGraphData(store = getLongTermMemoryStore()) {
  const nodes = new Map();
  const edges = store.edges.filter(edge => !edge.provisional || (edge.sourceMemoryIds || []).length >= 3);
  function node(label, scope) {
    const id = `${scope}:${label}`;
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        label,
        scope,
        kind: scope === PUBLIC_SCOPE ? 'public' : label === PLAYER_NAME ? 'player' : 'character',
        x: 0,
        y: 0
      });
    }
    return nodes.get(id);
  }
  const graphEdges = edges.map(edge => {
    const from = node(edge.head, edge.scope);
    const to = node(edge.tail, edge.scope);
    return { ...edge, from: from.id, to: to.id };
  });
  return { nodes: [...nodes.values()], edges: graphEdges };
}

export function getOrphanMemories(store = getLongTermMemoryStore()) {
  const referenced = new Set();
  for (const edge of store.edges) {
    if (edge.provisional) continue;
    for (const id of edge.sourceMemoryIds || []) referenced.add(id);
  }
  return store.memories.filter(memory => !referenced.has(memory.id));
}

function touchReferencedItems(memoryIds = []) {
  if (!memoryIds.length) return;
  const store = getLongTermMemoryStore();
  const set = new Set(memoryIds);
  let changed = false;
  const memories = store.memories.map(memory => {
    if (!set.has(memory.id)) return memory;
    changed = true;
    return {
      ...memory,
      accessCount: (memory.accessCount || 0) + 1,
      updatedAt: Date.now(),
      importance: Math.min(10, (memory.importance || 3) + 0.05)
    };
  });
  if (changed) saveStore({ ...store, memories });
}

function createEdgeRecord(scope, head, relation, tail, options = {}) {
  const cleanHead = normalizeEntity(head);
  const cleanRelation = clampText(relation, 32);
  const cleanTail = normalizeEntity(tail);
  return {
    id: createEdgeId(scope, cleanHead, cleanRelation, cleanTail),
    scope,
    characterId: options.characterId || characterIdFromScope(scope),
    head: cleanHead,
    relation: cleanRelation,
    tail: cleanTail,
    sourceMemoryIds: options.sourceMemoryIds || [],
    weight: options.weight || 1,
    provisional: Boolean(options.provisional),
    createdAt: Date.now(),
    updatedAt: options.updatedAt || Date.now()
  };
}

function createEdgeId(scope, head, relation, tail) {
  return `edge_${hashString(`${scope}|${head}|${relation}|${tail}`)}`;
}

function createStableMemoryId(scope, source, ids = [], text = '') {
  return `mem_${hashString(`${scope}|${source}|${ids.join(',')}|${text}`)}`;
}

function normalizeScope(scope, characterId = '') {
  const clean = clampText(scope, 120);
  if (clean === PUBLIC_SCOPE) return PUBLIC_SCOPE;
  if (clean.startsWith('private:')) return clean;
  return `private:${characterId || 'unknown'}`;
}

function characterIdFromScope(scope) {
  return String(scope || '').startsWith('private:') ? String(scope).slice('private:'.length) : '';
}

function normalizeEntity(value = '') {
  return clampText(value, 40)
    .replace(/^[：:，,。！？\s]+|[：:，,。！？\s]+$/g, '')
    .replace(/^(的|了|吧|呢|呀|啊|哦)+/, '')
    .trim();
}

function isBadEntity(value = '') {
  if (value.length < 2) return true;
  return /^(什么|怎么|可以吗|不是|因为|所以|这个|那个|一下|一点|今天|明天|昨天)$/.test(value);
}

function stripMemoryPrefix(text = '') {
  return String(text).replace(/^.+?中(?:提到|回应)：/, '').trim();
}

function inferMemoryType(text = '') {
  if (/喜欢|讨厌|想去|记得|在意/.test(text)) return 'fact';
  return 'episode';
}

function inferImportance(text = '') {
  if (/喜欢|爱|恒约|重要|记住|不要忘/.test(text)) return 5.5;
  if (/想去|计划|约定/.test(text)) return 4.4;
  return 3;
}

function isUsefulMemory(text = '', settings = DEFAULT_SETTINGS) {
  const source = stripMemoryPrefix(text);
  if (source.length < 4) return false;
  if (/^(嗯+|啊+|好|好的|知道了|哈哈+|www)$/i.test(source.trim())) return false;
  return !(settings.blockedKeywords || []).some(keyword => keyword && source.includes(keyword));
}

function sourceLabel(source = '') {
  if (source === 'roundtable') return '圆桌密语';
  if (source === 'private') return '私聊';
  return '对话';
}

function extractKeywords(text = '') {
  const tokens = tokenize(text);
  const counts = new Map();
  for (const token of tokens) {
    if (token.length < 2) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(item => item[0])
    .filter(item => !isBadEntity(item))
    .slice(0, 16);
}

function tokenize(text = '') {
  const source = String(text).toLowerCase();
  const tokens = [];
  for (const item of source.match(/[a-z0-9_]{2,}/g) || []) tokens.push(item);
  for (const run of source.match(/[\u3400-\u9fff]{2,}/g) || []) {
    for (let len = 2; len <= Math.min(4, run.length); len += 1) {
      for (let i = 0; i <= run.length - len; i += 1) tokens.push(run.slice(i, i + len));
    }
  }
  return tokens;
}

function scoreText(text, queryTokens, rawQuery = '') {
  const source = String(text || '').toLowerCase();
  let score = rawQuery && source.includes(rawQuery.toLowerCase()) ? 6 : 0;
  const sourceTokens = new Set(tokenize(source));
  for (const token of queryTokens) {
    if (sourceTokens.has(token)) score += token.length >= 3 ? 1.6 : 1;
  }
  return score;
}

function dedupeEdges(edges = []) {
  const map = new Map();
  for (const edge of edges) {
    if (!edge?.id) continue;
    map.set(edge.id, map.has(edge.id) ? mergeEdge(map.get(edge.id), edge) : edge);
  }
  return [...map.values()];
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
