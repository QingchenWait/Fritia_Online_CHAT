import { STORAGE_KEYS, createId, clampText, readFileAsText, saveJson, loadJson } from './storage.js';
import { getAdvancedSettings } from './settings.js';

const DB_NAME = 'fritia_knowledge_base_db';
const DB_VERSION = 1;
const PRELOADED_SOURCE = {
  id: 'chenbai_character_settings_260622',
  path: 'src/_rag_data/chenbai_character_settings_260622.json'
};

const STOP_WORDS = new Set([
  'the', 'and', 'you', 'are', 'for', 'that', 'with', 'this', 'from',
  '一个', '一些', '我们', '你们', '他们', '她们', '以及', '或者', '但是'
]);

let dbPromise = null;

export function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('knowledgeBases')) {
        db.createObjectStore('knowledgeBases', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('files')) {
        const store = db.createObjectStore('files', { keyPath: 'id' });
        store.createIndex('kbId', 'kbId');
      }
      if (!db.objectStoreNames.contains('chunks')) {
        const store = db.createObjectStore('chunks', { keyPath: 'id' });
        store.createIndex('kbId', 'kbId');
        store.createIndex('fileId', 'fileId');
      }
      if (!db.objectStoreNames.contains('indexes')) {
        db.createObjectStore('indexes', { keyPath: 'kbId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
  return dbPromise;
}

async function getAll(storeName) {
  const db = await openDb();
  return requestToPromise(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
}

async function getRecord(storeName, key) {
  const db = await openDb();
  return requestToPromise(db.transaction(storeName, 'readonly').objectStore(storeName).get(key));
}

async function putRecord(storeName, record) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(record);
  await txDone(tx);
  return record;
}

async function getAllByIndex(storeName, indexName, value) {
  const db = await openDb();
  const index = db.transaction(storeName, 'readonly').objectStore(storeName).index(indexName);
  return requestToPromise(index.getAll(value));
}

export function loadKnowledgeState() {
  const state = loadJson(STORAGE_KEYS.knowledgeState, {
    version: 2,
    activeKbId: '',
    activeKbIds: [],
    updatedAt: 0
  });
  const ids = normalizeIdList(state.activeKbIds || (state.activeKbId ? [state.activeKbId] : []));
  return {
    version: 2,
    activeKbId: ids[0] || '',
    activeKbIds: ids,
    updatedAt: Number(state.updatedAt) || 0
  };
}

function saveKnowledgeState(state) {
  const ids = normalizeIdList(state.activeKbIds || []);
  const next = {
    version: 2,
    activeKbId: ids[0] || '',
    activeKbIds: ids,
    updatedAt: Date.now()
  };
  saveJson(STORAGE_KEYS.knowledgeState, next);
  document.dispatchEvent(new CustomEvent('fritia-knowledge-base-updated', { detail: next }));
  return next;
}

export function getActiveKnowledgeBaseIds() {
  return loadKnowledgeState().activeKbIds;
}

export function setActiveKnowledgeBaseIds(ids) {
  return saveKnowledgeState({ activeKbIds: ids });
}

export function toggleActiveKnowledgeBaseId(id) {
  const state = loadKnowledgeState();
  const set = new Set(state.activeKbIds);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return saveKnowledgeState({ activeKbIds: [...set] });
}

function normalizeIdList(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(item => clampText(item, 100))
    .filter(Boolean))];
}

export async function ensurePreloadedKnowledgeBases() {
  const installed = loadJson(STORAGE_KEYS.preloadedKnowledgeState, { version: 1, installedSourceIds: [] });
  if (Array.isArray(installed.installedSourceIds) && installed.installedSourceIds.includes(PRELOADED_SOURCE.id)) {
    return { imported: 0, skipped: true };
  }
  try {
    const response = await fetch(PRELOADED_SOURCE.path);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const archive = await response.json();
    const result = await importKnowledgeBaseArchive(archive, { replace: true });
    saveJson(STORAGE_KEYS.preloadedKnowledgeState, {
      version: 1,
      installedSourceIds: [...new Set([...(installed.installedSourceIds || []), PRELOADED_SOURCE.id])],
      updatedAt: Date.now()
    });
    const ids = (archive.knowledgeBase?.knowledgeBases || []).map(item => item.id).filter(Boolean);
    if (ids.length) setActiveKnowledgeBaseIds(ids);
    return result;
  } catch (err) {
    console.warn('[knowledge] preload failed', err);
    return { imported: 0, skipped: true, error: err.message };
  }
}

export async function listKnowledgeBases() {
  const list = await getAll('knowledgeBases');
  return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function createKnowledgeBase(name) {
  const record = {
    id: createId('kb'),
    name: clampText(name, 80) || '未命名知识库',
    description: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    fileCount: 0,
    chunkCount: 0
  };
  await putRecord('knowledgeBases', record);
  setActiveKnowledgeBaseIds([record.id, ...getActiveKnowledgeBaseIds()]);
  return record;
}

export async function importFilesToKnowledgeBase(kbId, files = []) {
  const imported = [];
  for (const file of files) {
    if (!/\.(txt|md)$/i.test(file.name || '')) continue;
    const text = await readFileAsText(file);
    imported.push(await importTextToKnowledgeBase(kbId, file.name, text, {
      size: file.size,
      type: file.name.toLowerCase().endsWith('.md') ? 'md' : 'txt'
    }));
  }
  await rebuildKnowledgeBaseIndex(kbId);
  document.dispatchEvent(new CustomEvent('fritia-knowledge-base-updated', { detail: { kbId } }));
  return imported;
}

export async function importTextToKnowledgeBase(kbId, fileName, rawText, options = {}) {
  const kb = await getRecord('knowledgeBases', kbId);
  if (!kb) throw new Error('知识库不存在');
  const advanced = getAdvancedSettings();
  const text = cleanMarkdown(rawText);
  const fileId = createId('kbfile');
  const chunks = chunkText(text, {
    size: advanced.kbChunkSize,
    overlap: advanced.kbChunkOverlap
  }).map((chunk, index) => ({
    id: createId('kbchunk'),
    kbId,
    fileId,
    index,
    title: chunk.title || '',
    text: chunk.text,
    tokens: tokenize(chunk.text),
    createdAt: Date.now()
  }));
  const fileRecord = {
    id: fileId,
    kbId,
    name: clampText(fileName, 180) || '未命名.txt',
    type: options.type || 'txt',
    size: Number(options.size) || text.length,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    charCount: text.length,
    chunkCount: chunks.length
  };
  const db = await openDb();
  const tx = db.transaction(['knowledgeBases', 'files', 'chunks'], 'readwrite');
  tx.objectStore('files').put(fileRecord);
  for (const chunk of chunks) tx.objectStore('chunks').put(chunk);
  tx.objectStore('knowledgeBases').put({
    ...kb,
    fileCount: (kb.fileCount || 0) + 1,
    chunkCount: (kb.chunkCount || 0) + chunks.length,
    updatedAt: Date.now()
  });
  await txDone(tx);
  return fileRecord;
}

export async function rebuildKnowledgeBaseIndex(kbId) {
  const chunks = await getAllByIndex('chunks', 'kbId', kbId);
  const docs = chunks.map(chunk => ({
    id: chunk.id,
    kbId: chunk.kbId,
    fileId: chunk.fileId,
    index: chunk.index,
    title: chunk.title || '',
    text: chunk.text || '',
    terms: countTerms(tokenize(`${chunk.title || ''}\n${chunk.text || ''}`))
  }));
  const docCount = docs.length;
  const df = {};
  for (const doc of docs) {
    for (const term of Object.keys(doc.terms)) df[term] = (df[term] || 0) + 1;
  }
  await putRecord('indexes', {
    kbId,
    algorithm: 'bm25-keyword-cjk-1g2g',
    docCount,
    avgLength: docs.reduce((sum, doc) => sum + Object.values(doc.terms).reduce((a, b) => a + b, 0), 0) / Math.max(1, docCount),
    df,
    docs,
    updatedAt: Date.now()
  });
  return docCount;
}

export async function searchKnowledgeBase(query, options = {}) {
  const ids = options.knowledgeBaseIds || getActiveKnowledgeBaseIds();
  const queryTokens = tokenize(query);
  if (!queryTokens.length || !ids.length) return [];
  const results = [];
  for (const kbId of ids) {
    const kb = await getRecord('knowledgeBases', kbId);
    const index = await getRecord('indexes', kbId) || await buildIndexFromChunks(kbId);
    if (!index || !Array.isArray(index.docs)) continue;
    for (const doc of index.docs) {
      const score = scoreDoc(doc, queryTokens, index);
      if (score <= 0) continue;
      results.push({
        ...doc,
        score,
        knowledgeBaseId: kbId,
        knowledgeBaseName: kb?.name || '知识库',
        fileName: await fileNameFor(doc.fileId)
      });
    }
  }
  const limit = options.limit || getAdvancedSettings().kbInjectLimit;
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function buildRagReferenceMessage(options = {}) {
  const query = [
    options.query,
    options.userText,
    ...(Array.isArray(options.history) ? options.history.slice(-6).map(item => item.text || '') : [])
  ].filter(Boolean).join('\n');
  const results = await searchKnowledgeBase(query, { limit: options.limit });
  if (!results.length) return null;
  const content = [
    '以下是当前对话可参考的知识库片段。只在有帮助时使用，不要把参考资料逐字复述给用户。',
    ...results.map((item, index) => {
      const title = item.title ? ` · ${item.title}` : '';
      return `[${index + 1}] 知识库《${item.knowledgeBaseName}》 · ${item.fileName}${title}\n${compactText(item.text, 560)}`;
    })
  ].join('\n\n');
  return { role: 'system', content };
}

async function buildIndexFromChunks(kbId) {
  await rebuildKnowledgeBaseIndex(kbId);
  return getRecord('indexes', kbId);
}

async function fileNameFor(fileId) {
  const file = await getRecord('files', fileId);
  return file?.name || '未知文件';
}

function scoreDoc(doc, queryTokens, index) {
  const k1 = 1.35;
  const b = 0.72;
  const terms = doc.terms || {};
  const docLength = Object.values(terms).reduce((sum, value) => sum + value, 0);
  const avgLength = index.avgLength || 1;
  let score = 0;
  for (const token of queryTokens) {
    const tf = terms[token] || 0;
    if (!tf) continue;
    const df = index.df?.[token] || 1;
    const idf = Math.log(1 + (index.docCount - df + 0.5) / (df + 0.5));
    score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docLength / avgLength)));
  }
  return score;
}

export async function exportKnowledgeBaseArchive() {
  const [knowledgeBases, files, chunks, indexes] = await Promise.all([
    getAll('knowledgeBases'),
    getAll('files'),
    getAll('chunks'),
    getAll('indexes')
  ]);
  return {
    version: 1,
    exportedAt: Date.now(),
    state: loadKnowledgeState(),
    config: {
      chunkSize: getAdvancedSettings().kbChunkSize,
      chunkOverlap: getAdvancedSettings().kbChunkOverlap,
      candidateLimit: getAdvancedSettings().kbCandidateLimit,
      injectLimit: getAdvancedSettings().kbInjectLimit,
      algorithm: 'bm25-keyword-cjk-1g2g'
    },
    knowledgeBases,
    files,
    chunks,
    indexes
  };
}

export async function importKnowledgeBaseArchive(archive, options = {}) {
  const payload = archive?.knowledgeBase || archive?.knowledgeBasesArchive || archive;
  if (!payload || typeof payload !== 'object') return { knowledgeBases: 0, files: 0, chunks: 0, skipped: 0 };
  const knowledgeBases = Array.isArray(payload.knowledgeBases) ? payload.knowledgeBases.map(normalizeKb).filter(Boolean) : [];
  const files = Array.isArray(payload.files) ? payload.files.map(normalizeFile).filter(Boolean) : [];
  const chunks = Array.isArray(payload.chunks) ? payload.chunks.map(normalizeChunk).filter(Boolean) : [];
  const indexes = Array.isArray(payload.indexes) ? payload.indexes : [];
  const db = await openDb();
  const tx = db.transaction(['knowledgeBases', 'files', 'chunks', 'indexes'], 'readwrite');
  const kbStore = tx.objectStore('knowledgeBases');
  const fileStore = tx.objectStore('files');
  const chunkStore = tx.objectStore('chunks');
  const indexStore = tx.objectStore('indexes');
  for (const kb of knowledgeBases) kbStore.put(kb);
  for (const file of files) fileStore.put(file);
  for (const chunk of chunks) chunkStore.put(chunk);
  for (const index of indexes) {
    if (index?.kbId) indexStore.put(index);
  }
  await txDone(tx);
  if (payload.state?.activeKbIds?.length) setActiveKnowledgeBaseIds(payload.state.activeKbIds);
  if (options.replace !== false) {
    for (const kb of knowledgeBases) await rebuildKnowledgeBaseIndex(kb.id);
  }
  document.dispatchEvent(new CustomEvent('fritia-knowledge-base-updated', { detail: { imported: true } }));
  return { knowledgeBases: knowledgeBases.length, files: files.length, chunks: chunks.length, skipped: 0 };
}

function normalizeKb(raw = {}) {
  const id = clampText(raw.id, 100);
  if (!id) return null;
  return {
    id,
    name: clampText(raw.name, 120) || '知识库',
    description: clampText(raw.description, 500),
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
    fileCount: Math.max(0, Number(raw.fileCount) || 0),
    chunkCount: Math.max(0, Number(raw.chunkCount) || 0)
  };
}

function normalizeFile(raw = {}) {
  const id = clampText(raw.id, 100);
  const kbId = clampText(raw.kbId, 100);
  if (!id || !kbId) return null;
  return {
    id,
    kbId,
    name: clampText(raw.name, 180) || '文件',
    type: clampText(raw.type || 'txt', 20),
    size: Math.max(0, Number(raw.size) || 0),
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
    charCount: Math.max(0, Number(raw.charCount) || 0),
    chunkCount: Math.max(0, Number(raw.chunkCount) || 0)
  };
}

function normalizeChunk(raw = {}) {
  const id = clampText(raw.id, 100);
  const kbId = clampText(raw.kbId, 100);
  const fileId = clampText(raw.fileId, 100);
  if (!id || !kbId || !fileId) return null;
  return {
    id,
    kbId,
    fileId,
    index: Math.max(0, Number(raw.index) || 0),
    title: clampText(raw.title, 240),
    text: clampText(raw.text, 6000),
    tokens: Array.isArray(raw.tokens) ? raw.tokens : tokenize(raw.text || ''),
    createdAt: Number(raw.createdAt) || Date.now()
  };
}

export async function getKnowledgeBaseFiles(kbId) {
  return getAllByIndex('files', 'kbId', kbId);
}

export async function getKnowledgeBaseChunks(kbId, fileId = '') {
  const chunks = fileId
    ? await getAllByIndex('chunks', 'fileId', fileId)
    : await getAllByIndex('chunks', 'kbId', kbId);
  return chunks.sort((a, b) => a.index - b.index);
}

function cleanMarkdown(rawText) {
  return String(rawText || '')
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, match => match.replace(/```/g, ''))
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function chunkText(text, options = {}) {
  const size = Math.max(200, Number(options.size) || 512);
  const overlap = Math.max(0, Math.min(size - 1, Number(options.overlap) || 50));
  const lines = text.split('\n');
  const segments = [];
  let heading = '';
  let buffer = '';
  for (const line of lines) {
    const trimmed = line.trim();
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      if (buffer.trim()) segments.push({ title: heading, text: buffer.trim() });
      heading = headingMatch[2].trim();
      buffer = '';
      continue;
    }
    buffer += `${trimmed}\n`;
  }
  if (buffer.trim()) segments.push({ title: heading, text: buffer.trim() });
  const chunks = [];
  for (const segment of segments.length ? segments : [{ title: '', text }]) {
    let start = 0;
    while (start < segment.text.length) {
      const part = segment.text.slice(start, start + size).trim();
      if (part) chunks.push({ title: segment.title, text: part });
      if (start + size >= segment.text.length) break;
      start += size - overlap;
    }
  }
  return chunks;
}

function tokenize(text) {
  const source = String(text || '').toLowerCase();
  const tokens = [];
  const latin = source.match(/[a-z0-9_]{2,}/g) || [];
  for (const token of latin) {
    if (!STOP_WORDS.has(token)) tokens.push(token);
  }
  const cjk = source.match(/[\u3400-\u9fff]+/g) || [];
  for (const run of cjk) {
    for (const char of [...run]) {
      if (!STOP_WORDS.has(char)) tokens.push(char);
    }
    for (let i = 0; i < run.length - 1; i += 1) {
      const gram = run.slice(i, i + 2);
      if (!STOP_WORDS.has(gram)) tokens.push(gram);
    }
  }
  return tokens;
}

function countTerms(tokens) {
  const result = {};
  for (const token of tokens) result[token] = (result[token] || 0) + 1;
  return result;
}

function compactText(text, maxLength = 560) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  return source.length > maxLength ? `${source.slice(0, maxLength)}...` : source;
}
