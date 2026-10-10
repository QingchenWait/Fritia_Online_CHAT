import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planMessageDeletion, deleteSelectedPrivateMessages } from '../src/js/conversation_management_data.js';
import { createTranscriptPng } from '../src/js/conversation_share.js';
import { unzlibSync } from '../src/vendor/fflate/fflate.js';

function fixtures() {
  const app = { characters: [{ id: 'alice', avatar: 'idb-media:avatar' }], conversations: [{ id: 'a', type: 'private', memberIds: ['alice'] }, { id: 'b', type: 'group' }],
    messages: { a: [{ id: 'selected', text: 'delete', attachments: [{ dataRef: 'idb-media:exclusive' }, { dataRef: 'idb-media:shared' }, { dataRef: 'idb-media:avatar' }], meta: { toolTrace: { calls: [{ result: 'idb-media:tool-only' }] } } }, { id: 'keep', text: 'retain', attachments: [{ dataRef: 'idb-media:shared' }] }], b: [{ id: 'other', text: 'group' }] }, arbitrary: { untouched: true } };
  const memory = { settings: { enabled: true }, lifecycle: { retain: true }, extractorVersion: 3,
    memories: [{ id: 'exclusive-memory', characterId: 'alice', scope: 'private:alice', source: 'private', sourceMessageIds: ['selected'], text: 'exclusive' }, { id: 'mixed-memory', characterId: 'alice', scope: 'private:alice', source: 'private', sourceMessageIds: ['selected', 'keep'], text: 'shared' }],
    edges: [{ id: 'exclusive-edge', sourceMemoryIds: ['exclusive-memory'] }], deletedIds: ['older'] };
  return { app, memory };
}

test('only explicit private message IDs, their exclusive memory/edges and media are removed', () => {
  const { app, memory } = fixtures(), original = structuredClone({ app, memory });
  const result = planMessageDeletion(app, memory, 'a', ['selected']);
  assert.deepEqual(result.app.messages.a, [app.messages.a[1]]);
  assert.deepEqual(result.app.messages.b, app.messages.b);
  assert.deepEqual(result.app.characters, app.characters);
  assert.deepEqual(result.app.conversations, app.conversations);
  assert.deepEqual(result.app.arbitrary, app.arbitrary);
  assert.deepEqual(result.memory.memories, [memory.memories[1]]);
  assert.deepEqual(result.memory.edges, []);
  assert.deepEqual(result.memory.settings, memory.settings);
  assert.deepEqual(result.memory.lifecycle, memory.lifecycle);
  assert.deepEqual(result.mediaRefs.sort(), ['idb-media:exclusive', 'idb-media:tool-only']);
  assert.deepEqual({ app, memory }, original);
});

test('shared graph relationships retain every source memory, without rewriting the relationship', () => {
  const { app, memory } = fixtures();
  memory.edges.push({ id: 'shared-edge', sourceMemoryIds: ['exclusive-memory', 'mixed-memory'], text: 'preserve this fact' });
  const result = planMessageDeletion(app, memory, 'a', ['selected']);
  assert.deepEqual(result.memory, memory);
});

test('unknown origins, duplicate source IDs and unselected references protect memories', () => {
  for (const change of [m => { m.memory.memories[0].sourceMessageIds.push('unknown'); }, m => { m.app.messages.b.push({ id: 'selected', text: 'duplicate elsewhere' }); }, m => { m.app.messages.a[1].meta = { memoryId: 'exclusive-memory' }; }, m => { m.memory.memories[0].scope = 'public'; }]) {
    const data = fixtures(); change(data);
    assert.deepEqual(planMessageDeletion(data.app, data.memory, 'a', ['selected']).memory, data.memory);
  }
});

test('stickers/other local records protect media; group and missing conversations are rejected', () => {
  const { app, memory } = fixtures();
  const result = planMessageDeletion(app, memory, 'a', ['selected'], [{ dataRef: 'idb-media:exclusive' }]);
  assert.deepEqual(result.mediaRefs, ['idb-media:tool-only']);
  assert.throws(() => planMessageDeletion(app, memory, 'b', ['other']));
  assert.throws(() => planMessageDeletion(app, memory, 'absent', ['selected']));
  assert.deepEqual(planMessageDeletion(app, memory, 'a', ['absent']).app, app);
});

test('ambiguous duplicate message IDs are rejected; unknown graph edges and metadata retain memory', () => {
  const data = fixtures();
  data.app.messages.a.push({ id: 'selected', text: 'ambiguous duplicate' });
  assert.throws(() => planMessageDeletion(data.app, data.memory, 'a', ['selected']), /重复/);
  const unknown = fixtures(); unknown.memory.edges.push({ id: 'legacy-edge', head: 'unknown' });
  assert.deepEqual(planMessageDeletion(unknown.app, unknown.memory, 'a', ['selected']).memory, unknown.memory);
  const metadata = fixtures(); metadata.memory.unknownMetadata = { memoryId: 'exclusive-memory' };
  assert.deepEqual(planMessageDeletion(metadata.app, metadata.memory, 'a', ['selected']).memory, metadata.memory);
  const edgeReference = fixtures(); edgeReference.memory.memories[1].extraEdgeId = 'exclusive-edge';
  assert.deepEqual(planMessageDeletion(edgeReference.app, edgeReference.memory, 'a', ['selected']).memory, edgeReference.memory);
  const capped = fixtures(); capped.memory.memories[0].sourceMessageIds = Array.from({ length: 30 }, () => 'selected');
  assert.deepEqual(planMessageDeletion(capped.app, capped.memory, 'a', ['selected']).memory, capped.memory);
});

test('failed chat commit restores memory byte-for-byte; busy requests perform no writes', async () => {
  const { app, memory } = fixtures();
  const records = new Map([['fritia_next_chat_store', JSON.stringify(app)], ['fritia_long_term_memory', JSON.stringify(memory)]]);
  const original = [...records], previous = globalThis.localStorage;
  let writes = 0;
  globalThis.localStorage = { get length() { return records.size; }, key: index => [...records.keys()][index], getItem: key => records.get(key) ?? null,
    setItem(key, value) { writes++; if (key === 'fritia_next_chat_store') throw new Error('quota fault'); records.set(key, value); } };
  try {
    await assert.rejects(deleteSelectedPrivateMessages('a', ['selected'], app, () => true), /等待/);
    assert.equal(writes, 0);
    await assert.rejects(deleteSelectedPrivateMessages('a', ['selected'], app), /quota fault/);
    assert.deepEqual([...records], original);
    assert.equal(writes, 3, 'memory write, failed chat write, original memory restore');
  } finally { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; }
});

test('PNG streaming preserves all pixels across tiles, including height beyond Canvas limits', async () => {
  const width = 2, height = 40000, png = createTranscriptPng(width, height);
  for (let top = 0; top < height; top += 768) {
    const count = Math.min(768, height - top), pixels = new Uint8Array(width * count * 4);
    for (let row = 0; row < count; row++) for (let x = 0; x < width; x++) pixels.set([(top + row) % 256, x * 77, 83, 255], (row * width + x) * 4);
    png.push(pixels, count);
  }
  const bytes = new Uint8Array(await png.finish().arrayBuffer()), view = new DataView(bytes.buffer), chunks = [];
  assert.equal(view.getUint32(20), height);
  for (let offset = 8; offset < bytes.length;) {
    const size = view.getUint32(offset), type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
    if (type === 'IDAT') chunks.push(bytes.slice(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  const compressed = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0; for (const chunk of chunks) { compressed.set(chunk, offset); offset += chunk.length; }
  const raw = unzlibSync(compressed), stride = width * 4 + 1;
  assert.equal(raw.length, stride * height);
  for (const row of [0, 767, 768, 32767, 39999]) {
    assert.equal(raw[row * stride], 1);
    assert.equal(raw[row * stride + 1], row % 256);
    assert.equal(raw[row * stride + 7], 0);
    assert.equal(raw[row * stride + 8], 0);
  }
});
