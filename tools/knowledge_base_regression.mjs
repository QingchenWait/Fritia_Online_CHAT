import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { knowledgeBaseChatCases } from './knowledge_base_chat_cases.mjs';
import { knowledgeBaseRankingCases } from './knowledge_base_ranking_cases.mjs';
import { knowledgeBaseUiCases } from './knowledge_base_ui_cases.mjs';

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_MODULE) return import(process.env.PLAYWRIGHT_MODULE);
  try { return await import('playwright'); } catch (error) {
    const cache = process.env.npm_config_cache || (process.platform === 'win32'
      ? path.join(homedir(), 'AppData', 'Local', 'npm-cache') : path.join(homedir(), '.npm'));
    for (const entry of await readdir(path.join(cache, '_npx')).catch(() => [])) {
      try { return await import(pathToFileURL(path.join(cache, '_npx', entry, 'node_modules', 'playwright', 'index.mjs')).href); }
      catch { /* Reuse another existing installation; do not install a dependency. */ }
    }
    throw error;
  }
}

// Runs inside a fresh browser profile with real IndexedDB. Only derived index
// rows may change during a search; user content and all other stores stay put.
async function knowledgeDataCases() {
  const kb = await import('/src/js/knowledge_base.js');
  const checks = [];
  const expect = (condition, label) => { if (!condition) throw new Error(label); };
  const pass = label => checks.push(label);
  const builtin = (await kb.listKnowledgeBases()).find(item => item.name === '尘白人物设定 (260622)');
  expect(Boolean(builtin), 'built-in fixture has been installed');
  const open = () => new Promise((resolve, reject) => {
    const request = indexedDB.open('fritia_knowledge_base_db', 2);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  async function change(stores, mutate) {
    const db = await open();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(stores, 'readwrite');
        mutate(tx); tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  async function snapshot() {
    const archive = await kb.exportKnowledgeBaseArchive();
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('fritia_media_store', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    let media;
    try {
      media = await new Promise((resolve, reject) => {
        const tx = db.transaction('media'), request = tx.objectStore('media').getAll();
        tx.oncomplete = () => resolve(request.result); tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
    return JSON.stringify({ knowledgeBases: archive.knowledgeBases, files: archive.files, chunks: archive.chunks,
      state: localStorage.getItem('fritia_knowledge_base_state'),
      local: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])), media });
  }
  const media = await import('/src/js/media_store.js');
  await media.saveDataUrlAsMedia('data:text/plain;base64,S0VFUA==', { id: 'rag-retained-media', name: 'KEEP' });
  localStorage.setItem('fritia-rag-regression-sentinel', JSON.stringify({ keep: 'all unrelated records' }));

  const empty = await kb.createKnowledgeBase('先检索空库再导入');
  kb.setActiveKnowledgeBaseIds([empty.id]);
  expect((await kb.searchKnowledgeBase('ragcacheempty')).length === 0, 'empty KB starts with no hits');
  await kb.importTextToKnowledgeBase(empty.id, 'after-empty.txt', 'ragcacheempty 缓存空索引后新增的资料。');
  const beforeEmpty = await snapshot();
  expect((await kb.searchKnowledgeBase('ragcacheempty')).some(item => item.knowledgeBaseId === empty.id), 'cached empty index must not hide newly imported chunks');
  expect(await snapshot() === beforeEmpty, 'empty-index recovery changes no user records');
  pass('cached empty index recovers after text import without rewriting content or settings');

  const first = await kb.createKnowledgeBase('独立资料库 A');
  const second = await kb.createKnowledgeBase('独立资料库 B');
  await kb.importFilesToKnowledgeBase(first.id, [new File(['ragalphakey 甲资料库的独有事实。'], 'alpha.txt', { type: 'text/plain' })]);
  await kb.importFilesToKnowledgeBase(second.id, [new File(['# 资料库乙\nragbetakey 乙资料库的独有事实。'], 'beta.md', { type: 'text/markdown' })]);
  kb.setActiveKnowledgeBaseIds([first.id]);
  expect((await kb.searchKnowledgeBase('ragalphakey')).length === 1, 'single active user KB is searchable');
  expect((await kb.searchKnowledgeBase('ragbetakey')).length === 0, 'disabled KB is excluded');
  kb.setActiveKnowledgeBaseIds([first.id, second.id]);
  const two = await kb.searchKnowledgeBase('ragalphakey ragbetakey');
  expect(two.length === 2 && new Set(two.map(item => item.knowledgeBaseId)).size === 2, 'all active user KBs participate');
  const reference = await kb.buildRagReferenceMessage({ query: 'ragalphakey ragbetakey' });
  expect(reference?.content.includes('独立资料库 A') && reference.content.includes('独立资料库 B'), 'RAG message contains both user KB sources');
  kb.setActiveKnowledgeBaseIds([builtin.id, first.id, second.id]);
  const mixed = await kb.searchKnowledgeBase('芙提雅 ragalphakey ragbetakey', { limit: 500 });
  expect([builtin.id, first.id, second.id].every(id => mixed.some(item => item.knowledgeBaseId === id)), 'built-in and all enabled user KBs participate together');
  expect((await kb.searchKnowledgeBase('zznonmatchingtermzz')).length === 0, 'unrelated query stays empty');
  pass('one/multiple enabled user KBs and built-in mixed retrieval preserve normal relevance filtering');

  kb.setActiveKnowledgeBaseIds([]);
  const beforeOff = await snapshot(), offIndexes = JSON.stringify((await kb.exportKnowledgeBaseArchive()).indexes);
  expect((await kb.searchKnowledgeBase('ragalphakey ragbetakey')).length === 0, 'all KBs off produces no hits');
  expect(await kb.buildRagReferenceMessage({ query: 'ragalphakey' }) === null, 'all KBs off omits RAG');
  expect(await snapshot() === beforeOff && JSON.stringify((await kb.exportKnowledgeBaseArchive()).indexes) === offIndexes, 'disabled KBs and all user records are not rewritten');
  pass('disabled and all-off KB switches take effect without index or content writes');

  // Reproduce a restored v1 index from the old app, whose derived fields use
  // documents/postings/avgDocLength rather than this app's docs/terms format.
  const stamp = Date.now();
  const legacy = { id: 'rag-legacy-kb', name: '旧版恢复知识库', description: 'KEEP_LEGACY', createdAt: stamp, updatedAt: stamp, fileCount: 1, chunkCount: 1 };
  const legacyFile = { id: 'rag-legacy-file', kbId: legacy.id, name: 'legacy.txt', type: 'txt', size: 36, charCount: 36, chunkCount: 1, createdAt: stamp, updatedAt: stamp };
  const legacyChunk = { id: 'rag-legacy-chunk', kbId: legacy.id, fileId: legacyFile.id, index: 0, title: '旧资料', text: 'raglegacykey 旧版资料正文保持完整。', createdAt: stamp };
  await kb.importKnowledgeBaseArchive({ version: 1, knowledgeBases: [legacy], files: [legacyFile], chunks: [legacyChunk],
    indexes: [{ kbId: legacy.id, version: 1, algorithm: 'bm25-keyword-cjk-1g2g', docCount: 1, avgDocLength: 1,
      documents: [{ i: 0, chunkId: legacyChunk.id, fileId: legacyFile.id, length: 1 }], postings: { raglegacykey: [{ i: 0, tf: 1 }] }, updatedAt: stamp }]
  }, { replace: false });
  // Keep the old singular activeKbId exactly as it was stored. A search must
  // read it compatibly without migrating or rewriting localStorage.
  localStorage.setItem('fritia_knowledge_base_state', JSON.stringify({ version: 1, activeKbId: legacy.id, updatedAt: stamp }));
  const beforeLegacy = await snapshot();
  const oldHits = await kb.searchKnowledgeBase('raglegacykey');
  expect(oldHits.length === 1 && oldHits[0].knowledgeBaseId === legacy.id && oldHits[0].fileName === 'legacy.txt', 'legacy restored index is reconstructed from its own chunks');
  expect(await snapshot() === beforeLegacy, 'legacy recovery changes no user records or active state');
  pass('legacy documents/postings indexes and singular activeKbId recover without archive migration');

  const healthy = (await kb.exportKnowledgeBaseArchive()).indexes.find(item => item.kbId === legacy.id);
  expect(Array.isArray(healthy.docs), 'legacy index has a usable derived cache after recovery');
  const healthyBytes = JSON.stringify(healthy);
  await kb.searchKnowledgeBase('raglegacykey'); await kb.buildRagReferenceMessage({ query: 'raglegacykey' });
  expect(JSON.stringify((await kb.exportKnowledgeBaseArchive()).indexes.find(item => item.kbId === legacy.id)) === healthyBytes, 'healthy index cache is reused byte-for-byte');
  pass('healthy index is reused for repeat search and RAG without unnecessary writes');

  const archiveBefore = await kb.exportKnowledgeBaseArchive();
  const missing = archiveBefore.indexes.find(item => item.kbId === first.id);
  await change(['indexes'], tx => tx.objectStore('indexes').delete(first.id));
  const beforeMissing = await snapshot();
  expect((await kb.searchKnowledgeBase('ragalphakey', { knowledgeBaseIds: [first.id] })).length === 1, 'missing index is rebuilt');
  expect(await snapshot() === beforeMissing, 'missing-index recovery leaves content untouched');
  expect(JSON.stringify((await kb.exportKnowledgeBaseArchive()).indexes.find(item => item.kbId === second.id)) === JSON.stringify(archiveBefore.indexes.find(item => item.kbId === second.id)), 'other KB indexes are not rewritten');
  expect(Boolean(missing), 'a healthy index existed before the missing-index test');
  pass('missing cache rebuild is scoped to that KB and retains all original chunks/files');

  // A same-sized cache is stale if a later import/restore changed the source.
  const current = await kb.exportKnowledgeBaseArchive();
  const secondKb = current.knowledgeBases.find(item => item.id === second.id);
  const secondChunk = current.chunks.find(item => item.kbId === second.id);
  const secondIndex = current.indexes.find(item => item.kbId === second.id);
  await change(['knowledgeBases', 'chunks', 'indexes'], tx => {
    tx.objectStore('knowledgeBases').put({ ...secondKb, updatedAt: Date.now() });
    tx.objectStore('chunks').put({ ...secondChunk, text: 'ragupdatedkey 相同分块数量的新正文。' });
    tx.objectStore('indexes').put({ ...secondIndex, updatedAt: 1 });
  });
  const beforeStale = await snapshot();
  expect((await kb.searchKnowledgeBase('ragupdatedkey', { knowledgeBaseIds: [second.id] })).length === 1, 'same-count stale index uses newer KB content');
  expect((await kb.searchKnowledgeBase('ragbetakey', { knowledgeBaseIds: [second.id] })).length === 0, 'stale indexed text is no longer returned');
  expect(await snapshot() === beforeStale, 'same-count stale recovery does not rewrite source chunks');
  pass('same-count stale index recovers newer source text using existing metadata');

  kb.setActiveKnowledgeBaseIds(['rag-missing-id', first.id]);
  expect((await kb.searchKnowledgeBase('ragalphakey')).some(item => item.knowledgeBaseId === first.id), 'an absent KB ID does not hide a later enabled KB');
  pass('stale active ID cannot suppress another enabled KB');
  const schema = await open();
  expect(schema.version === 2, 'knowledge DB schema version stays 2');
  expect([...schema.objectStoreNames].sort().join(',') === 'chunks,files,indexes,knowledgeBases', 'knowledge DB stores stay unchanged');
  schema.close();
  return { checks, legacyId: legacy.id, legacyIndex: (await kb.exportKnowledgeBaseArchive()).indexes.find(item => item.kbId === legacy.id) };
}

const { chromium } = await loadPlaywright();
const origin = process.env.CHAT_TEST_URL || 'http://127.0.0.1:3063';
const override = process.env.KB_REGRESSION_SOURCE ? await readFile(process.env.KB_REGRESSION_SOURCE, 'utf8') : null;
let browser, server;
try {
  if (!process.env.CHAT_TEST_URL) {
    server = spawn(process.execPath, ['tools/static_server.mjs'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true,
      env: { ...process.env, PORT: '3063' }, stdio: ['ignore', 'pipe', 'pipe']
    });
    await new Promise((resolve, reject) => {
      server.stdout.once('data', resolve); server.once('error', reject);
      server.once('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
  }
  browser = await chromium.launch({ headless: true,
    ...(process.env.CHAT_TEST_BROWSER ? { executablePath: process.env.CHAT_TEST_BROWSER } : {}) });
  async function setup(viewport = { width: 1440, height: 900 }) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('fritia_chat_onboarding_dismissed', '1'));
    await page.route('**/*', route => {
      const url = route.request().url();
      if (override !== null && new URL(url).pathname === '/src/js/knowledge_base.js') return route.fulfill({ contentType: 'text/javascript', body: override });
      return url.startsWith(origin) ? route.continue() : route.abort();
    });
    await page.goto(origin); await page.waitForSelector('.conversation-item');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('fritia_preloaded_knowledge_base_state') || '{}').installedSourceIds?.includes('chenbai_character_settings_260622'));
    return { context, page, errors };
  }

  const data = await setup();
  const result = await data.page.evaluate(knowledgeDataCases);
  result.checks.forEach(label => console.log('PASS ' + label));
  await data.page.reload(); await data.page.waitForSelector('.conversation-item');
  const persisted = await data.page.evaluate(async id => {
    const kb = await import('/src/js/knowledge_base.js');
    return { hits: await kb.searchKnowledgeBase('raglegacykey', { knowledgeBaseIds: [id] }),
      index: (await kb.exportKnowledgeBaseArchive()).indexes.find(item => item.kbId === id) };
  }, result.legacyId);
  assert.equal(persisted.hits.length, 1); assert.deepEqual(persisted.index, result.legacyIndex);
  assert.deepEqual(data.errors, []); await data.context.close();
  console.log('PASS recovered legacy index and KB content remain usable after reload');

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const { context, page, errors } = await setup(viewport);
    await page.evaluate(async () => {
      (await import('/src/js/knowledge_base.js')).setActiveKnowledgeBaseIds([]);
      document.dispatchEvent(new CustomEvent('fritia-ui-open-panel', { detail: { id: 'settings-panel', settingsSection: 'knowledge' } }));
    });
    const names = ['UI 资料库甲', 'UI 资料库乙'];
    for (const [index, name] of names.entries()) {
      await page.fill('#kb-name-input', name); await page.click('#kb-create-btn');
      await page.waitForFunction(name => document.getElementById('kb-current-title').textContent === name, name);
      await page.setInputFiles('#kb-file-input', { name: `ui-${index}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`uiragmarker${index} 正确上传后参与检索。`) });
      await page.waitForFunction(() => document.getElementById('kb-current-meta').textContent.includes('1 文件'));
      await page.waitForFunction(() => document.querySelector('#kb-file-list .file-row'));
    }
    assert.deepEqual(await page.evaluate(async () => {
      const kb = await import('/src/js/knowledge_base.js');
      return (await kb.searchKnowledgeBase('uiragmarker0 uiragmarker1')).map(item => item.knowledgeBaseName).sort();
    }), [...names].sort());
    await page.click('#kb-enable-toggle');
    await page.waitForFunction(() => document.getElementById('kb-active-status').textContent.includes('未启用'));
    assert.deepEqual(await page.evaluate(async () => (await (await import('/src/js/knowledge_base.js')).searchKnowledgeBase('uiragmarker0 uiragmarker1')).map(item => item.knowledgeBaseName)), [names[0]]);
    await page.click('#kb-enable-toggle');
    await page.waitForFunction(() => document.getElementById('kb-active-status').textContent.includes('正在参与'));
    await page.reload(); await page.waitForSelector('.conversation-item');
    assert.deepEqual(await page.evaluate(async () => (await (await import('/src/js/knowledge_base.js')).searchKnowledgeBase('uiragmarker0 uiragmarker1')).map(item => item.knowledgeBaseName).sort()), [...names].sort());
    assert.deepEqual(errors, []); await context.close();
    console.log(`PASS ${viewport.width}×${viewport.height}: UI creates/uploads two enabled KBs, toggle excludes one and reload preserves both`);
  }

  const chat = await setup();
  const chatChecks = await chat.page.evaluate(knowledgeBaseChatCases);
  for (const label of chatChecks.checks || chatChecks) console.log('PASS ' + label);
  assert.deepEqual(chat.errors, []); await chat.context.close();

  const ranking = await setup();
  for (const label of await ranking.page.evaluate(knowledgeBaseRankingCases)) console.log('PASS ' + label);
  assert.deepEqual(ranking.errors, []); await ranking.context.close();

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ui = await setup(viewport);
    for (const label of await knowledgeBaseUiCases(ui.page, viewport)) console.log('PASS ' + label);
    assert.deepEqual(ui.errors, []); await ui.context.close();
  }
} finally { await browser?.close(); server?.kill(); }
