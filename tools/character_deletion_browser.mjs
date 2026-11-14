import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHAT_TEST_BROWSER ? { executablePath: process.env.CHAT_TEST_BROWSER } : {}) });
const origin = process.env.CHAT_TEST_URL || 'http://127.0.0.1:3038';
const artifacts = join(tmpdir(), 'fritia-character-deletion');
await mkdir(artifacts, { recursive: true });

async function seed(page) {
  return page.evaluate(async () => {
    const storage = await import('/src/js/storage.js');
    const media = await import('/src/js/media_store.js');
    const app = storage.loadAppStore();
    const add = async id => (await media.saveDataUrlAsMedia('data:text/plain;base64,S0VFUA==', { id, name: id })).ref;
    const exclusive = await add('role-exclusive'), shared = await add('role-shared'), tool = await add('role-tool'), voice = await add('role-voice');
    const dbProtected = await add('role-db-protected');
    app.characters.push(storage.normalizeCharacterRecord({ id: 'role-chosen', name: '同名角色', source: 'third-party', avatar: exclusive, voiceSample: voice }),
      storage.normalizeCharacterRecord({ id: 'role-unselected', name: '同名角色', source: 'custom', avatar: shared }));
    for (const id of ['role-chosen', 'role-unselected']) {
      app.conversations.unshift(storage.normalizeConversation({ id: `private:${id}`, type: 'private', memberIds: [id], title: '同名角色' }));
      app.messages[`private:${id}`] = [];
    }
    app.messages['private:role-chosen'] = [
      storage.normalizeMessage({ id: 'role-user', text: '删除选中角色', attachments: [{ name: '独占.txt', dataRef: exclusive }, { name: '共享.txt', dataRef: shared }, { name: '知识库引用.txt', dataRef: dbProtected }] }),
      storage.normalizeMessage({ id: 'role-tool-message', role: 'assistant', text: '工具调用', meta: { toolTrace: { thoughts: ['思考中'], calls: [{ result: tool }] } } }),
      storage.normalizeMessage({ id: 'role-voice-message', role: 'assistant', attachments: [{ type: 'audio', name: '语音.wav', dataRef: voice }] }),
      storage.normalizeMessage({ id: 'role-stale-typing', role: 'assistant', status: 'typing', text: '思考中' })
    ];
    app.messages['private:role-unselected'] = [storage.normalizeMessage({ id: 'same-name-message', text: 'KEEP_OTHER', attachments: [{ name: '共享.txt', dataRef: shared }] })];
    app.activeConversationId = 'private:role-chosen'; storage.saveAppStore(app);
    const memoryModule = await import('/src/js/long_term_memory.js');
    const memory = memoryModule.getLongTermMemoryStore();
    memory.lifecycle.lastMaintenanceAt = Date.now();
    const common = { type: 'fact', source: 'private', createdAt: Date.now(), updatedAt: Date.now(), importance: 8, confidence: .9 };
    memory.memories = [
      { ...common, id: 'role-exclusive-memory', characterId: 'role-chosen', characterName: '同名角色', scope: 'private:role-chosen', text: '独占记忆', sourceMessageIds: ['role-user'] },
      { ...common, id: 'role-shared-memory', characterId: 'role-chosen', characterName: '同名角色', scope: 'private:role-chosen', text: '共享关系来源记忆', sourceMessageIds: ['role-user'] },
      { ...common, id: 'role-other-memory', characterId: 'role-unselected', characterName: '同名角色', scope: 'private:role-unselected', text: 'KEEP_MEMORY', sourceMessageIds: ['same-name-message'] }
    ];
    memory.edges = [
      { id: 'role-exclusive-edge', characterId: 'role-chosen', scope: 'private:role-chosen', head: '分析员', relation: '喜欢', tail: '测试', sourceMemoryIds: ['role-exclusive-memory'] },
      { id: 'role-shared-edge', characterId: 'role-chosen', scope: 'public:roundtable', head: '分析员', relation: '喜欢', tail: '分享', sourceMemoryIds: ['role-shared-memory', 'role-other-memory'] }
    ];
    localStorage.setItem('fritia_long_term_memory', JSON.stringify(memory));
    localStorage.setItem('fritia_mcp_tool_config', JSON.stringify({ clients: [], selectedClientIdsByConversation: { 'private:role-chosen': ['one'], 'private:role-unselected': ['two'] }, logs: [{ id: 'global-unknown-owner', result: 'keep log' }] }));
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('fritia_knowledge_base_db', 2); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    await new Promise((resolve, reject) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put({ id: 'role-knowledge-reference', kbId: 'test', dataRef: dbProtected }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
    return { exclusive, shared, tool, voice, dbProtected, keepCharacter: app.characters.find(item => item.id === 'role-unselected'), keepMessages: app.messages['private:role-unselected'] };
  });
}

async function open(page) {
  await page.locator('.conversation-item').filter({ has: page.locator('img[data-media-source="idb-media:role-exclusive"]') }).click();
  await page.click('#chat-info-btn');
  await page.click('#detail-character-delete');
  await page.locator('#character-delete-panel').waitFor({ state: 'visible' });
  await page.locator('.character-delete-shell').evaluate(async node => { await Promise.all(node.getAnimations().map(animation => animation.finished)); });
}

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1024, height: 280 }, { width: 1024, height: 1366 }, { width: 2560, height: 1440 }, { width: 3840, height: 2160 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('fritia_chat_onboarding_dismissed', '1'));
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin); await page.waitForSelector('.conversation-item');
    const data = await seed(page);
    await open(page);
    const layout = await page.evaluate(() => {
      const shell = document.querySelector('.character-delete-shell'), body = document.querySelector('.character-delete-body');
      const r = shell.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight,
        scroll: getComputedStyle(body).overflowY, scrollColor: getComputedStyle(body).scrollbarColor,
        buttons: [...document.querySelectorAll('.character-delete-actions .btn')].map(button => {
          const icon = button.querySelector('img').getBoundingClientRect(), text = button.querySelector('span').getBoundingClientRect();
          return { delta: Math.abs((icon.top + icon.bottom) / 2 - (text.top + text.bottom) / 2), right: button.getBoundingClientRect().right };
        }) };
    });
    assert.ok(layout.left >= 0 && layout.top >= 0 && layout.right <= layout.width && layout.bottom <= layout.height, JSON.stringify(layout));
    assert.equal(layout.scroll, 'auto'); assert.notEqual(layout.scrollColor, 'auto');
    assert.ok(layout.buttons.every(item => item.delta < 2 && item.right <= layout.width), JSON.stringify(layout));
    if (viewport.height < 400) assert.equal(await page.locator('.character-delete-body').evaluate(node => { node.scrollTop = node.scrollHeight; return node.scrollTop > 0; }), true);
    const dimensions = await page.evaluate(() => {
      const remove = document.getElementById('detail-character-delete').getBoundingClientRect();
      const other = document.getElementById('detail-conversation-management').getBoundingClientRect();
      return { remove: { width: remove.width, height: remove.height }, other: { width: other.width, height: other.height } };
    });
    assert.ok(Math.abs(dimensions.remove.width - dimensions.other.width) < .1 && dimensions.remove.height === dimensions.other.height);
    if ([1440, 390, 1024].includes(viewport.width)) await page.screenshot({ path: join(artifacts, `${viewport.width}x${viewport.height}.png`) });
    const before = await page.evaluate(() => localStorage.getItem('fritia_next_chat_store'));
    await page.click('#character-delete-cancel');
    assert.equal(await page.evaluate(() => localStorage.getItem('fritia_next_chat_store')), before);
    await page.click('#detail-character-delete');

    // Actual ZIP snapshot, with a controlled system save handle. Ensure picker
    // opens before async snapshot reads and the dialog stays open after saving.
    await page.evaluate(() => {
      window.__savedArchive = null; window.__pickerCalls = 0;
      window.showSaveFilePicker = async () => { window.__pickerCalls++; return { createWritable: async () => ({ write: async blob => { window.__savedArchive = blob; }, close: async () => {}, abort: async () => {} }) }; };
    });
    await page.click('#character-delete-backup');
    await page.waitForFunction(() => document.getElementById('model-settings-notice')?.textContent === '备份已经保存');
    assert.ok(await page.locator('#character-delete-panel').isVisible());
    const zip = await page.evaluate(async () => {
      const { unzipSync } = await import('/src/vendor/fflate/fflate.js');
      const files = unzipSync(new Uint8Array(await window.__savedArchive.arrayBuffer()));
      const text = Object.values(files).map(bytes => new TextDecoder().decode(bytes)).join('\n');
      return { calls: window.__pickerCalls, size: window.__savedArchive.size, chosen: text.includes('role-chosen'), other: text.includes('role-unselected'), media: text.includes('role-exclusive'), memory: text.includes('role-exclusive-memory'), knowledge: text.includes('role-knowledge-reference') };
    });
    assert.ok(zip.calls === 1 && zip.size > 0 && zip.chosen && zip.other && zip.media && zip.memory && zip.knowledge, JSON.stringify(zip));
    // A cancelled or failed save must not delete or hide the confirmation.
    await page.evaluate(() => { window.showSaveFilePicker = async () => { throw new DOMException('cancel', 'AbortError'); }; });
    await page.click('#character-delete-backup'); await page.waitForFunction(() => !document.getElementById('character-delete-backup').disabled);
    await page.evaluate(() => { window.showSaveFilePicker = async () => ({ createWritable: async () => ({ write: async () => { throw new Error('write failure'); }, close: async () => {}, abort: async () => {} }) }); });
    await page.click('#character-delete-backup'); await page.waitForFunction(() => document.getElementById('character-delete-error').textContent.includes('write failure'));
    assert.ok(await page.locator('#character-delete-panel').isVisible());

    await page.click('#character-delete-confirm'); await page.locator('#character-delete-panel').waitFor({ state: 'hidden' });
    const result = await page.evaluate(async data => {
      const app = JSON.parse(localStorage.getItem('fritia_next_chat_store')), memory = JSON.parse(localStorage.getItem('fritia_long_term_memory'));
      const { getMediaDataUrl } = await import('/src/js/media_store.js');
      return { app, memory, databases: await indexedDB.databases(), media: await Promise.all([data.exclusive, data.shared, data.tool, data.voice, data.dbProtected].map(ref => getMediaDataUrl(ref))), config: JSON.parse(localStorage.getItem('fritia_mcp_tool_config')) };
    }, data);
    assert.ok(!result.app.characters.some(item => item.id === 'role-chosen'));
    assert.deepEqual(result.app.characters.find(item => item.id === 'role-unselected'), data.keepCharacter);
    assert.deepEqual(result.app.messages['private:role-unselected'], data.keepMessages);
    assert.ok(!Object.hasOwn(result.app.messages, 'private:role-chosen'));
    assert.ok(!result.memory.memories.some(item => item.id === 'role-exclusive-memory'), JSON.stringify({ memory: result.memory, databases: result.databases }));
    assert.ok(result.memory.memories.some(item => item.id === 'role-shared-memory'));
    assert.ok(result.memory.memories.some(item => item.id === 'role-other-memory'));
    assert.equal(result.memory.edges.some(item => item.id === 'role-shared-edge'), true);
    assert.deepEqual(result.media.map(Boolean), [false, true, false, false, true]);
    assert.equal(result.config.logs[0].id, 'global-unknown-owner');
    assert.deepEqual(result.config.selectedClientIdsByConversation, { 'private:role-unselected': ['two'] });
    await page.reload(); await page.waitForSelector('.conversation-item');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fritia_next_chat_store')).characters.some(item => item.id === 'role-chosen')), false);
    await page.locator('.conversation-item').filter({ hasText: '芙提雅' }).first().click(); await page.click('#chat-info-btn');
    assert.equal(await page.locator('#detail-character-delete').isVisible(), false);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${viewport.width}×${viewport.height}: layout, backup/cancel/failure, exact deletion, shared data, reload, builtins`);
  }
  for (const scenario of ['group-reference', 'unknown-db', 'damaged-memory', 'stale-identity', 'runtime-unsaved', 'media-prefix', 'memory-protected']) {
    const context = await browser.newContext({ serviceWorkers: 'block' }), page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('fritia_chat_onboarding_dismissed', '1'));
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin); await page.waitForSelector('.conversation-item');
    const data = await seed(page);
    const outcome = await page.evaluate(async ({ scenario, data }) => {
      const { deleteSelectedCharacter } = await import('/src/js/character_deletion_data.js');
      const storage = await import('/src/js/storage.js'), media = await import('/src/js/media_store.js');
      const app = JSON.parse(localStorage.getItem(storage.STORAGE_KEYS.app));
      const chosen = structuredClone(app.characters.find(item => item.id === 'role-chosen'));
      if (scenario === 'group-reference') { app.conversations.push({ id: 'shared-group', type: 'group', memberIds: ['role-chosen', 'role-unselected'] }); app.messages['shared-group'] = [{ id: 'shared-message', text: 'KEEP_GROUP' }]; }
      if (scenario === 'unknown-db') await new Promise((resolve, reject) => { const request = indexedDB.open('unknown-owner'); request.onupgradeneeded = () => request.result.createObjectStore('shared'); request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error); });
      if (scenario === 'damaged-memory') localStorage.setItem('fritia_long_term_memory', '{broken-memory');
      if (scenario === 'stale-identity') app.characters.find(item => item.id === 'role-chosen').prompt = 'identity changed during confirm';
      if (scenario === 'media-prefix') {
        await media.saveDataUrlAsMedia('data:text/plain;base64,S0VFUA==', { id: 'prefix-key' });
        app.messages['private:role-chosen'][0].attachments.push({ name: 'custom', dataRef: 'idb-media:prefix-key.custom' });
      }
      if (scenario === 'memory-protected') localStorage.setItem('fritia-protected-memory', JSON.stringify({ linkedMemory: 'role-exclusive-memory' }));
      localStorage.setItem(storage.STORAGE_KEYS.app, JSON.stringify(app));
      const runtime = structuredClone(app);
      if (scenario === 'runtime-unsaved') runtime.messages['private:role-unselected'].push({ id: 'unsaved-message', text: 'KEEP_UNSAVED' });
      const snapshot = () => Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).map(key => [key, localStorage.getItem(key)]));
      const before = snapshot();
      let error = '';
      try { await deleteSelectedCharacter('role-chosen', chosen, () => runtime, () => false); } catch (failure) { error = failure.message; }
      return { before, after: snapshot(), error, exclusive: Boolean(await media.getMediaDataUrl(data.exclusive)), prefix: Boolean(await media.getMediaDataUrl('idb-media:prefix-key')) };
    }, { scenario, data });
    if (['group-reference', 'stale-identity', 'runtime-unsaved'].includes(scenario)) { assert.ok(outcome.error); assert.deepEqual(outcome.after, outcome.before); }
    else {
      assert.equal(outcome.error, '');
      if (['unknown-db', 'damaged-memory'].includes(scenario)) { assert.equal(outcome.exclusive, true); assert.equal(outcome.after.fritia_long_term_memory, outcome.before.fritia_long_term_memory); }
      if (scenario === 'media-prefix') assert.equal(outcome.prefix, true);
      if (scenario === 'memory-protected') assert.ok(JSON.parse(outcome.after.fritia_long_term_memory).memories.some(item => item.id === 'role-exclusive-memory'));
    }
    await context.close(); console.log(`PASS safety boundary: ${scenario}`);
  }
  console.log(`Screenshots: ${artifacts}`);
} finally { await browser.close(); }
