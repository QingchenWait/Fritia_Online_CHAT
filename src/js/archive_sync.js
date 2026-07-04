import { STORAGE_KEYS, loadAppStore, loadJson, saveJson } from './storage.js';
import { getSettings, getAdvancedSettings } from './settings.js';

const ARCHIVE_CONFIG_KEY = 'fritia_archive_sync';
const ARCHIVE_SCHEMA_VERSION = 1;
const ZIP_MIME = 'application/zip';
const SYNC_FILE_PREFIX = 'fritia-sync-v1';
const DEFAULT_SYNC_PATH = '/fritia-online-chat';
const DEFAULT_INTERVAL_MINUTES = 30;
const LOCAL_STORAGE_PREFIXES = ['fritia_', 'fritia-'];

const IDB_SCHEMAS = [
  {
    name: 'fritia_media_store',
    version: 1,
    stores: [
      { name: 'media', options: { keyPath: 'id' } }
    ]
  },
  {
    name: 'fritia_knowledge_base_db',
    version: 2,
    stores: [
      { name: 'knowledgeBases', options: { keyPath: 'id' } },
      { name: 'files', options: { keyPath: 'id' }, indexes: [{ name: 'kbId', keyPath: 'kbId' }] },
      {
        name: 'chunks',
        options: { keyPath: 'id' },
        indexes: [
          { name: 'kbId', keyPath: 'kbId' },
          { name: 'fileId', keyPath: 'fileId' }
        ]
      },
      { name: 'indexes', options: { keyPath: 'kbId' } }
    ]
  }
];

let syncTimer = 0;
let pendingConflict = null;
let lastStatus = {
  phase: 'idle',
  label: '等待同步',
  progress: 0
};

export function getWebDavConfig() {
  return normalizeWebDavConfig(loadJson(ARCHIVE_CONFIG_KEY, {}));
}

export function saveWebDavConfig(next = {}) {
  const config = normalizeWebDavConfig({ ...getWebDavConfig(), ...next });
  saveJson(ARCHIVE_CONFIG_KEY, config);
  scheduleArchiveSync();
  dispatchArchiveUpdate();
  return config;
}

export function startArchiveSync() {
  scheduleArchiveSync();
  const config = getWebDavConfig();
  if (config.enabled && config.url && config.username) {
    window.setTimeout(() => {
      syncWebDavNow({ reason: 'auto-start' }).catch(error => {
        setSyncStatus('error', error.message || '自动同步失败', 0);
      });
    }, 5000);
  }
}

export async function getArchiveStats() {
  const config = getWebDavConfig();
  const snapshot = await buildArchiveSnapshot();
  const localSize = snapshot.manifest.totalSize || 0;
  return {
    connected: Boolean(config.enabled && config.url && config.username),
    statusText: config.lastStatus || (config.enabled ? '等待同步' : '未启用'),
    lastBackupAt: config.lastBackupAt || 0,
    lastBackupSize: config.lastBackupSize || 0,
    backupCount: config.backupCount || 0,
    lastSyncAt: config.lastSyncAt || 0,
    localSize,
    localUpdatedAt: snapshot.manifest.updatedAt || 0,
    intervalMinutes: config.intervalMinutes,
    remotePath: normalizePath(config.path),
    serverUrl: config.url,
    username: config.username
  };
}

export async function exportArchiveZip(options = {}) {
  setSyncStatus('working', '正在收集本地数据', 0.08, options);
  const snapshot = await buildArchiveSnapshot({ includeArchiveConfig: true });
  const files = snapshotToFiles(snapshot);
  setSyncStatus('working', '正在生成 ZIP 备份', 0.72, options);
  const blob = createZipBlob(files);
  const filename = `fritia-next-archive-${formatFilenameDate(Date.now())}.zip`;
  downloadBlob(filename, blob);
  const config = getWebDavConfig();
  saveWebDavConfig({
    ...config,
    lastBackupAt: Date.now(),
    lastBackupSize: blob.size,
    backupCount: (config.backupCount || 0) + 1,
    backupHistory: [
      { at: Date.now(), size: blob.size, name: filename },
      ...(config.backupHistory || [])
    ].slice(0, 10),
    lastStatus: '已创建本地备份'
  });
  setSyncStatus('idle', 'ZIP 备份已导出', 1, options);
  return { filename, size: blob.size };
}

export async function importArchiveZipFile(file, options = {}) {
  if (!file) throw new Error('请选择需要导入的 ZIP 存档。');
  setSyncStatus('working', '正在读取 ZIP 存档', 0.08, options);
  const buffer = await file.arrayBuffer();
  const files = parseZipFiles(buffer);
  setSyncStatus('working', '正在解析存档内容', 0.32, options);
  const snapshot = filesToSnapshot(files);
  await applyArchiveSnapshot(snapshot, progress => {
    setSyncStatus('working', '正在恢复本地数据', 0.32 + progress * 0.58, options);
  });
  saveWebDavConfig({
    ...getWebDavConfig(),
    lastStatus: '已导入本地存档'
  });
  setSyncStatus('idle', '存档导入完成', 1, options);
  return snapshot.manifest;
}

export async function testWebDavConnection(options = {}) {
  const config = getWebDavConfig();
  assertWebDavConfig(config);
  setSyncStatus('working', '正在测试 WebDAV 连接', 0.2, options);
  await ensureRemoteDirectory(config);
  const response = await webDavFetch(config, remoteUrl(config, 'manifest.json'), {
    method: 'PROPFIND',
    headers: { Depth: '0' }
  });
  if (!response.ok && response.status !== 404 && response.status !== 207 && response.status !== 405) {
    throw new Error(`WebDAV 连接失败：${response.status} ${response.statusText}`);
  }
  saveWebDavConfig({ ...config, lastStatus: '连接测试成功' });
  setSyncStatus('idle', '连接测试成功', 1, options);
  return true;
}

export async function syncWebDavNow(options = {}) {
  const config = getWebDavConfig();
  assertWebDavConfig(config);
  setSyncStatus('working', '正在准备同步数据', 0.05, options);
  await ensureRemoteDirectory(config);
  const localSnapshot = await buildArchiveSnapshot();
  const localManifestHash = localSnapshot.manifest.hash;
  const remoteManifest = await fetchRemoteManifest(config);
  const remoteManifestHash = remoteManifest?.hash || '';
  const localChanged = Boolean(config.lastLocalManifestHash && config.lastLocalManifestHash !== localManifestHash);
  const remoteChanged = Boolean(config.lastRemoteManifestHash && remoteManifestHash && config.lastRemoteManifestHash !== remoteManifestHash);

  if (remoteManifest && (localChanged && remoteChanged || (!config.lastSyncAt && remoteManifestHash && localManifestHash !== remoteManifestHash))) {
    pendingConflict = {
      config,
      localSnapshot,
      remoteManifest,
      local: summarizeManifest(localSnapshot.manifest),
      remote: summarizeManifest(remoteManifest)
    };
    dispatchArchiveConflict(pendingConflict);
    setSyncStatus('conflict', '检测到云端与本地存档冲突', 1, options);
    return { conflict: true };
  }

  if (remoteManifest && remoteChanged && !localChanged) {
    await applyRemoteSnapshot(config, remoteManifest, options);
    return { direction: 'remote-to-local' };
  }

  await uploadSnapshot(config, localSnapshot, remoteManifest, options);
  return { direction: 'local-to-remote' };
}

export async function resolveArchiveConflict(choice, options = {}) {
  if (!pendingConflict) return null;
  const conflict = pendingConflict;
  pendingConflict = null;
  if (choice === 'remote') {
    await applyRemoteSnapshot(conflict.config, conflict.remoteManifest, options);
    return { direction: 'remote-to-local' };
  }
  await uploadSnapshot(conflict.config, conflict.localSnapshot, conflict.remoteManifest, options);
  return { direction: 'local-to-remote' };
}

export function formatArchiveSize(size) {
  const bytes = Math.max(0, Number(size) || 0);
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function formatArchiveDate(ts) {
  if (!ts) return '从未';
  const date = new Date(ts);
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function buildArchiveSnapshot(options = {}) {
  const localStorageData = collectLocalStorageData(options);
  const indexedDb = {};
  for (const schema of IDB_SCHEMAS) {
    indexedDb[schema.name] = await exportIndexedDb(schema);
  }
  const manifest = createManifest(localStorageData, indexedDb);
  return {
    version: ARCHIVE_SCHEMA_VERSION,
    exportedAt: Date.now(),
    manifest,
    localStorage: localStorageData,
    indexedDb
  };
}

function collectLocalStorageData(options = {}) {
  const result = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || (key === ARCHIVE_CONFIG_KEY && !options.includeArchiveConfig)) continue;
    if (!LOCAL_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix))) continue;
    result[key] = localStorage.getItem(key) || '';
  }
  for (const key of Object.values(STORAGE_KEYS)) {
    if (key === ARCHIVE_CONFIG_KEY) continue;
    result[key] = localStorage.getItem(key) || '';
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

async function exportIndexedDb(schema) {
  const db = await openArchiveDb(schema);
  const stores = {};
  for (const store of schema.stores) {
    stores[store.name] = await getAllFromStore(db, store.name);
  }
  db.close();
  return stores;
}

async function openArchiveDb(schema) {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('当前浏览器不支持 IndexedDB。'));
      return;
    }
    const request = indexedDB.open(schema.name, schema.version);
    request.onupgradeneeded = () => ensureArchiveDbSchema(request.result, request.transaction, schema);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error(`打开 ${schema.name} 失败。`));
  });
}

function ensureArchiveDbSchema(db, tx, schema) {
  for (const storeDef of schema.stores) {
    const store = db.objectStoreNames.contains(storeDef.name)
      ? tx.objectStore(storeDef.name)
      : db.createObjectStore(storeDef.name, storeDef.options || { keyPath: 'id' });
    for (const indexDef of storeDef.indexes || []) {
      if (!store.indexNames.contains(indexDef.name)) {
        store.createIndex(indexDef.name, indexDef.keyPath, indexDef.options || {});
      }
    }
  }
}

function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error(`读取 ${storeName} 失败。`));
  });
}

async function applyArchiveSnapshot(snapshot, onProgress = () => {}) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('存档格式无效。');
  const localStorageData = snapshot.localStorage || {};
  let step = 0;
  const totalSteps = 1 + IDB_SCHEMAS.length;
  clearArchivedLocalStorageKeys();
  for (const [key, value] of Object.entries(localStorageData)) {
    if (key === ARCHIVE_CONFIG_KEY) continue;
    localStorage.setItem(key, String(value ?? ''));
  }
  step += 1;
  onProgress(step / totalSteps);
  for (const schema of IDB_SCHEMAS) {
    await importIndexedDb(schema, snapshot.indexedDb?.[schema.name] || {});
    step += 1;
    onProgress(step / totalSteps);
  }
  dispatchRestoreEvents();
}

async function importIndexedDb(schema, stores) {
  const db = await openArchiveDb(schema);
  const storeNames = schema.stores.map(store => store.name);
  await new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    for (const storeName of storeNames) tx.objectStore(storeName).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error(`清空 ${schema.name} 失败。`));
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    for (const storeName of storeNames) {
      const store = tx.objectStore(storeName);
      for (const record of Array.isArray(stores[storeName]) ? stores[storeName] : []) {
        store.put(record);
      }
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error(`恢复 ${schema.name} 失败。`));
  });
  db.close();
}

function dispatchRestoreEvents() {
  document.dispatchEvent(new CustomEvent('fritia-next-chat-store-updated', { detail: loadAppStore() }));
  document.dispatchEvent(new CustomEvent('fritia-settings-updated', { detail: getSettings() }));
  document.dispatchEvent(new CustomEvent('fritia-advanced-settings-updated', { detail: getAdvancedSettings() }));
  document.dispatchEvent(new CustomEvent('fritia-knowledge-base-updated', { detail: { restored: true } }));
  document.dispatchEvent(new CustomEvent('fritia-long-term-memory-updated', { detail: { restored: true } }));
  document.dispatchEvent(new CustomEvent('fritia-stickers-updated', { detail: { restored: true } }));
  document.dispatchEvent(new CustomEvent('fritia-archive-sync-updated', { detail: getWebDavConfig() }));
  scheduleArchiveSync();
}

function createManifest(localStorageData, indexedDb) {
  const entries = [];
  for (const [key, value] of Object.entries(localStorageData)) {
    const content = JSON.stringify({ key, value });
    entries.push(createEntryMeta(`localStorage/${safeName(key)}.json`, content, updatedAtFromLocalStorageValue(value), 'localStorage'));
  }
  for (const [dbName, stores] of Object.entries(indexedDb)) {
    for (const [storeName, records] of Object.entries(stores)) {
      const content = JSON.stringify(records);
      entries.push(createEntryMeta(`indexeddb/${dbName}/${storeName}.json`, content, updatedAtFromRecords(records), 'indexedDb'));
    }
  }
  const totalSize = entries.reduce((sum, item) => sum + item.size, 0);
  const updatedAt = Math.max(Date.now(), ...entries.map(item => item.updatedAt || 0));
  const hash = hashString(JSON.stringify(entries.map(({ path, hash }) => ({ path, hash }))));
  return {
    version: ARCHIVE_SCHEMA_VERSION,
    app: 'fritia-online-next',
    exportedAt: Date.now(),
    updatedAt,
    totalSize,
    hash,
    entries
  };
}

function createEntryMeta(path, content, updatedAt, kind) {
  return {
    path,
    kind,
    size: byteLength(content),
    updatedAt: Number(updatedAt) || Date.now(),
    hash: hashString(content)
  };
}

function snapshotToFiles(snapshot) {
  const files = [];
  for (const [key, value] of Object.entries(snapshot.localStorage || {})) {
    files.push({
      path: `localStorage/${safeName(key)}.json`,
      content: JSON.stringify({ key, value }, null, 2)
    });
  }
  for (const [dbName, stores] of Object.entries(snapshot.indexedDb || {})) {
    for (const [storeName, records] of Object.entries(stores)) {
      files.push({
        path: `indexeddb/${dbName}/${storeName}.json`,
        content: JSON.stringify(records || [], null, 2)
      });
    }
  }
  files.push({ path: 'manifest.json', content: JSON.stringify(snapshot.manifest, null, 2) });
  return files;
}

function filesToSnapshot(fileMap) {
  const manifest = readJsonFile(fileMap, 'manifest.json') || {};
  const localStorageData = {};
  const indexedDb = {};
  for (const [path, content] of Object.entries(fileMap)) {
    if (path.startsWith('localStorage/') && path.endsWith('.json')) {
      const item = parseJson(content);
      if (item?.key) localStorageData[item.key] = String(item.value ?? '');
    }
    if (path.startsWith('indexeddb/') && path.endsWith('.json')) {
      const [, dbName, storeNameWithExt] = path.split('/');
      const storeName = storeNameWithExt?.replace(/\.json$/i, '');
      if (!dbName || !storeName) continue;
      indexedDb[dbName] ||= {};
      indexedDb[dbName][storeName] = parseJson(content) || [];
    }
  }
  return {
    version: ARCHIVE_SCHEMA_VERSION,
    exportedAt: manifest.exportedAt || Date.now(),
    manifest,
    localStorage: localStorageData,
    indexedDb
  };
}

async function uploadSnapshot(config, snapshot, remoteManifest, options) {
  const files = snapshotToFiles(snapshot);
  const remoteHashes = new Map((remoteManifest?.entries || []).map(item => [item.path, item.hash]));
  let completed = 0;
  for (const file of files) {
    const content = typeof file.content === 'string' ? file.content : JSON.stringify(file.content);
    if (file.path !== 'manifest.json' && remoteHashes.get(file.path) === hashString(content)) {
      completed += 1;
      continue;
    }
    setSyncStatus('working', `正在上传 ${file.path}`, Math.min(0.92, completed / Math.max(files.length, 1)), options);
    await putRemoteText(config, file.path, content);
    completed += 1;
  }
  await putRemoteText(config, 'manifest.json', JSON.stringify(snapshot.manifest, null, 2));
  const now = Date.now();
  saveWebDavConfig({
    ...config,
    lastSyncAt: now,
    lastStatus: '已同步到 WebDAV',
    lastLocalManifestHash: snapshot.manifest.hash,
    lastRemoteManifestHash: snapshot.manifest.hash,
    lastRemoteUpdatedAt: snapshot.manifest.updatedAt,
    lastRemoteSize: snapshot.manifest.totalSize
  });
  setSyncStatus('idle', '同步完成', 1, options);
}

async function applyRemoteSnapshot(config, remoteManifest, options) {
  setSyncStatus('working', '正在下载云端存档', 0.08, options);
  const fileMap = {};
  const entries = remoteManifest.entries || [];
  let completed = 0;
  for (const entry of entries) {
    fileMap[entry.path] = await getRemoteText(config, entry.path);
    completed += 1;
    setSyncStatus('working', `正在下载 ${entry.path}`, 0.08 + completed / Math.max(entries.length, 1) * 0.48, options);
  }
  fileMap['manifest.json'] = JSON.stringify(remoteManifest);
  const snapshot = filesToSnapshot(fileMap);
  await applyArchiveSnapshot(snapshot, progress => {
    setSyncStatus('working', '正在应用云端数据', 0.58 + progress * 0.34, options);
  });
  saveWebDavConfig({
    ...config,
    lastSyncAt: Date.now(),
    lastStatus: '已从 WebDAV 恢复',
    lastLocalManifestHash: remoteManifest.hash,
    lastRemoteManifestHash: remoteManifest.hash,
    lastRemoteUpdatedAt: remoteManifest.updatedAt,
    lastRemoteSize: remoteManifest.totalSize
  });
  setSyncStatus('idle', '云端数据已应用', 1, options);
}

async function fetchRemoteManifest(config) {
  const response = await webDavFetch(config, remoteUrl(config, 'manifest.json'), { method: 'GET' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`读取云端同步清单失败：${response.status} ${response.statusText}`);
  return response.json();
}

async function putRemoteText(config, path, content) {
  await ensureRemotePathDirectories(config, path);
  const response = await webDavFetch(config, remoteUrl(config, path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: content
  });
  if (!response.ok && response.status !== 201 && response.status !== 204) {
    throw new Error(`上传 ${path} 失败：${response.status} ${response.statusText}`);
  }
}

async function ensureRemotePathDirectories(config, filePath) {
  const parts = String(filePath || '').split('/').filter(Boolean);
  parts.pop();
  if (!parts.length) return;
  let current = `${normalizePath(config.path)}/${SYNC_FILE_PREFIX}`.replace(/\/+/g, '/');
  for (const part of parts) {
    current = `${current}/${part}`;
    const response = await webDavFetch(config, buildUrl(config.url, current), { method: 'MKCOL' });
    if (![200, 201, 204, 405].includes(response.status)) {
      throw new Error(`创建 WebDAV 子目录失败：${response.status} ${response.statusText}`);
    }
  }
}

async function getRemoteText(config, path) {
  const response = await webDavFetch(config, remoteUrl(config, path), { method: 'GET' });
  if (!response.ok) throw new Error(`下载 ${path} 失败：${response.status} ${response.statusText}`);
  return response.text();
}

async function ensureRemoteDirectory(config) {
  const parts = `${normalizePath(config.path)}/${SYNC_FILE_PREFIX}`.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    const response = await webDavFetch(config, buildUrl(config.url, current), { method: 'MKCOL' });
    if (![200, 201, 204, 405].includes(response.status)) {
      throw new Error(`创建 WebDAV 路径失败：${response.status} ${response.statusText}`);
    }
  }
}

function clearArchivedLocalStorageKeys() {
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || key === ARCHIVE_CONFIG_KEY) continue;
    if (LOCAL_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix))) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
}

function webDavFetch(config, url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Basic ${basicAuthToken(config.username, config.password)}`
    }
  });
}

function remoteUrl(config, filePath) {
  return buildUrl(config.url, `${normalizePath(config.path)}/${SYNC_FILE_PREFIX}/${filePath}`.replace(/\/+/g, '/'));
}

function buildUrl(base, path) {
  const cleanBase = String(base || '').trim().replace(/\/+$/, '');
  const cleanPath = normalizePath(path);
  return `${cleanBase}${cleanPath}`;
}

function normalizePath(path) {
  const source = String(path || DEFAULT_SYNC_PATH).trim() || DEFAULT_SYNC_PATH;
  return `/${source.replace(/^\/+|\/+$/g, '')}`;
}

function normalizeWebDavConfig(raw = {}) {
  return {
    enabled: raw.enabled === true,
    url: String(raw.url || '').trim().replace(/\/+$/, ''),
    path: normalizePath(raw.path || DEFAULT_SYNC_PATH),
    username: String(raw.username || '').trim(),
    password: String(raw.password || ''),
    intervalMinutes: Math.max(5, Math.min(1440, Math.round(Number(raw.intervalMinutes) || DEFAULT_INTERVAL_MINUTES))),
    lastSyncAt: Number(raw.lastSyncAt) || 0,
    lastBackupAt: Number(raw.lastBackupAt) || 0,
    lastBackupSize: Math.max(0, Number(raw.lastBackupSize) || 0),
    backupCount: Math.max(0, Number(raw.backupCount) || 0),
    backupHistory: Array.isArray(raw.backupHistory) ? raw.backupHistory.slice(0, 10) : [],
    lastStatus: String(raw.lastStatus || ''),
    lastError: String(raw.lastError || ''),
    lastLocalManifestHash: String(raw.lastLocalManifestHash || ''),
    lastRemoteManifestHash: String(raw.lastRemoteManifestHash || ''),
    lastRemoteUpdatedAt: Number(raw.lastRemoteUpdatedAt) || 0,
    lastRemoteSize: Math.max(0, Number(raw.lastRemoteSize) || 0),
    deviceId: String(raw.deviceId || createDeviceId())
  };
}

function assertWebDavConfig(config) {
  if (!config.url) throw new Error('请先填写 WebDAV 服务器地址。');
  if (!/^https?:\/\//i.test(config.url)) throw new Error('WebDAV 地址必须以 http:// 或 https:// 开头。');
  if (!config.username) throw new Error('请填写 WebDAV 用户名。');
}

function scheduleArchiveSync() {
  window.clearInterval(syncTimer);
  const config = getWebDavConfig();
  if (!config.enabled) return;
  syncTimer = window.setInterval(() => {
    syncWebDavNow({ reason: 'timer' }).catch(error => {
      saveWebDavConfig({ ...getWebDavConfig(), lastStatus: '同步失败', lastError: error.message || String(error) });
      setSyncStatus('error', error.message || '同步失败', 0);
    });
  }, Math.max(5, config.intervalMinutes) * 60 * 1000);
}

function setSyncStatus(phase, label, progress, options = {}) {
  lastStatus = { phase, label, progress: Math.max(0, Math.min(1, Number(progress) || 0)) };
  options.onProgress?.(lastStatus);
  document.dispatchEvent(new CustomEvent('fritia-archive-sync-status', { detail: lastStatus }));
}

function dispatchArchiveUpdate() {
  document.dispatchEvent(new CustomEvent('fritia-archive-sync-updated', { detail: getWebDavConfig() }));
}

function dispatchArchiveConflict(conflict) {
  document.dispatchEvent(new CustomEvent('fritia-archive-conflict', {
    detail: {
      local: conflict.local,
      remote: conflict.remote
    }
  }));
}

function summarizeManifest(manifest) {
  return {
    updatedAt: manifest.updatedAt || manifest.exportedAt || 0,
    size: manifest.totalSize || 0,
    hash: manifest.hash || ''
  };
}

function updatedAtFromLocalStorageValue(value) {
  const parsed = parseJson(value);
  return Math.max(
    Number(parsed?.updatedAt) || 0,
    Number(parsed?.lastSyncAt) || 0,
    Number(parsed?.lastBackupAt) || 0,
    Number(parsed?.createdAt) || 0,
    Date.now()
  );
}

function updatedAtFromRecords(records) {
  return Math.max(Date.now(), ...(Array.isArray(records) ? records.map(item => Math.max(
    Number(item?.updatedAt) || 0,
    Number(item?.createdAt) || 0
  )) : []));
}

function readJsonFile(fileMap, path) {
  return parseJson(fileMap[path]);
}

function parseJson(value) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return null;
  }
}

function byteLength(text) {
  return new TextEncoder().encode(String(text || '')).length;
}

function safeName(value) {
  return encodeURIComponent(String(value || '')).replace(/%/g, '_');
}

function hashString(value) {
  const source = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function createDeviceId() {
  return `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function basicAuthToken(username, password) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function formatFilenameDate(ts) {
  const date = new Date(ts);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0')
  ].join('');
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function createZipBlob(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const dataBytes = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const crc = crc32(dataBytes);
    const localHeader = createZipLocalHeader(nameBytes, dataBytes.length, crc);
    localParts.push(localHeader, dataBytes);
    centralParts.push(createZipCentralHeader(nameBytes, dataBytes.length, crc, offset));
    offset += localHeader.length + dataBytes.length;
  }
  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = createZipEndRecord(files.length, centralSize, centralOffset);
  return new Blob([...localParts, ...centralParts, end], { type: ZIP_MIME });
}

function createZipLocalHeader(nameBytes, size, crc) {
  const bytes = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameBytes.length, true);
  bytes.set(nameBytes, 30);
  return bytes;
}

function createZipCentralHeader(nameBytes, size, crc, offset) {
  const bytes = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint32(42, offset, true);
  bytes.set(nameBytes, 46);
  return bytes;
}

function createZipEndRecord(count, centralSize, centralOffset) {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  return bytes;
}

function parseZipFiles(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const files = {};
  let offset = 0;
  while (offset + 30 < bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    if (method !== 0) throw new Error('当前仅支持导入本客户端导出的 ZIP 存档。');
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const path = decoder.decode(bytes.slice(nameStart, nameStart + fileNameLength));
    files[path] = decoder.decode(bytes.slice(dataStart, dataStart + compressedSize));
    offset = dataStart + compressedSize;
  }
  if (!files['manifest.json']) throw new Error('ZIP 存档缺少 manifest.json。');
  return files;
}

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();
