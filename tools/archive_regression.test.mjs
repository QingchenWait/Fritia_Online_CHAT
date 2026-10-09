import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stableJson, snapshotRecords, recordsSnapshot, mergeRecords, digestText } from '../src/js/archive_merge.js';
import { buildImportedSettings } from '../src/js/onboarding.js';
import { archiveFetch, chooseArchiveDestination, readClipboardText } from '../src/js/archive_io.js';

test('stable hashing and record-level merge preserve independent edits and absent records', async () => {
  assert.equal(await digestText(stableJson({ b: 2, a: 1 })), await digestText(stableJson({ a: 1, b: 2 })));
  const base = { a: { text: 'old' }, b: { text: 'keep' } };
  const local = { a: { text: 'new' }, c: { text: 'local new' } };
  const remote = { ...base, d: { text: 'remote new' } };
  const merged = mergeRecords(base, local, remote);
  assert.equal(merged.conflicts.length, 0);
  assert.deepEqual(Object.keys(merged.records).sort(), ['a','b','c','d']);
  assert.equal(merged.records.a.text, 'new');
});

test('same-record conflicting edits need explicit choice; neither input is mutated', () => {
  const base = { a: 'original' }, local = { a: 'local' }, remote = { a: 'remote' };
  assert.equal(mergeRecords(base, local, remote).conflicts.length, 1);
  assert.equal(mergeRecords(base, local, remote, { a: 'remote' }).records.a, 'remote');
  assert.deepEqual(local, { a: 'local' }); assert.deepEqual(remote, { a: 'remote' });
});

test('snapshot roundtrip preserves chat, settings, binary media and memory records', () => {
  const app = { version: 1, characters: [{ id:'bot' }], conversations:[{ id:'chat' }], messages:{ chat:[{ id:'m1', text:'你好', createdAt:1 }, { id:'typing', status:'typing', createdAt:2 }] }, activeConversationId:'chat' };
  const snapshot = { localStorage: { fritia_next_chat_store: JSON.stringify(app), 'fritia-settings': '{"apiKey":"test"}', fritia_archive_sync: '{"password":"local-only"}', fritia_long_term_memory: JSON.stringify({ memories:[{ id:'memory1', text:'保留' }], edges:[], deletedIds:['memory1'] }) }, indexedDb:{ fritia_media_store:{ media:[{id:'pic', dataUrl:'data:image/png;base64,AABB'}] } } };
  const records = snapshotRecords(snapshot);
  assert.equal(Object.keys(records).some(key => key.includes('typing')), false);
  assert.equal(Object.keys(records).some(key => key.includes('archive_sync')), false);
  const restored = recordsSnapshot(records, snapshot);
  assert.equal(restored.indexedDb.fritia_media_store.media[0].dataUrl, 'data:image/png;base64,AABB');
  const chat = JSON.parse(restored.localStorage.fritia_next_chat_store);
  assert.equal(chat.messages.chat.length, 2);
  assert.equal(chat.activeConversationId, 'chat');
  assert.deepEqual(JSON.parse(restored.localStorage.fritia_long_term_memory).deletedIds, []);
});

test('both successful onboarding providers select their own default image caption model', () => {
  for (const name of ['deepseek','mimo']) {
    const patch = buildImportedSettings(name, 'test-key', { chatProviders:[], ttsProviders:[] });
    assert.equal(patch.defaultImageCaptionProviderId, patch.defaultChatProviderId);
  }
});

test('native WebDAV preserves status 204 and errors, without synthetic success', async () => {
  const original = globalThis.window;
  globalThis.window = { FritiaArchive: { request(raw) {
    const input = JSON.parse(raw);
    assert.equal(input.method, 'MKCOL');
    queueMicrotask(() => window.__FRITIA_ARCHIVE_CALLBACK__(input.token, JSON.stringify({ status:204, headers:{}, body:'' })));
  } } };
  try {
    const response = await archiveFetch('https://dav.test/folder/', { method:'MKCOL', headers:{ Authorization:'Basic test' } });
    assert.equal(response.status, 204); assert.equal(await response.text(), '');
    window.FritiaArchive.request = raw => { const input=JSON.parse(raw); queueMicrotask(() => window.__FRITIA_ARCHIVE_CALLBACK__(input.token, { error:'network failed' })); };
    await assert.rejects(archiveFetch('https://dav.test/', {method:'MKCOL'}), /network failed/);
  } finally { globalThis.window = original; }
});

test('native file cancellation is respected; selected destination is used and clipboard reads stay local', async () => {
  const original = globalThis.window;
  let written;
  globalThis.window = { FritiaArchive: {
    chooseFile(raw) { const input=JSON.parse(raw); queueMicrotask(()=>window.__FRITIA_ARCHIVE_CALLBACK__(input.token,{uri:'content://user-selected'})); },
    beginWrite(raw) { const input=JSON.parse(raw); assert.equal(input.uri,'content://user-selected'); queueMicrotask(()=>window.__FRITIA_ARCHIVE_CALLBACK__(input.token,{writeId:'session',chunkBytes:131072})); },
    writeChunk(raw) { written=JSON.parse(raw); queueMicrotask(()=>window.__FRITIA_ARCHIVE_CALLBACK__(written.token,{written:3})); },
    finishWrite(raw) { const input=JSON.parse(raw); queueMicrotask(()=>window.__FRITIA_ARCHIVE_CALLBACK__(input.token,{saved:true,written:3})); },
    abortWrite() { throw Error('unexpected abort'); },
    clipboard(raw) { const input=JSON.parse(raw); queueMicrotask(()=>window.__FRITIA_ARCHIVE_CALLBACK__(input.token,{text:'clipboard-test'})); }
  } };
  try {
    const save = await chooseArchiveDestination('test.zip'); await save(new Blob(['ZIP']));
    assert.equal(written.writeId,'session'); assert.equal(atob(written.body),'ZIP');
    assert.equal(await readClipboardText(),'clipboard-test');
    window.FritiaArchive.chooseFile = raw => { const input=JSON.parse(raw); queueMicrotask(()=>window.__FRITIA_ARCHIVE_CALLBACK__(input.token,{cancelled:true})); };
    assert.equal(await chooseArchiveDestination('test.zip'),null);
  } finally { globalThis.window=original; }
});

test('Windows WebDAV bypasses the legacy Response wrapper, preserves 204 and real HTTP failure', async () => {
  const original=globalThis.window;
  let status=204, sent;
  globalThis.window={__TAURI__:{core:{invoke:async(command,payload)=>{sent={command,payload};return {status,bodyBase64:'',headers:[]};}}}};
  try {
    assert.equal((await archiveFetch('https://dav.test/',{method:'PUT',body:'test'})).status,204);
    assert.equal(sent.command,'proxy_fetch');
    assert.equal(atob(sent.payload.request.bodyBase64),'test');
    status=501;
    const failed=await archiveFetch('https://dav.test/',{method:'MKCOL'});
    assert.equal(failed.status,501); assert.equal(failed.ok,false);
  } finally {globalThis.window=original;}
});
