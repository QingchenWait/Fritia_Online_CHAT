import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { issue, png, prompt, wav, detailedDescription } from './third_party_cards_fixtures.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'], ...(process.env.CHAT_TEST_BROWSER ? { executablePath: process.env.CHAT_TEST_BROWSER } : {}) });
const origin = process.env.CHAT_TEST_URL || 'http://127.0.0.1:3042';
const artifacts = new URL('../.codex/third-party-cards/', import.meta.url);
await mkdir(artifacts, { recursive: true });
const report = [];
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1024, height: 280 }, { width: 1024, height: 1366 }, { width: 1536, height: 864 }, { width: 1280, height: 720 }, { width: 2560, height: 1440 }, { width: 3840, height: 2160 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' }), page = await context.newPage();
    const errors = [], apiRequests = [];
    let mode = 'normal', revoked = false, opaqueVoice = false;
    const fixtureIssue = (number, overrides = {}) => {
      const item = issue(number, overrides);
      if (opaqueVoice && number === 1) item.body = item.body.replace('[voice.wav](https://github.com/user-attachments/files/111/voice.wav)', '<video src="https://github.com/user-attachments/assets/opaque-voice" controls></video>');
      return item;
    };
    page.on('pageerror', failure => errors.push(failure.message));
    await page.addInitScript(() => localStorage.setItem('fritia_chat_onboarding_dismissed', '1'));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (url.hostname === 'api.github.com') {
        apiRequests.push(url.href);
        if (mode === 'offline') return route.abort();
        if (/\/issues\/\d+$/.test(url.pathname)) return route.fulfill({ json: fixtureIssue(Number(url.pathname.split('/').pop()), revoked ? { labels: ['角色卡'] } : {}) });
        await new Promise(resolve => setTimeout(resolve, 250));
        return route.fulfill({ json: [...Array.from({ length: 23 }, (_, index) => fixtureIssue(index + 1)), issue(24, { state: 'closed' }), issue(25, { labels: ['角色卡'] }), issue(26, { labels: ['初审通过'] })] });
      }
      if (url.hostname === 'github.com' && url.pathname.includes('/user-attachments/')) {
        if (mode === 'broken-voice' && url.pathname.endsWith('voice.wav')) return route.fulfill({ status: 404, body: 'missing' });
        return route.fulfill({ body: url.pathname.endsWith('prompt.txt') ? Buffer.from(prompt) : /(?:voice.wav|opaque-voice)$/.test(url.pathname) ? wav : png });
      }
      return route.abort();
    });
    const enter = async () => {
      await page.click('#mobile-menu-btn'); await page.click('#main-menu-plugin-store');
      await page.click('[data-plugin-store-section="third-party"]');
    };
    await page.goto(origin); await page.waitForSelector('.conversation-item');
    await enter();
    await page.waitForSelector('.third-party-spinner');
    assert.equal(await page.locator('#third-party-disclaimer').isVisible(), true);
    assert.equal(await page.locator('#third-party-content').evaluate(node => node.inert), true);
    const disclaimerBounds = await page.locator('.third-party-disclaimer-card').boundingBox();
    const cardAreaBounds = await page.locator('#third-party-cards').boundingBox();
    assert.ok(disclaimerBounds.x >= 0 && disclaimerBounds.y >= 0 && disclaimerBounds.x + disclaimerBounds.width <= viewport.width && disclaimerBounds.y + disclaimerBounds.height <= viewport.height);
    assert.ok(Math.abs(disclaimerBounds.x + disclaimerBounds.width / 2 - cardAreaBounds.x - cardAreaBounds.width / 2) < 1, 'disclaimer horizontally centered in the character-card region');
    assert.ok(Math.abs(disclaimerBounds.y + disclaimerBounds.height / 2 - cardAreaBounds.y - cardAreaBounds.height / 2) < 1, 'disclaimer vertically centered in the character-card region');
    await page.screenshot({ path: new URL(`disclaimer-${viewport.width}x${viewport.height}.png`, artifacts).pathname.replace(/^\/([A-Z]:)/, '$1'), animations: 'disabled' });
    await page.check('#third-party-dont-remind'); await page.click('#third-party-acknowledge');
    await page.waitForSelector('[data-card-id]');
    const columns = await page.locator('#third-party-cards').evaluate(node => Number(node.style.getPropertyValue('--third-party-columns')));
    assert.equal(await page.locator('[data-card-id]').count(), columns * 10);
    assert.equal(await page.locator('#third-party-status').textContent(), '共 23 张角色卡');
    const layout = await page.evaluate(() => {
      const grid = document.getElementById('third-party-list-scroll'), pagination = document.querySelector('.third-party-pagination');
      const rect = node => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; };
      return { grid: rect(grid), pagination: rect(pagination), shell: rect(document.querySelector('.plugin-store-shell')), scrollbar: getComputedStyle(grid).scrollbarColor, bodyOverflow: document.body.scrollWidth > innerWidth };
    });
    assert.ok(layout.grid.height > 0, JSON.stringify({ viewport, layout }));
    assert.ok(layout.pagination.bottom <= viewport.height && layout.pagination.right <= viewport.width, JSON.stringify({ viewport, layout }));
    assert.equal(layout.bodyOverflow, false); assert.notEqual(layout.scrollbar, 'auto');
    await page.locator('#third-party-list-scroll').evaluate(node => node.scrollTop = node.scrollHeight);
    const footerAfter = await page.locator('.third-party-pagination').boundingBox();
    assert.ok(Math.abs(footerAfter.y - layout.pagination.top) < 1);
    await page.click('#third-party-next'); assert.equal(await page.locator('#third-party-page-label').textContent(), columns === 2 ? '2 / 2' : '2 / 3');
    await page.fill('#third-party-search', 'author1'); assert.equal(await page.locator('#third-party-status').textContent(), '共 11 张角色卡');
    await page.fill('#third-party-search', ''); await page.selectOption('#third-party-sort', 'oldest');
    assert.equal(await page.locator('[data-card-id]').first().getAttribute('data-card-id'), '8001');
    await page.screenshot({ path: new URL(`list-${viewport.width}x${viewport.height}.png`, artifacts).pathname.replace(/^\/([A-Z]:)/, '$1'), animations: 'disabled' });
    await page.locator('[data-card-id]').first().click();
    const description = page.locator('#third-party-detail-description');
    assert.equal(await description.locator('h2').textContent(), '阅读指南');
    assert.equal(await description.locator('strong').textContent(), '阅读说明');
    assert.equal(await description.locator('ul li').count(), 2);
    assert.equal(await description.locator('table').count(), 1);
    assert.ok((await description.locator('pre code').textContent()).includes('### 头像'));
    assert.equal(await description.locator('a').getAttribute('href'), 'https://fritia.online/creator/#intro');
    const sections = await page.locator('#third-party-detail-scroll > section > h3').allTextContents();
    assert.deepEqual(sections, ['角色卡介绍', '详细描述', '头像', '人格提示词', '参考语音']);
    await page.click('#third-party-back');
    await page.locator('[data-card-id="8002"]').click();
    assert.equal(await description.textContent(), '作者暂未填写详细描述。');
    assert.equal(await description.evaluate(node => getComputedStyle(node).color), 'rgb(151, 161, 173)');
    await page.click('#third-party-back');
    await page.locator('[data-card-id="8001"]').click();
    const buttonAlignment = await page.locator('#third-party-detail .btn').evaluateAll(buttons => buttons.map(button => {
      const icon = button.querySelector('img').getBoundingClientRect(), label = button.querySelector('span').getBoundingClientRect();
      return Math.abs(icon.top + icon.height / 2 - label.top - label.height / 2);
    }));
    assert.ok(buttonAlignment.every(distance => distance < 2), JSON.stringify(buttonAlignment));
    await page.locator('#third-party-detail-scroll').evaluate(node => node.scrollTop = node.scrollHeight);
    assert.equal(await page.locator('#third-party-back').isVisible(), true);
    await page.screenshot({ path: new URL(`detail-${viewport.width}x${viewport.height}.png`, artifacts).pathname.replace(/^\/([A-Z]:)/, '$1'), animations: 'disabled' });

    if (viewport.width === 1440) {
      const before = await page.evaluate(async () => {
        const storage = await import('/src/js/storage.js'), media = await import('/src/js/media_store.js');
        const saved = await media.saveDataUrlAsMedia('data:image/png;base64,KEEP', { id: 'third-party-existing-media' });
        const store = storage.loadAppStore();
        store.characters.push(storage.normalizeCharacterRecord({ id: 'manual-existing', name: '图书管理员 1', prompt: '保留手动导入角色', source: 'custom', avatar: saved.ref }));
        storage.saveAppStore(store);
        return storage.loadAppStore();
      });
      await page.evaluate(() => { window.showSaveFilePicker = async options => { window.__pickerName = options.suggestedName; return { createWritable: async () => ({ write: async blob => { window.__downloadText = await blob.text(); }, close: async () => { window.__downloadClosed = true; }, abort: async () => {} }) }; }; });
      await page.click('#third-party-download-prompt'); await page.waitForFunction(() => window.__downloadClosed === true);
      assert.equal(await page.evaluate(() => window.__downloadText), prompt);
      assert.equal(await page.evaluate(() => window.__pickerName), 'prompt.txt');
      mode = 'broken-voice'; await page.click('#third-party-install'); await page.waitForFunction(() => document.getElementById('third-party-detail-status').textContent.includes('安装失败'));
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('fritia_next_chat_store')).characters), before.characters);
      mode = 'normal'; revoked = true;
      await page.click('#third-party-install'); await page.waitForFunction(() => document.getElementById('third-party-detail-status').textContent.includes('撤销审核'));
      revoked = false;
      const staged = await page.evaluate(async () => {
        const { installThirdPartyCharacter, parseCharacterIssue } = await import('/src/js/third_party_cards_data.js');
        const db = await new Promise((resolve, reject) => { const r = indexedDB.open('fritia_media_store'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
        const keys = () => new Promise(resolve => { const tx = db.transaction('media'); const r = tx.objectStore('media').getAllKeys(); r.onsuccess = () => resolve(r.result); });
        const initial = await keys(), original = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) { if (key === 'fritia_next_chat_store') throw new Error('存档写入失败测试'); return original.call(this, key, value); };
        let failed = false;
        try { const raw = await (await fetch('https://api.github.com/repos/QingchenWait/Fritia_Online_CHAT_plugins/issues/2')).json(); await installThirdPartyCharacter(parseCharacterIssue(raw)); }
        catch (failure) { failed = failure.message.includes('存档写入失败测试'); }
        finally { Storage.prototype.setItem = original; }
        const final = await keys(); db.close(); return { failed, initial, final };
      });
      assert.equal(staged.failed, true); assert.deepEqual(staged.initial, staged.final);
      const mediaFailure = await page.evaluate(async () => {
        const { installThirdPartyCharacter, parseCharacterIssue } = await import('/src/js/third_party_cards_data.js');
        const db = await new Promise(resolve => { const r = indexedDB.open('fritia_media_store'); r.onsuccess = () => resolve(r.result); });
        const keys = () => new Promise(resolve => { const r = db.transaction('media').objectStore('media').getAllKeys(); r.onsuccess = () => resolve(r.result); });
        const initial = await keys(), original = FileReader.prototype.readAsDataURL;
        FileReader.prototype.readAsDataURL = function(blob) { if (blob.type === 'audio/wav') queueMicrotask(() => this.onerror(new ProgressEvent('error'))); else original.call(this, blob); };
        let failed = false;
        try { const raw = await (await fetch('https://api.github.com/repos/QingchenWait/Fritia_Online_CHAT_plugins/issues/3')).json(); await installThirdPartyCharacter(parseCharacterIssue(raw)); }
        catch { failed = true; } finally { FileReader.prototype.readAsDataURL = original; }
        const final = await keys(); db.close(); return { failed, initial, final };
      });
      assert.equal(mediaFailure.failed, true); assert.deepEqual(mediaFailure.initial, mediaFailure.final);
      await page.click('#third-party-install'); await page.waitForFunction(() => document.getElementById('third-party-detail-status').textContent.includes('已安装到角色列表'));
      assert.equal(await page.locator('#third-party-install').isDisabled(), true);
      const installed = await page.evaluate(async () => {
        const storage = await import('/src/js/storage.js'), media = await import('/src/js/media_store.js');
        const store = storage.loadAppStore(), card = store.characters.find(character => character.thirdPartyIssueId === 8001);
        return { store, card, avatar: await media.getMediaDataUrl(card.avatar), voice: await media.getMediaDataUrl(card.voiceSample) };
      });
      assert.equal(installed.card.prompt, prompt); assert.equal(installed.card.thirdPartyIssueNumber, 1);
      assert.equal(Object.hasOwn(installed.card, 'detailedDescription'), false);
      assert.equal(JSON.stringify(installed.store).includes('这段详细内容仅供浏览'), false);
      assert.equal(installed.card.description, '耐心解答读者问题，介绍阅读知识。');
      assert.deepEqual(installed.store.characters.filter(card => card.thirdPartyIssueId !== 8001), before.characters);
      assert.deepEqual(Buffer.from(installed.avatar.split(',')[1], 'base64'), png); assert.deepEqual(Buffer.from(installed.voice.split(',')[1], 'base64'), wav);
      await page.click('#third-party-back'); assert.equal(await page.locator('[data-card-id="8001"] .third-party-installed').isVisible(), true);
      await page.reload(); await page.waitForSelector('.conversation-item'); await enter();
      assert.equal(await page.locator('#third-party-disclaimer').isVisible(), false);
      await page.waitForSelector('[data-card-id]'); await page.selectOption('#third-party-sort', 'oldest');
      assert.equal(await page.locator('[data-card-id="8001"] .third-party-installed').isVisible(), true);
      opaqueVoice = true; await page.click('#third-party-refresh'); await page.waitForSelector('[data-card-id]');
      await page.selectOption('#third-party-sort', 'oldest'); await page.locator('[data-card-id="8001"]').click();
      await page.waitForFunction(() => !document.getElementById('third-party-download-voice').disabled);
      await page.evaluate(() => { window.__downloadClosed = false; window.showSaveFilePicker = async options => {
        window.__pickerName = options.suggestedName; return { createWritable: async () => ({ write: async blob => { window.__downloadBytes = [...new Uint8Array(await blob.arrayBuffer())]; }, close: async () => { window.__downloadClosed = true; }, abort: async () => {} }) };
      }; });
      await page.click('#third-party-download-voice'); await page.waitForFunction(() => window.__downloadClosed);
      assert.ok((await page.evaluate(() => window.__pickerName)).endsWith('.wav'));
      assert.deepEqual(Buffer.from(await page.evaluate(() => window.__downloadBytes)), wav);
      await page.click('#third-party-back');
      mode = 'offline'; await page.click('#third-party-refresh'); await page.waitForSelector('.third-party-error');
      assert.equal(await page.locator('[data-card-id]').count(), 0); assert.equal(await page.locator('.third-party-error a').getAttribute('href'), 'https://github.com/QingchenWait/Fritia_Online_CHAT_plugins/issues');
      const cached = await page.evaluate(async () => ({ keys: Object.keys(localStorage), entries: (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => request.url)))).flat() }));
      assert.ok(!cached.keys.some(key => /catalog|third.party.*list/.test(key))); assert.ok(cached.entries.every(url => !url.includes('github.com')));
    }
    assert.deepEqual(errors, []);
    report.push({ viewport, columns, apiRequests: apiRequests.length, layout, errors });
    console.log(`PASS ${viewport.width}x${viewport.height}: ${columns} columns, pagination, disclaimer, search/sort and detail fit`);
    await context.close();
  }
  for (const platform of ['windows', 'android']) {
    const viewport = platform === 'windows' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' }), page = await context.newPage();
    const errors = [], nativeCalls = [], directGithubRequests = [], downloads = [];
    let failVoice = true;
    page.on('pageerror', failure => errors.push(failure.message));
    await page.exposeFunction('__thirdPartyTestSave', bytes => { downloads.push(Buffer.from(bytes)); });
    await page.exposeFunction('__thirdPartyTestInvoke', async (command, args) => {
      if (command === 'choose_archive_file') return `fixture/${args.filename}`;
      if (command === 'write_archive_file') { downloads.push(Buffer.from(args.body, 'base64')); return {}; }
      assert.equal(command, 'proxy_fetch');
      const request = args.request, url = new URL(request.url);
      nativeCalls.push(request);
      let bytes;
      if (url.hostname === 'api.github.com') bytes = Buffer.from(JSON.stringify(/\/issues\/\d+$/.test(url.pathname) ? issue(1) : [issue(1)]));
      else if (failVoice && url.pathname.endsWith('voice.wav')) return { status: 404, headers: [], bodyBase64: '' };
      else bytes = url.pathname.endsWith('prompt.txt') ? Buffer.from(prompt) : url.pathname.endsWith('voice.wav') ? wav : png;
      return { status: 200, headers: [{ name: 'content-type', value: 'application/octet-stream' }], bodyBase64: bytes.toString('base64') };
    });
    await page.addInitScript(platform => {
      localStorage.setItem('fritia_chat_onboarding_dismissed', '1');
      const invoke = (command, args) => window.__thirdPartyTestInvoke(command, args);
      window.__TAURI__ = { core: { invoke } };
      if (platform === 'android') {
        window.__FRITIA_ANDROID_SHELL__ = { invoke };
        window.FritiaAndroid = {};
        window.__thirdPartyWebDavCalls = 0;
        window.FritiaArchive = { request() { window.__thirdPartyWebDavCalls += 1; throw new Error('WebDAV origin restriction: GitHub CDN redirects require the generic native proxy'); } };
      }
      window.showSaveFilePicker = async () => ({ createWritable: async () => ({
        write: async blob => window.__thirdPartyTestSave([...new Uint8Array(await blob.arrayBuffer())]), close: async () => {}, abort: async () => {}
      }) });
    }, platform);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (url.hostname === 'api.github.com' || (url.hostname === 'github.com' && url.pathname.includes('/user-attachments/'))) directGithubRequests.push(url.href);
      return route.abort();
    });
    await page.goto(origin); await page.waitForSelector('.conversation-item');
    await page.click('#mobile-menu-btn'); await page.click('#main-menu-plugin-store'); await page.click('[data-plugin-store-section="third-party"]');
    await page.check('#third-party-dont-remind'); await page.click('#third-party-acknowledge');
    await page.locator('[data-card-id="8001"]').click();
    await page.click('#third-party-download-prompt'); await page.waitForFunction(() => document.getElementById('third-party-detail-status').textContent === '附件已保存。');
    assert.deepEqual(downloads.at(-1), Buffer.from(prompt));
    await page.click('#third-party-install'); await page.waitForFunction(() => document.getElementById('third-party-detail-status').textContent.includes('HTTP 404'));
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fritia_next_chat_store')).characters.some(card => card.thirdPartyIssueId === 8001)), false);
    failVoice = false;
    await page.click('#third-party-install'); await page.waitForFunction(() => document.getElementById('third-party-detail-status').textContent.includes('已安装到角色列表'));
    const installed = await page.evaluate(async () => {
      const { loadAppStore } = await import('/src/js/storage.js'), { getMediaDataUrl } = await import('/src/js/media_store.js');
      const card = loadAppStore().characters.find(item => item.thirdPartyIssueId === 8001);
      return { prompt: card.prompt, avatar: await getMediaDataUrl(card.avatar), voice: await getMediaDataUrl(card.voiceSample) };
    });
    assert.equal(installed.prompt, prompt);
    assert.deepEqual(Buffer.from(installed.avatar.split(',')[1], 'base64'), png);
    assert.deepEqual(Buffer.from(installed.voice.split(',')[1], 'base64'), wav);
    assert.equal(await page.locator('#third-party-install').isDisabled(), true);
    assert.ok(nativeCalls.some(request => request.url.includes('/user-attachments/files/')));
    assert.ok(nativeCalls.every(request => request.method === 'GET' && request.bodyBase64 === null));
    assert.deepEqual(directGithubRequests, [], 'native clients must never fetch the GitHub API or attachments in the browser');
    if (platform === 'android') assert.equal(await page.evaluate(() => window.__thirdPartyWebDavCalls), 0);
    assert.deepEqual(errors, []);
    report.push({ platform, nativeRequests: nativeCalls.length, directGithubRequests, errors });
    console.log(`PASS ${platform}: generic native proxy, single download, complete install and HTTP failure with browser requests blocked`);
    await context.close();
  }
  await writeFile(new URL('report.json', artifacts), JSON.stringify(report, null, 2));
} finally { await browser.close(); }
