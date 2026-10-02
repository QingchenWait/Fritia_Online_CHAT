import { STORAGE_KEYS, loadAppStore, loadJson, saveJson } from './storage.js';
import { getSettings, getAdvancedSettings } from './settings.js';
import { isBrowserFrontendRuntime } from './runtime_env.js';
import { runIncrementalSync } from './archive_sync_v2.js';
import { archiveState, saveRecovery } from './archive_state.js';
import { archiveFetch, chooseArchiveDestination } from './archive_io.js';
import { stableJson, digestText } from './archive_merge.js';
import { readLegacyArchive } from './archive_legacy.js';

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
  const filename = `fritia-chat-archive-${formatFilenameDate(Date.now())}.zip`;
  const write = await chooseArchiveDestination(filename);
  if (!write) { setSyncStatus('idle', '已取消导出', 0, options); return { cancelled: true }; }
  setSyncStatus('working', '正在收集本地数据', 0.08, options);
  const snapshot = await buildArchiveSnapshot({ includeArchiveConfig: true });
  const files = snapshotToFiles(snapshot);
  setSyncStatus('working', '正在生成 ZIP 备份', 0.72, options);
  const blob = createZipBlob(files);
  const result = await write(blob);
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
  setSyncStatus('idle', result?.browserDownload ? '已交给浏览器下载；此环境不支持指定路径，可在浏览器设置中开启下载前询问位置' : 'ZIP 备份已保存到所选位置', 1, options);
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
  await ensureWebDavCorsSupport(config, options);
  setSyncStatus('working', '正在测试 WebDAV 连接', 0.2, options);
  await ensureRemoteDirectory(config, 'fritia-sync-v2');
  const response = await webDavFetch(config, buildUrl(config.url, `${normalizePath(config.path)}/fritia-sync-v2/`), {
    method: 'PROPFIND',
    headers: { Depth: '0' }
  });
  if (!response.ok && response.status !== 207) {
    throw new Error(`WebDAV 连接失败：${response.status} ${response.statusText}`);
  }
  saveWebDavConfig({ ...config, lastStatus: '连接测试成功' });
  setSyncStatus('idle', '连接测试成功', 1, options);
  return true;
}

export async function ensureWebDavCorsSupport(config = getWebDavConfig(), options = {}) {
  if (!isBrowserFrontendRuntime()) return true;
  const normalized = normalizeWebDavConfig(config);
  assertWebDavConfig(normalized);
  setSyncStatus('working', '正在检测 WebDAV 浏览器 CORS 支持', 0.18, options);
  try {
    await webDavFetch(normalized, remoteUrl(normalized, 'manifest.json'), { method: 'OPTIONS' });
    setSyncStatus('idle', 'WebDAV 浏览器 CORS 检测通过', 1, options);
    return true;
  } catch (error) {
    throw new Error('错误：该 WebDAV 服务商不支持浏览器同步，请更换服务商或下载客户端。');
  }
}

export async function syncWebDavNow(options = {}, choices) {
  const config = getWebDavConfig();
  assertWebDavConfig(config);
  return runIncrementalSync({
    config, request: webDavFetch, snapshot: buildArchiveSnapshot,
    apply: (snapshot, expected) => applyArchiveSnapshot(snapshot, () => {}, { merge: true, expected }),
    status: (phase, label, progress) => setSyncStatus(phase, label, progress, options),
    conflict: detail => {
      pendingConflict = detail;
      document.dispatchEvent(new CustomEvent('fritia-archive-conflict', { detail }));
    },
    ensureDirectory: (config, prefix) => ensureRemoteDirectory(config, prefix),
    readLegacy: async config => {
      const target = await digestText(JSON.stringify([config.url, config.path, config.username]));
      const key = `legacy/${target}`;
      const cached = await archiveState(key) || {};
      const result = await readLegacyArchive({
        read: (path, headers) => webDavFetch(config, remoteUrl(config, path), { method: 'GET', headers }),
        cache: cached.files || {}
      });
      if (!result) return null;
      const sourceHash = await digestText(stableJson(result.snapshot.legacySource));
      if (cached.sourceHash !== sourceHash) {
        await saveRecovery({ remote: result.snapshot }, result.mismatches.length ? '旧版云端迁移：清单与文件不一致，已保留原始文件' : '旧版云端迁移原始副本');
      }
      await archiveState(key, { sourceHash, files: result.cache });
      return result.snapshot;
    },
    complete: () => {
      const time = Date.now();
      saveWebDavConfig({ ...getWebDavConfig(), lastSyncAt: time, lastStatus: formatSyncSuccessMessage(time) });
      setSyncStatus('idle', formatSyncSuccessMessage(time), 1, options);
    }
  }, choices);
}

export async function resolveArchiveConflict(choices, options = {}) {
  if (!pendingConflict) return null;
  return syncWebDavNow(options, choices);
}

export async function listArchiveRecoveries() {
  return await archiveState('recoveries') || [];
}

export async function getArchiveRecoveryAvailability(id) {
  if (!id) return { local: false, remote: false };
  const entry = await archiveState(id);
  return { local: hasRecoveryData(entry?.snapshots?.local), remote: hasRecoveryData(entry?.snapshots?.remote) };
}

function hasRecoveryData(snapshot) {
  return Boolean(snapshot && (Object.keys(snapshot.localStorage || {}).length
    || Object.values(snapshot.indexedDb || {}).some(stores => Object.values(stores).some(rows => Array.isArray(rows) && rows.length))));
}

export async function exportArchiveRecovery(id, side = 'local') {
  if (!id || !['local', 'remote'].includes(side)) return { unavailable: true };
  const entry = await archiveState(id);
  const snapshot = entry?.snapshots?.[side];
  if (!hasRecoveryData(snapshot)) return { unavailable: true };
  const filename = `fritia-recovery-${id}-${side}.zip`;
  const write = await chooseArchiveDestination(filename);
  if (!write) { setSyncStatus('idle', '已取消导出恢复副本', 0); return { cancelled: true }; }
  snapshot.manifest = createManifest(snapshot.localStorage || {}, snapshot.indexedDb || {});
  const blob = createZipBlob(snapshotToFiles(snapshot));
  const result = await write(blob);
  setSyncStatus('idle', result?.browserDownload ? '恢复副本已交给浏览器下载' : '恢复副本已保存到所选位置', 1);
  return { filename, size: blob.size };
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

function formatSyncSuccessMessage(ts = Date.now()) {
  const date = new Date(ts);
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('/');
  const clock = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `同步成功，时间：${stamp} ${clock}`;
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

async function applyArchiveSnapshot(snapshot, onProgress = () => {}, options = {}) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('存档格式无效。');
  const localStorageData = snapshot.localStorage || {};
  let step = 0;
  const totalSteps = 1 + IDB_SCHEMAS.length;
  const previous = await buildArchiveSnapshot();
  if (options.expected && (stableJson(previous.localStorage) !== stableJson(options.expected.localStorage) || stableJson(previous.indexedDb) !== stableJson(options.expected.indexedDb))) throw new Error('合并前本地有新数据，已保留，请再次同步。');
  await saveRecovery({ local: previous }, '应用存档前恢复点');
  // IDB data is installed before references in localStorage; sync never clears stores.
  step += 1;
  onProgress(step / totalSteps);
  for (const schema of IDB_SCHEMAS) {
    await importIndexedDb(schema, snapshot.indexedDb?.[schema.name] || {}, options.merge, previous.indexedDb?.[schema.name]);
    step += 1;
    onProgress(step / totalSteps);
  }
  try {
    if (options.merge) for (const [key, value] of Object.entries(previous.localStorage)) {
      if ((localStorage.getItem(key) || '') !== value) throw new Error('应用期间本地有新数据，已保留，请再次同步完成合并。');
    }
    if (!options.merge) clearArchivedLocalStorageKeys();
    for (const [key, value] of Object.entries(localStorageData)) {
      if (key !== ARCHIVE_CONFIG_KEY) localStorage.setItem(key, String(value ?? ''));
    }
  } catch (error) {
    // Never overwrite a newly arrived message with a pre-merge snapshot.
    if (!String(error.message).includes('应用期间')) for (const [key, value] of Object.entries(previous.localStorage)) localStorage.setItem(key, value);
    throw error;
  }
  dispatchRestoreEvents();
}

async function importIndexedDb(schema, stores, merge = false, expected = {}) {
  const db = await openArchiveDb(schema);
  const storeNames = schema.stores.map(store => store.name);
  await new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    for (const storeName of storeNames) {
      const store = tx.objectStore(storeName);
      if (!merge) store.clear();
      for (const record of Array.isArray(stores[storeName]) ? stores[storeName] : []) {
        if (!merge) store.put(record);
        else {
          const key = record.id ?? record.kbId;
          const original = (expected[storeName] || []).find(item => (item.id ?? item.kbId) === key);
          const read = store.get(key);
          read.onsuccess = () => {
            if (stableJson(read.result) !== stableJson(original)) { tx.abort(); return; }
            store.put(record);
          };
        }
      }
    }
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () => reject(tx.error || new Error(`恢复 ${schema.name} 中止，本地数据可能已变化，请重试同步。`));
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
  if (snapshot.legacySource) {
    files.push({ path: 'legacy-source/manifest.json', content: snapshot.legacySource.manifest });
    for (const [path, content] of Object.entries(snapshot.legacySource.files)) files.push({ path: `legacy-source/${path}`, content });
  }
  return files;
}

function filesToSnapshot(fileMap) {
  const manifest = readJsonFile(fileMap, 'manifest.json') || {};
  if (manifest.version !== 1 || !Array.isArray(manifest.entries)) throw new Error('存档清单格式不支持，未修改本地数据。');
  for (const entry of manifest.entries) {
    const text = fileMap[entry.path];
    if (text === undefined) throw new Error(`存档缺少文件：${entry.path}`);
    const parsed = JSON.parse(text);
    if (hashString(JSON.stringify(parsed)) !== entry.hash) throw new Error(`存档校验失败：${entry.path}`);
  }
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

async function ensureRemoteDirectory(config, prefix = SYNC_FILE_PREFIX) {
  const parts = `${normalizePath(config.path)}/${prefix}`.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    const response = await webDavFetch(config, buildUrl(config.url, current) + '/', { method: 'MKCOL', body: '' });
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
  return archiveFetch(url, {
    cache: 'no-store',
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
    if (dataStart + compressedSize > bytes.length || path.includes('..') || files[path] !== undefined) throw new Error('ZIP 存档损坏或包含重复路径。');
    if (crc32(bytes.subarray(dataStart, dataStart + compressedSize)) !== view.getUint32(offset + 14, true)) throw new Error(`ZIP 校验失败：${path}`);
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
