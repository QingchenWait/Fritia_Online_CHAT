import { digestText, stableJson, snapshotRecords, recordsSnapshot, mergeRecords } from './archive_merge.js';
import { archiveState, saveRecovery, getSyncDevice } from './archive_state.js';

let running = null;
let pending = null;
const PREFIX = 'fritia-sync-v2';

export function runIncrementalSync(context, choices) {
  if (running) return running;
  running = (navigator.locks ? navigator.locks.request('fritia-archive-sync', () => sync(context, choices)) : sync(context, choices)).finally(() => { running = null; });
  return running;
}

async function sync(ctx, choices) {
  const { config, request, snapshot, apply, status, conflict, complete } = ctx;
  const device = await getSyncDevice();
  const target = await digestText(JSON.stringify([config.url, config.path, config.username]));
  const root = `${config.url.replace(/\/+$/, '')}/${config.path.replace(/^\/+|\/+$/g, '')}/${PREFIX}/`;
  const cacheKey = path => `${target}/${path}`;
  const fetchAt = (name, init = {}) => request(config, root + name, { cache: 'no-store', ...init });
  const report = (label, current, completed, total, progress = 0.35) => status('working', label, progress, { current, completed, total });
  const readLocal = () => snapshot({ onProgress: detail => status('working', '正在读取本地存档', 0.05, detail) });
  let localSnapshot = await readLocal();
  let local = snapshotRecords(localSnapshot);
  let baseline = await archiveState(cacheKey('baseline')) || {};
  const catalog = await archiveState(cacheKey('catalog')) || {};
  report('正在检查云端增量', `${PREFIX}/`, 0, 1, 0.1);
  let listing = await fetchAt('', { method: 'PROPFIND', headers: { Depth: '1', 'Content-Type': 'application/xml' }, body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getetag/></d:prop></d:propfind>' });
  if (listing.status === 404) {
    await ctx.ensureDirectory(config, PREFIX);
    listing = await fetchAt('', { method: 'PROPFIND', headers: { Depth: '1' } });
  }
  if (listing.status !== 207 && !listing.ok) throw new Error(`读取 WebDAV 目录失败：${listing.status} ${listing.statusText}`);
  const xml = new DOMParser().parseFromString(await listing.text(), 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('WebDAV 返回了无效目录，未修改本地或云端数据。');
  const names = [...xml.getElementsByTagNameNS('*', 'href')].map(node => decodeURIComponent(new URL(node.textContent, root).pathname.split('/').pop()));
  if (/jianguoyun\.com$/i.test(new URL(config.url).hostname) && names.length >= 750) throw new Error('坚果云目录达到单次列举限制，已停止写入以免遗漏其他设备版本。请先导出各设备 ZIP，归档云端目录后使用新的同步路径。');
  const commits = names.filter(name => /^commit-[\w-]+\.json$/.test(name));
  // Refuse a truncated directory instead of declaring a stale cache synced.
  if (Object.keys(catalog).some(name => !commits.includes(name))) throw new Error('云端目录未列出已知版本，可能存在分页限制、备份被移动或目录尚未更新。未覆盖任何数据，请稍后重试并检查服务器目录。');
  const missingCommits = commits.filter(name => !catalog[name]);
  for (const [index, name] of missingCommits.entries()) {
    report('正在读取云端版本', name, index, missingCommits.length, 0.2);
    const response = await fetchAt(name);
    if (!response.ok) throw new Error(`读取同步版本失败：${name} (${response.status})`);
    const data = await response.json();
    if (data.version !== 2 || !data.records || !Array.isArray(data.parents)) throw new Error(`同步版本格式不支持：${name}`);
    catalog[name] = data;
    report('正在读取云端版本', name, index + 1, missingCommits.length, 0.2);
  }
  const parents = new Set(Object.values(catalog).flatMap(item => item.parents));
  let heads = Object.keys(catalog).filter(name => !parents.has(name));
  const loaded = new Map();
  async function readRecords(manifest) {
    const result = {};
    const entries = Object.entries(manifest?.records || {});
    const files = [...new Set(entries.map(([, ref]) => ref.file))];
    const completedFiles = new Set();
    for (const [index, [key, ref]] of entries.entries()) {
      if (!/^pack-[a-f0-9]{64}\.(?:json|gz)$/.test(ref.file)) throw new Error('同步数据引用格式无效');
      if (!loaded.has(ref.file)) {
        report('正在读取云端数据文件', ref.file, completedFiles.size, files.length);
        let text = await archiveState(cacheKey(ref.file));
        if (text === undefined) {
          const response = await fetchAt(ref.file);
          if (!response.ok) throw new Error(`下载增量失败：${response.status} ${ref.file}`);
          const blob = await response.blob();
          text = ref.file.endsWith('.gz') ? await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text() : await blob.text();
          if (await digestText(text) !== ref.file.slice(5, 69)) throw new Error(`云端文件校验失败：${ref.file}，已停止同步。`);
          await archiveState(cacheKey(ref.file), text);
        }
        loaded.set(ref.file, JSON.parse(text));
      }
      completedFiles.add(ref.file);
      // Limit visual updates when a pack contains many small records.
      if (index % 100 === 0) report('正在校验云端记录', key, index, entries.length);
      const value = loaded.get(ref.file)[key];
      if (value === undefined || await digestText(stableJson(value)) !== ref.hash) throw new Error(`记录校验失败：${key}`);
      result[key] = value;
    }
    report('云端数据校验完成', files.at(-1) || '无数据文件', files.length, files.length);
    return result;
  }
  function ancestors(name, seen = new Set()) {
    if (!name || seen.has(name)) return seen;
    seen.add(name);
    for (const parent of catalog[name]?.parents || []) ancestors(parent, seen);
    return seen;
  }
  let remote = {}, conflicts = [];
  const sources = [];
  for (const name of heads.sort()) {
    const next = await readRecords(catalog[name]);
    const common = sources.length ? [...ancestors(name)].find(parent => sources.every(source => ancestors(source).has(parent))) : null;
    const base = common ? await readRecords(catalog[common]) : {};
    const scopedChoices = Object.fromEntries(Object.keys(next).map(key => [key, choices?.[`${name}::${key}`]]));
    report('正在合并云端版本', name, sources.length, heads.length, 0.45);
    const merge = mergeRecords(base, remote, next, scopedChoices);
    conflicts.push(...merge.conflicts.map(item => ({ ...item, choiceKey: `${name}::${item.path}`, source: `${catalog[name].device?.name || '云端设备'} · ${new Date(catalog[name].at).toLocaleString()}` })));
    remote = merge.records;
    sources.push(name);
    report('正在合并云端版本', name, sources.length, heads.length, 0.45);
  }
  // Import the old layout once; old files stay untouched for recovery.
  if (!heads.length) {
    const legacy = await ctx.readLegacy(config);
    if (legacy) remote = snapshotRecords(legacy);
  }
  // Re-read after network I/O: a response might have arrived in the meantime.
  localSnapshot = await readLocal();
  local = snapshotRecords(localSnapshot);
  report('正在比较本地与云端记录', '本地 / 云端', 0, 1, 0.5);
  const merge = mergeRecords(baseline, local, remote, Object.fromEntries(Object.keys(local).map(key => [key, choices?.[`local::${key}`]])));
  conflicts.push(...merge.conflicts.map(item => ({ ...item, choiceKey: `local::${item.path}`, source: '当前设备 / 云端合并结果' })));
  report('正在比较本地与云端记录', '本地 / 云端', 1, 1, 0.5);
  const fingerprint = await digestText(stableJson({ local, heads, legacy: heads.length ? null : remote }));
  const remoteInfo = heads.map(name => ({ ...catalog[name].device, at: catalog[name].at }));
  if (conflicts.length && (!choices || pending?.fingerprint !== fingerprint)) {
    const retained = pending?.fingerprint === fingerprint && await archiveState(pending.recoveryId);
    const recoveryId = retained ? pending.recoveryId : await saveRecovery({ local: localSnapshot, remote: recordsSnapshot(remote, localSnapshot) }, '同步冲突：本地与云端原始副本');
    pending = { fingerprint, recoveryId };
    conflict({
      local: { updatedAt: localSnapshot.exportedAt, size: new Blob([stableJson(local)]).size, device: `${device.name} (${device.id.slice(0, 8)})` },
      remote: { updatedAt: Math.max(0, ...remoteInfo.map(item => item.at)), size: new Blob([stableJson(remote)]).size, device: remoteInfo.map(item => `${item.name || '设备'} (${item.id?.slice(0, 8) || '旧版'})`).join('、') || '旧版备份' },
      files: conflicts, recoveryId
    });
    status('conflict', '新增记录已准备合并，请选择冲突项；两端原始副本已保留', 1);
    await archiveState(cacheKey('catalog'), catalog);
    return { conflict: true };
  }
  const merged = merge.records;
  const known = new Map();
  for (const manifest of Object.values(catalog)) for (const [key, ref] of Object.entries(manifest.records)) known.set(`${key}:${ref.hash}`, ref);
  async function publish(records, parentNames) {
    const refs = {}, changed = [];
    const entries = Object.entries(records);
    for (const [index, [key, value]] of entries.entries()) {
      if (index % 100 === 0) report('正在计算增量记录', key, index, entries.length, 0.6);
      const hash = await digestText(stableJson(value));
      const ref = known.get(`${key}:${hash}`);
      if (ref) refs[key] = ref;
      else changed.push({ key, value, hash });
    }
    // Batch small records in ~512 KiB packs; large media travel only once.
    let group = [], bytes = 0;
    const groups = [];
    for (const item of changed) {
      const size = new Blob([stableJson(item.value)]).size;
      if (group.length && bytes + size > 512 * 1024) { groups.push(group); group = []; bytes = 0; }
      group.push(item); bytes += size;
    }
    if (group.length) groups.push(group);
    for (const [index, group] of groups.entries()) {
      const text = stableJson(Object.fromEntries(group.map(item => [item.key, item.value])));
      const hash = await digestText(text);
      let body = new Blob([text], { type: 'application/json' });
      const gzip = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
      if (gzip) body = await new Response(body.stream().pipeThrough(new CompressionStream('gzip'))).blob();
      const file = `pack-${hash}.${gzip ? 'gz' : 'json'}`;
      report('正在上传增量文件', file, index, groups.length + 1, 0.65);
      const response = await fetchAt(file, { method: 'PUT', headers: { 'Content-Type': gzip ? 'application/gzip' : 'application/json' }, body });
      if (!response.ok) throw new Error(`上传增量失败：${response.status}，原有版本未改变。`);
      await archiveState(cacheKey(file), text);
      for (const item of group) { refs[item.key] = { file, hash: item.hash }; known.set(`${item.key}:${item.hash}`, refs[item.key]); }
      report('正在上传增量文件', file, index + 1, groups.length + 1, 0.7);
    }
    const name = `commit-${device.id}-${Date.now()}-${crypto.randomUUID()}.json`;
    const manifest = { version: 2, device, at: Date.now(), parents: parentNames, records: refs };
    report('正在发布合并版本', name, groups.length, groups.length + 1, 0.8);
    const response = await fetchAt(name, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: stableJson(manifest) });
    if (!response.ok) throw new Error(`发布同步版本失败：${response.status}，下次可继续同步。`);
    catalog[name] = manifest;
    report('正在发布合并版本', name, groups.length + 1, groups.length + 1, 0.85);
    return name;
  }
  const changedRemote = stableJson(merged) !== stableJson(remote) || heads.length !== 1;
  const changedLocal = stableJson(merged) !== stableJson(local);
  if (changedLocal) await saveRecovery({ local: localSnapshot, remote: recordsSnapshot(remote, localSnapshot) }, '合并前自动恢复点');
  // A conflicting local value also gets an immutable cloud revision before
  // a chosen value can replace it. Concurrent writers use different names.
  if (conflicts.length) heads = [...heads, await publish(local, [])];
  if (changedRemote || conflicts.length) { status('working', '正在上传变化记录并发布合并版本', 0.65); heads = [await publish(merged, heads)]; }
  await archiveState(cacheKey('catalog'), catalog);
  if (changedLocal) {
    const fresh = await readLocal();
    if (stableJson(snapshotRecords(fresh)) !== stableJson(local)) {
      status('idle', '同步期间本地有新消息，已保留，下一次同步继续合并', 1);
      return { retry: true };
    }
    await apply(recordsSnapshot(merged, fresh), fresh);
  }
  await archiveState(cacheKey('baseline'), merged);
  pending = null;
  conflict(null);
  await complete();
  return { direction: 'merged', changed: changedLocal || changedRemote };
}
