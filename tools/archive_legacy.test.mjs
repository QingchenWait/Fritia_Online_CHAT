import assert from 'node:assert/strict';
import { test } from 'node:test';
import { legacyHash, readLegacyArchive } from '../src/js/archive_legacy.js';

function fixture({ stale = false, rawHash = false, noEtag = false } = {}) {
  const path = 'localStorage/fritia_long_term_memory.json';
  const item = { key: 'fritia_long_term_memory', value: JSON.stringify({ version: 1, memories: [{ id: 'keep', text: '旧设备完整记忆 🐱' }], edges: [] }) };
  const text = JSON.stringify(item, null, 2);
  const manifest = { version: 1, exportedAt: 1234, entries: [{ path, hash: stale ? legacyHash('older snapshot') : legacyHash(rawHash ? text : JSON.stringify(item)) }] };
  const files = { [path]: text, 'manifest.json': JSON.stringify(manifest) };
  const requests = [];
  return { path, files, requests, read: async (name, headers) => {
    requests.push({ name, headers });
    const text = files[name];
    if (text === undefined) return new Response('', { status: 404 });
    const etag = `"${legacyHash(text)}"`;
    if (!noEtag && headers['If-None-Match'] === etag) return new Response(null, { status: 304 });
    return new Response(text, { headers: noEtag ? {} : { etag } });
  } };
}

test('legacy compact and raw pretty-JSON checksums are compatible without changing values', async () => {
  for (const rawHash of [false, true]) {
    const f = fixture({ rawHash }); const result = await readLegacyArchive(f);
    assert.equal(result.mismatches.length, 0);
    assert.equal(result.snapshot.localStorage.fritia_long_term_memory, JSON.parse(f.files[f.path]).value);
    assert.deepEqual(result.snapshot.legacySource.files, { [f.path]: f.files[f.path] });
  }
});

test('stale mutable manifest imports stable valid records, preserving source and diagnostics', async () => {
  for (const noEtag of [false, true]) {
    const f = fixture({ stale: true, noEtag }); const before = structuredClone(f.files);
    const result = await readLegacyArchive(f);
    assert.equal(result.mismatches[0].path, f.path);
    assert.equal(JSON.parse(result.snapshot.localStorage.fritia_long_term_memory).memories[0].text, '旧设备完整记忆 🐱');
    assert.equal(result.snapshot.legacySource.manifest, before['manifest.json']);
    assert.deepEqual(f.files, before);
    assert.equal(f.requests.filter(item => item.name === f.path).length, 2);
  }
});

test('conditional reads reuse bytes on retry instead of downloading unchanged legacy files', async () => {
  const f = fixture({ stale: true }); const first = await readLegacyArchive(f); f.requests.length = 0;
  const second = await readLegacyArchive({ read: f.read, cache: first.cache });
  assert.equal(second.snapshot.localStorage.fritia_long_term_memory, first.snapshot.localStorage.fritia_long_term_memory);
  assert.ok(f.requests.every(item => item.headers['If-None-Match']));
});

test('concurrent legacy writes and damaged JSON stop migration without applying an empty substitute', async () => {
  const f = fixture({ stale: true }); let reads = 0;
  await assert.rejects(readLegacyArchive({ read: async (path, headers) => {
    if (path === f.path && ++reads === 2) f.files[path] += ' ';
    return f.read(path, headers);
  } }), /正在变化/);
  const broken = fixture({ stale: true }); broken.files[broken.path] = '{"broken":';
  await assert.rejects(readLegacyArchive(broken), /JSON 损坏/);
  const missing = fixture(); delete missing.files[missing.path];
  await assert.rejects(readLegacyArchive(missing), /404/);
});

test('legacy key/path mismatch and malformed memory structures are rejected', async () => {
  const f = fixture({ stale: true }); f.files[f.path] = JSON.stringify({ key: 'fritia-settings', value: '{}' });
  await assert.rejects(readLegacyArchive(f), /键名或类型无效/);
  f.files[f.path] = JSON.stringify({ key: 'fritia_long_term_memory', value: '{"memories":{"a":1}}' });
  await assert.rejects(readLegacyArchive(f), /结构无效/);
});
