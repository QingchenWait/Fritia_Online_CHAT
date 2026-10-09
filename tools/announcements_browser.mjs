import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const origin = process.env.CHAT_TEST_URL || 'http://127.0.0.1:3034';
const screenshots = path.join(tmpdir(), 'fritia-announcements-v110');
await mkdir(screenshots, { recursive: true });
let server;
if (!process.env.CHAT_TEST_URL) {
  server = spawn(process.execPath, ['tools/static_server.mjs'], {
    cwd: root, env: { ...process.env, PORT: '3034' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve);
    server.once('error', reject);
    server.once('exit', code => reject(new Error(`Static server exited: ${code}`)));
  });
}

const entry = content => ({ title: '更新公告', date: '2026-10-09', version: 'v1.1.0', content });

async function cache(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('fritia_announcement_board', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('files');
      const get = transaction.objectStore('files').get('announcement.json');
      transaction.oncomplete = () => { db.close(); resolve(get.result); };
    };
  }));
}

async function ready(page) {
  await page.waitForFunction(() => document.querySelector('.conversation-item')
    && document.querySelector('#announcement-scroll').getAttribute('aria-busy') === 'false');
}

async function geometry(page) {
  return page.evaluate(() => {
    const scroll = document.querySelector('#announcement-scroll');
    const panel = document.querySelector('.announcement-shell').getBoundingClientRect();
    const header = document.querySelector('.announcement-head').getBoundingClientRect();
    const cards = [...document.querySelectorAll('.announcement-card')].map(card => card.getBoundingClientRect());
    return { panel: { x: panel.x, y: panel.y, right: panel.right, bottom: panel.bottom },
      headerY: header.y, height: scroll.clientHeight, scrollHeight: scroll.scrollHeight,
      noOverflow: scroll.scrollWidth <= scroll.clientWidth + 1,
      singleColumn: cards.every(card => Math.abs(card.x - cards[0].x) < 1 && Math.abs(card.width - cards[0].width) < 1),
      customScrollbar: getComputedStyle(scroll).scrollbarColor !== 'auto' };
  });
}

let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHAT_TEST_BROWSER ? { executablePath: process.env.CHAT_TEST_BROWSER } : {}) });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('fritia_chat_onboarding_dismissed', '1');
      window.announcementFetchOptions = [];
      const original = window.fetch;
      window.fetch = (input, options) => {
        if (String(input).includes('/public/announcement.json?')) window.announcementFetchOptions.push({ cache: options.cache, credentials: options.credentials });
        return original(input, options);
      };
    });
    let requests = 0, mode = 'success';
    let announcements = {
      '0': entry('第一行\n第二行\n\n**Markdown 加粗**'),
      '2': entry('<ul><li>第一项</li><li>第二项</li></ul>'),
      '8': entry(Array.from({ length: 16 }, (_, i) => `<p>公告详细内容 ${i + 1}，保持单列阅读。</p>`).join('')),
      '10': entry('<h2>HTML 标题</h2><p>第一行<br>第二行 <strong>HTML 加粗</strong> &amp; 转义</p>'
        + '<ul><li>列表一</li><li><a href="https://example.com/announcement">查看官网</a></li></ul>'
        + '<a href="javascript:window.announcementInjected=true">危险链接</a><script>window.announcementInjected=true</script>'
        + '<img src="invalid://x" onerror="window.announcementInjected=true">'
        + Array.from({ length: 28 }, (_, i) => `<p>更新说明 ${i + 1}：这里保留换行和完整内容。</p>`).join(''))
    };
    await page.route('**/*', async route => {
      const url = route.request().url();
      if (url.includes('/public/announcement.json?')) {
        requests += 1;
        if (mode === 'network') return route.abort();
        if (mode === 'http') return route.fulfill({ status: 503, body: 'unavailable' });
        if (mode === 'json') return route.fulfill({ contentType: 'application/json', body: '{' });
        if (mode === 'schema') return route.fulfill({ json: { '11': { title: 'incomplete' } } });
        return route.fulfill({ json: announcements });
      }
      return url.startsWith(origin) ? route.continue() : route.abort();
    });
    await page.goto(origin);
    await ready(page);
    assert.deepEqual(await page.evaluate(() => window.announcementFetchOptions), [{ cache: 'no-store', credentials: 'omit' }]);
    const comparisons = await page.evaluate(async () => {
      const { normalizeAnnouncementFile, sortedAnnouncementIds, mergeAnnouncementFile } = await import('/src/js/announcements.js');
      const entry = content => ({ title: '公告', date: '2026-10-09', version: 'v1.1.0', content });
      const empty = { fileName: 'announcement.json', announcements: {}, unreadIds: [] };
      const first = mergeAnnouncementFile(empty, { '0': entry(''), '2': entry('') });
      return {
        sorted: sortedAnnouncementIds(normalizeAnnouncementFile({ '2': entry(''), '10': entry(''), '9007199254740993': entry('') })),
        rejected: [null, [], { x: entry('') }, { '1': { title: 'missing' } }, { '01': entry('') }].map(raw => {
          try { normalizeAnnouncementFile(raw); return false; } catch { return true; }
        }),
        first: first.unreadIds,
        accumulated: mergeAnnouncementFile({ ...first, unreadIds: ['2'] }, { '0': entry('changed'), '2': entry(''), '10': entry('new') }).unreadIds
      };
    });
    assert.deepEqual(comparisons, { sorted: ['9007199254740993', '10', '2'], rejected: [true, true, true, true, true], first: ['0', '2'], accumulated: ['2', '10'] });
    assert.equal(requests, 1);
    assert.equal(await page.locator('#announcement-unread-count').textContent(), '4');
    await page.reload();
    await ready(page);
    assert.equal(requests, 2);
    assert.equal((await cache(page)).unreadIds.length, 4, 'unopened unread survives reload');
    const dataBefore = await page.evaluate(() => ({ store: localStorage.getItem('fritia_next_chat_store'), settings: localStorage.getItem('fritia-settings') }));
    await page.click('#announcement-btn');
    await page.locator('.announcement-shell').evaluate(async node => { await Promise.all(node.getAnimations().map(animation => animation.finished)); });
    await page.waitForFunction(() => document.querySelector('#announcement-unread-count').textContent === '3');
    assert.deepEqual(await page.locator('.announcement-card').evaluateAll(cards => cards.map(card => card.dataset.announcementId)), ['10', '8', '2', '0']);
    assert.equal(await page.locator('.announcement-card.is-unread').count(), 4);
    assert.equal(await page.locator('[data-announcement-id="10"] .markdown-body strong').textContent(), 'HTML 加粗');
    assert.ok(await page.locator('[data-announcement-id="10"] .markdown-body br').count());
    assert.equal(await page.locator('[data-announcement-id="10"] .markdown-body li').count(), 2);
    assert.equal(await page.locator('[data-announcement-id="2"] .markdown-body li').count(), 2, 'HTML-only list converts');
    assert.equal(await page.locator('[data-announcement-id="0"] .markdown-body strong').textContent(), 'Markdown 加粗');
    assert.ok(await page.locator('[data-announcement-id="0"] .markdown-body br').count(), 'plain Markdown keeps newlines');
    assert.equal(await page.locator('#announcement-panel script,#announcement-panel a[href^="javascript:"]').count(), 0);
    assert.equal(await page.evaluate(() => window.announcementInjected), undefined);
    assert.equal(await page.locator('.announcement-meta').first().textContent(), '2026-10-09 | v1.1.0');
    const firstGeometry = await geometry(page);
    assert.ok(firstGeometry.singleColumn && firstGeometry.noOverflow && firstGeometry.customScrollbar);
    assert.ok(firstGeometry.scrollHeight > firstGeometry.height);
    await page.screenshot({ path: path.join(screenshots, `${viewport.width}-unread.png`) });

    const link = page.locator('#announcement-panel a[href="https://example.com/announcement"]');
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
    const popupPromise = page.waitForEvent('popup');
    await link.click();
    const popup = await popupPromise;
    await popup.close();
    await page.evaluate(() => {
      window.announcementExternalCalls = [];
      window.__TAURI__ = { core: { invoke: (command, args) => { window.announcementExternalCalls.push({ command, args }); return Promise.resolve(); } } };
    });
    await link.click();
    assert.deepEqual(await page.evaluate(() => window.announcementExternalCalls), [{ command: 'open_external_url', args: { url: 'https://example.com/announcement' } }]);
    await page.evaluate(() => { delete window.__TAURI__; });
    for (const id of ['8', '2', '0']) {
      await page.locator(`.announcement-card-head[data-announcement-id="${id}"]`).evaluate(node => node.scrollIntoView({ block: 'start' }));
      await page.waitForFunction(id => !document.querySelector('#announcement-unread-count').classList.contains('hidden')
        ? Number(document.querySelector('#announcement-unread-count').textContent) < ({ '8': 3, '2': 2, '0': 1 }[id]) : true, id);
    }
    await page.waitForFunction(() => document.querySelector('#announcement-unread-count').classList.contains('hidden'));
    assert.equal((await geometry(page)).headerY, firstGeometry.headerY, 'header stays fixed while scrolling');
    await page.click('[data-panel-close="announcement-panel"]');
    assert.equal(await page.locator('#announcement-btn').getAttribute('aria-expanded'), 'false');
    await page.click('#announcement-btn');
    assert.equal(await page.locator('.announcement-card.is-unread').count(), 0);
    assert.equal(requests, 2, 'reopening never refetches');
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('#announcement-panel').evaluate(node => node.classList.contains('hidden')));
    assert.equal((await cache(page)).unreadIds.length, 0);
    assert.deepEqual(await page.evaluate(() => ({ store: localStorage.getItem('fritia_next_chat_store'), settings: localStorage.getItem('fritia-settings') })), dataBefore);

    announcements = { ...announcements, '11': entry('新公告') };
    await page.reload();
    await ready(page);
    assert.equal((await cache(page)).unreadIds.join(), '11');
    const beforeFailure = await cache(page);
    for (const failure of ['network', 'http', 'json', 'schema']) {
      mode = failure;
      const beforeRequests = requests;
      await page.reload();
      await ready(page);
      assert.equal(requests, beforeRequests + 1);
      assert.deepEqual(await cache(page), beforeFailure, `${failure} preserves cache and unread`);
      assert.ok((await page.locator('#announcement-status').textContent()).includes('本机保存'));
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${viewport.width}×${viewport.height}: rendering, visible-only unread, persistence, one fetch, failures, links, fixed header, scrollbar, isolated data`);
  }

  // Real project sample + extreme viewports exercise zoom-equivalent CSS sizes.
  const sample = JSON.parse(await readFile(path.join(root, 'src/public/announcement,json'), 'utf8'));
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1024, height: 280 }, { width: 768, height: 1024 }, { width: 1536, height: 864 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }, { width: 3840, height: 2160 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('fritia_chat_onboarding_dismissed', '1'));
    await page.route('**/*', route => route.request().url().includes('/public/announcement.json?')
      ? route.fulfill({ json: sample }) : route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin); await ready(page); await page.click('#announcement-btn');
    await page.locator('.announcement-shell').evaluate(async node => { await Promise.all(node.getAnimations().map(animation => animation.finished)); });
    const layout = await geometry(page);
    assert.ok(layout.singleColumn && layout.noOverflow && layout.customScrollbar && layout.height > 0);
    assert.ok(layout.panel.x >= 0 && layout.panel.y >= 0 && layout.panel.right <= viewport.width + 1 && layout.panel.bottom <= viewport.height + 1);
    assert.equal(await page.locator('#announcement-panel a').count(), 4);
    assert.ok(await page.locator('#announcement-panel a').evaluateAll(links => links.every(link => link.target === '_blank')));
    await page.locator('#announcement-scroll').evaluate(node => { node.scrollTop = node.scrollHeight; });
    assert.equal((await geometry(page)).headerY, layout.headerY);
    await page.click('[data-panel-close="announcement-panel"]');
    if (viewport.width <= 760) {
      assert.ok(await page.locator('.rail').evaluate(rail => {
        const bounds = rail.getBoundingClientRect();
        return [...rail.querySelectorAll('button')].every(button => {
          const rect = button.getBoundingClientRect();
          return rect.x >= bounds.x && rect.right <= bounds.right;
        });
      }), 'all seven mobile navigation entries fit');
    }
    await context.close();
    console.log(`PASS ${viewport.width}×${viewport.height}: official sample, single column, bounded window, fixed header, navigation`);
  }

  for (const failure of ['first-offline', 'empty', 'storage-read', 'storage-write']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.addInitScript(failure => {
      localStorage.setItem('fritia_chat_onboarding_dismissed', '1');
      if (failure === 'storage-read') {
        const original = indexedDB.open.bind(indexedDB);
        indexedDB.open = (name, ...args) => {
          if (name === 'fritia_announcement_board') throw new DOMException('blocked', 'SecurityError');
          return original(name, ...args);
        };
      }
      if (failure === 'storage-write') {
        const original = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function(stores, mode, ...args) {
          if (this.name === 'fritia_announcement_board' && mode === 'readwrite') throw new DOMException('full', 'QuotaExceededError');
          return original.call(this, stores, mode, ...args);
        };
      }
    }, failure);
    await page.route('**/*', route => route.request().url().includes('/public/announcement.json?')
      ? failure === 'first-offline' ? route.abort() : route.fulfill({ json: failure === 'empty' ? {} : sample })
      : route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin); await ready(page); await page.click('#announcement-btn');
    const status = await page.locator('#announcement-status').textContent();
    assert.ok(status.includes(failure === 'first-offline' ? '无法获取' : failure === 'empty' ? '暂无公告' : '无法保存'));
    assert.equal(await page.locator('.announcement-card').count(), failure === 'first-offline' || failure === 'empty' ? 0 : 2);
    await context.close();
    console.log(`PASS ${failure}: recoverable status, main UI remains available`);
  }
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await browser?.close();
  server?.kill();
}
