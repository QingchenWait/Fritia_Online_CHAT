// v1 used mutable filenames: its manifest can lag a successfully written
// file after an interrupted upload. Import stable, structurally valid data
// and retain the original bytes instead of treating that manifest as v2 CAS.
export function legacyHash(value) {
  const source = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function parse(text, path) {
  try { return JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error(`旧存档 JSON 损坏：${path}，原文件未改动。`); }
}

export function decodeLegacyFile(path, text) {
  const value = parse(text, path);
  if (path.startsWith('localStorage/')) {
    if (!value || typeof value.key !== 'string' || typeof value.value !== 'string'
      || !/^fritia[_-]/.test(value.key)
      || path !== `localStorage/${encodeURIComponent(value.key).replace(/%/g, '_')}.json`) throw new Error(`旧存档键名或类型无效：${path}`);
    if (['fritia_next_chat_store', 'fritia_long_term_memory'].includes(value.key) && value.value) {
      const data = parse(value.value, path);
      if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error(`旧存档记录结构无效：${path}`);
      for (const name of value.key === 'fritia_next_chat_store' ? ['characters','conversations'] : ['memories','edges']) {
        if (data[name] !== undefined && (!Array.isArray(data[name]) || data[name].some(item => !item || item.id == null))) throw new Error(`旧存档 ${name} 结构无效：${path}`);
      }
      if (value.key === 'fritia_next_chat_store' && data.messages !== undefined
        && (!data.messages || typeof data.messages !== 'object' || Array.isArray(data.messages)
          || Object.values(data.messages).some(list => !Array.isArray(list) || list.some(item => !item || item.id == null)))) throw new Error(`旧存档消息结构无效：${path}`);
    }
  } else {
    const [,db,filename] = path.split('/');
    const allowed = db === 'fritia_media_store' ? ['media.json'] : ['knowledgeBases.json','files.json','chunks.json','indexes.json'];
    if (!allowed.includes(filename)) throw new Error(`旧存档数据库表不支持：${path}`);
    if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object' || (item.id ?? item.kbId) == null)) throw new Error(`旧存档数据库结构无效：${path}`);
  }
  return value;
}

export async function readLegacyArchive({ read, cache = {} }) {
  async function get(path) {
    const previous = cache[path];
    const response = await read(path, previous?.etag ? { 'If-None-Match': previous.etag } : {});
    if (response.status === 304 && previous) return previous;
    if (response.status === 404 && path === 'manifest.json') return null;
    if (!response.ok) throw new Error(`读取旧存档失败：${path} (${response.status})`);
    return { text: await response.text(), etag: response.headers.get('etag') || '' };
  }
  async function checkUnchanged(path, original) {
    const response = await read(path, original.etag ? { 'If-None-Match': original.etag } : {});
    if (response.status === 304 && original.etag) return;
    if (!response.ok || await response.text() !== original.text) throw new Error(`旧存档正在变化：${path}，请旧设备同步完成后重试。`);
  }
  const manifestFile = await get('manifest.json');
  if (!manifestFile) return null;
  const manifest = parse(manifestFile.text, 'manifest.json');
  if (manifest?.version !== 1 || !Array.isArray(manifest.entries)) throw new Error('旧存档清单格式不支持，原数据未改动。');
  const files = {}, nextCache = { 'manifest.json': manifestFile }, mismatches = [];
  const snapshot = { version: 1, exportedAt: manifest.exportedAt || manifest.updatedAt || 0, manifest, localStorage: {}, indexedDb: {} };
  for (const entry of manifest.entries) {
    const path = entry?.path;
    if (typeof path !== 'string' || !/^(?:localStorage\/[^/]+|indexeddb\/(?:fritia_media_store|fritia_knowledge_base_db)\/[^/]+)\.json$/.test(path)
      || path.includes('..') || Object.hasOwn(files, path)) throw new Error('旧存档路径无效或重复');
    const file = await get(path);
    const value = decodeLegacyFile(path, file.text);
    const hashes = [legacyHash(file.text), legacyHash(JSON.stringify(value))];
    if (path.startsWith('localStorage/')) hashes.push(legacyHash(JSON.stringify({ key: value.key, value: value.value })));
    if (!hashes.includes(entry.hash)) {
      await checkUnchanged(path, file);
      mismatches.push({ path, expectedHash: entry.hash, actualHash: legacyHash(JSON.stringify(value)) });
    }
    files[path] = file.text;
    nextCache[path] = file;
    if (path.startsWith('localStorage/')) snapshot.localStorage[value.key] = value.value;
    else {
      const [,db,filename] = path.split('/');
      snapshot.indexedDb[db] ||= {};
      snapshot.indexedDb[db][filename.slice(0,-5)] = value;
    }
  }
  await checkUnchanged('manifest.json', manifestFile);
  snapshot.legacySource = { manifest: manifestFile.text, files, mismatches };
  return { snapshot, cache: nextCache, mismatches };
}
