import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planCharacterDeletion, deleteSelectedCharacter } from '../src/js/character_deletion_data.js';
import { webDavWriteError } from '../src/js/archive_webdav_error.js';

function fixture() {
  return {
    app: { version: 1, characters: [{ id: 'chosen', name: '芙提雅', source: 'third-party' }, { id: 'same-name', name: '芙提雅', source: 'custom' }, { id: 'fritia', name: '芙提雅', source: 'preset' }],
      conversations: [{ id: 'private:chosen', type: 'private', memberIds: ['chosen'] }, { id: 'second-owned', type: 'private', memberIds: ['chosen'] }, { id: 'keep', type: 'private', memberIds: ['same-name'] }, { id: 'group', type: 'group', memberIds: ['same-name', 'fritia'] }],
      messages: { 'private:chosen': [{ id: 'selected', text: 'PRIVATE', attachments: [{ dataRef: 'idb-media:exclusive' }, { dataRef: 'idb-media:shared' }], meta: { toolTrace: { thoughts: ['思考中'], calls: [{ result: 'idb-media:tool' }] } } }, { id: 'typing', status: 'typing', text: '' }],
        'second-owned': [{ id: 'second-message', attachments: [{ dataRef: 'idb-media:voice' }] }], keep: [{ id: 'keep-message', text: 'KEEP', attachments: [{ dataRef: 'idb-media:shared' }] }], group: [] }, activeConversationId: 'private:chosen', extra: { preserve: true } },
    memory: { extractorVersion: 11, memories: [{ id: 'own-memory', characterId: 'chosen', scope: 'private:chosen', source: 'private', sourceMessageIds: ['selected'], text: '独占记忆' },
      { id: 'keep-memory', characterId: 'same-name', scope: 'private:same-name', source: 'private', sourceMessageIds: ['keep-message'], text: 'KEEP' }],
      edges: [{ id: 'own-edge', characterId: 'chosen', scope: 'private:chosen', sourceMemoryIds: ['own-memory'] }], deletedIds: [], extra: { preserve: true } }
  };
}

test('exact role ID deletes all owned private buckets including typing/tool/voice, preserving every other raw record', () => {
  for (const source of ['custom', 'plugin', 'third-party', 'import', 'unknown']) {
    const { app, memory } = fixture(); app.characters[0].source = source;
    const original = structuredClone({ app, memory });
    const plan = planCharacterDeletion(app, memory, 'chosen');
    assert.deepEqual(plan.app.characters, app.characters.slice(1));
    assert.deepEqual(plan.app.conversations, app.conversations.slice(2));
    assert.deepEqual(plan.app.messages, { keep: app.messages.keep, group: [] });
    assert.deepEqual(plan.memory.memories, [memory.memories[1]]);
    assert.deepEqual(plan.memory.edges, []);
    assert.deepEqual(plan.memory.deletedIds, ['own-memory', 'own-edge']);
    assert.deepEqual(plan.memory.extra, memory.extra);
    assert.deepEqual(plan.mediaRefs.sort(), ['idb-media:exclusive', 'idb-media:tool', 'idb-media:voice']);
    assert.equal(plan.app.activeConversationId, 'keep');
    assert.deepEqual({ app, memory }, original);
  }
});

test('missing, builtin, duplicate character/conversation IDs, groups and ambiguous legacy buckets stop without mutations', () => {
  for (const mutate of [
    data => { data.app.characters.push({ ...data.app.characters[0] }); },
    data => { data.app.conversations.push({ ...data.app.conversations[0] }); },
    data => { data.app.conversations[1].type = 'group'; },
    data => { data.app.conversations[0].memberIds.push('same-name'); },
    data => { data.app.conversations[0].memberIds = ['same-name']; },
    data => { data.app.messages['private:chosen'] = 'broken'; },
    data => { data.app.messages.keep.push({ speakerId: 'chosen', text: 'historic group speaker' }); },
    data => { data.app.extra.reference = 'private:chosen'; },
    data => { data.app.extra.characterId = 'chosen'; }
  ]) {
    const data = fixture(); mutate(data); const before = structuredClone(data);
    assert.throws(() => planCharacterDeletion(data.app, data.memory, 'chosen')); assert.deepEqual(data, before);
  }
  const { app, memory } = fixture();
  for (const id of ['absent', 'fritia', '', null]) assert.throws(() => planCharacterDeletion(app, memory, id));
  app.characters[0].source = 'preset'; assert.throws(() => planCharacterDeletion(app, memory, 'chosen'));
  app.characters[2].source = 'custom'; assert.throws(() => planCharacterDeletion(app, memory, 'fritia'));
});

test('all unknown, shared, capped and duplicate memory/edge provenance stays byte-for-byte intact', () => {
  for (const mutate of [
    data => { data.memory.memories[0].characterId = 'same-name'; },
    data => { data.memory.memories[0].scope = 'public:roundtable'; },
    data => { data.memory.memories[0].sourceMessageIds.push('keep-message'); },
    data => { data.app.messages.keep.push({ id: 'selected' }); },
    data => { data.memory.memories[0].sourceMessageIds = Array(30).fill('selected'); },
    data => { delete data.memory.memories[0].sourceMessageIds; },
    data => { data.memory.memories.push({ ...data.memory.memories[0] }); },
    data => { data.memory.edges.push({ ...data.memory.edges[0] }); },
    data => { data.memory.edges[0].sourceMemoryIds.push('keep-memory'); },
    data => { data.memory.edges[0].scope = 'public:roundtable'; },
    data => { data.memory.edges[0].characterId = 'same-name'; },
    data => { data.memory.edges[0].sourceMemoryIds = Array(30).fill('own-memory'); },
    data => { data.memory.edges.push({ id: 'unknown-edge' }); },
    data => { data.memory.memories[1].link = 'own-memory'; },
    data => { data.memory.memories[1].edgeLink = 'own-edge'; },
    data => { data.memory.extra.link = 'own-memory'; },
    data => { data.memory.deletedIds = 'broken'; },
    data => { data.memory.memories[0].id = 'escaped"id'; data.memory.edges[0].sourceMemoryIds = ['escaped"id']; }
  ]) {
    const data = fixture(); mutate(data);
    assert.deepEqual(planCharacterDeletion(data.app, data.memory, 'chosen').memory, data.memory);
  }
});

test('transitive and cyclic retained relationships protect memory; auxiliary settings/DB rows protect references', () => {
  const { app, memory } = fixture();
  memory.memories[0].link = 'own-memory-2';
  memory.memories.push({ ...memory.memories[0], id: 'own-memory-2', link: 'own-memory' });
  memory.memories[1].link = 'own-memory';
  assert.deepEqual(planCharacterDeletion(app, memory, 'chosen').memory, memory);
  const clean = fixture();
  const plan = planCharacterDeletion(clean.app, clean.memory, 'chosen', [{ knowledgeFile: { ref: 'idb-media:exclusive' }, sticker: 'idb-media:voice', memoryLink: 'own-memory', nested: { result: 'idb-media:tool' } }]);
  assert.deepEqual(plan.mediaRefs, []); assert.deepEqual(plan.memory, clean.memory);
});

test('empty roles, multiple owned conversations, preserved active selection and unusual exact IDs are safe', () => {
  const { app, memory } = fixture();
  app.characters.push({ id: '__proto__', name: 'same-name', source: 'custom' });
  assert.equal(planCharacterDeletion(app, memory, '__proto__').app.characters.length, app.characters.length - 1);
  app.activeConversationId = 'keep';
  assert.equal(planCharacterDeletion(app, memory, 'chosen').app.activeConversationId, 'keep');
  app.characters = [app.characters[0]]; app.conversations = app.conversations.slice(0, 2);
  app.messages = { 'private:chosen': [], 'second-owned': [] }; app.activeConversationId = 'private:chosen';
  const plan = planCharacterDeletion(app, null, 'chosen');
  assert.equal(plan.app.activeConversationId, ''); assert.deepEqual(plan.app.messages, {});
});

test('media IDs with unknown punctuation or prefix matches cannot delete another file', () => {
  const { app, memory } = fixture();
  app.messages['private:chosen'][0].attachments.push({ dataRef: 'idb-media:unselected.file' });
  app.messages['private:chosen'][0].meta.other = 'idb-media:also-unselected.extension';
  const plan = planCharacterDeletion(app, memory, 'chosen');
  assert.ok(!plan.mediaRefs.includes('idb-media:unselected'));
  assert.ok(!plan.mediaRefs.includes('idb-media:also-unselected'));
});

test('busy, changed identity, damaged memory and failed multi-record commit never erase unselected data', async () => {
  const previous = { localStorage: globalThis.localStorage, document: globalThis.document, indexedDB: globalThis.indexedDB };
  globalThis.document = new EventTarget(); globalThis.indexedDB = { databases: async () => [] };
  try {
    for (const fault of ['busy', 'changed', 'quota-app', 'quota-config', 'runtime-role', 'runtime-conversation', 'corrupt-memory', 'normal']) {
      const { app, memory } = fixture();
      const config = { clients: [{ id: 'shared-client' }], logs: [{ result: 'idb-media:tool' }], selectedClientIdsByConversation: { 'private:chosen': ['shared-client'], keep: ['shared-client'] } };
      const records = new Map([['fritia_next_chat_store', JSON.stringify(app)], ['fritia_long_term_memory', fault === 'corrupt-memory' ? '{broken' : JSON.stringify(memory)], ['fritia_mcp_tool_config', JSON.stringify(config)], ['protected', 'idb-media:exclusive idb-media:voice']]);
      const before = [...records];
      const runtime = structuredClone(app);
      if (fault === 'runtime-role') runtime.characters.push({ id: 'unsaved-role', name: 'KEEP' });
      if (fault === 'runtime-conversation') runtime.conversations.push({ id: 'unsaved-conversation', type: 'private', memberIds: ['same-name'] });
      globalThis.localStorage = { get length() { return records.size; }, key: i => [...records.keys()][i], getItem: key => records.get(key) ?? null,
        setItem(key, value) { if ((fault === 'quota-app' && key === 'fritia_next_chat_store') || (fault === 'quota-config' && key === 'fritia_mcp_tool_config')) throw new Error('quota fault'); records.set(key, value); } };
      const action = () => deleteSelectedCharacter('chosen', fault === 'changed' ? { ...app.characters[0], prompt: 'changed' } : app.characters[0], () => runtime, () => fault === 'busy');
      if (['busy', 'changed', 'quota-app', 'quota-config', 'runtime-role', 'runtime-conversation'].includes(fault)) { await assert.rejects(action()); assert.deepEqual([...records], before); }
      else {
        await action();
        assert.deepEqual(JSON.parse(records.get('fritia_next_chat_store')).messages.keep, app.messages.keep);
        const savedConfig = JSON.parse(records.get('fritia_mcp_tool_config'));
        assert.deepEqual(savedConfig.logs, config.logs); assert.deepEqual(savedConfig.clients, config.clients);
        assert.deepEqual(savedConfig.selectedClientIdsByConversation, { keep: ['shared-client'] });
        if (fault === 'corrupt-memory') assert.equal(records.get('fritia_long_term_memory'), '{broken');
      }
    }
  } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});

test('WebDAV quota detection requires explicit server evidence; generic 403 does not invent quota exhaustion', async () => {
  const config = { url: 'https://dav.jianguoyun.com/dav' };
  for (const reason of ['上传流量已用尽', '<d:error>上传流量超出上限</d:error>', 'Upload traffic quota exceeded', 'Upload quota limit reached', 'Insufficient upload traffic']) {
    const error = await webDavWriteError(new Response(reason, { status: 403 }), config, { label: '上传增量失败', file: 'pack-test.gz', size: 12 });
    assert.match(error.message, /坚果云返回上传流量额度/); assert.match(error.message, /本地数据已保留/);
  }
  const generic = await webDavWriteError(new Response('Forbidden', { status: 403 }), config, { label: '上传增量失败', file: 'pack-test.gz', size: 12 });
  assert.match(generic.message, /服务器未明确说明/); assert.doesNotMatch(generic.message, /返回上传流量额度已用尽/);
  const space = await webDavWriteError(new Response('存储空间不足', { status: 403 }), config, { label: '发布同步版本失败', file: 'commit-test.json', size: 15 });
  assert.match(space.message, /返回存储空间不足/);
});
