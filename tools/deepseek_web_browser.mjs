import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_MODULE) return import(process.env.PLAYWRIGHT_MODULE);
  try { return await import('playwright'); } catch (error) {
    // Reuse an existing npx installation; never install a production dependency.
    const cache = process.env.npm_config_cache || (process.platform === 'win32'
      ? path.join(homedir(), 'AppData', 'Local', 'npm-cache') : path.join(homedir(), '.npm'));
    for (const entry of await readdir(path.join(cache, '_npx')).catch(() => [])) {
      try { return await import(pathToFileURL(path.join(cache, '_npx', entry, 'node_modules', 'playwright', 'index.mjs')).href); }
      catch { /* Try the next existing cache entry. */ }
    }
    throw error;
  }
}

const { chromium } = await loadPlaywright();
const origin = process.env.CHAT_TEST_URL || 'http://127.0.0.1:3059';
let browser, server;
try {
  if (!process.env.CHAT_TEST_URL) {
    server = spawn(process.execPath, ['tools/static_server.mjs'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true,
      env: { ...process.env, PORT: '3059' }, stdio: ['ignore', 'pipe', 'pipe']
    });
    await new Promise((resolve, reject) => {
      server.stdout.once('data', resolve);
      server.once('error', reject);
      server.once('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
  }
  browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'],
    ...(process.env.CHAT_TEST_BROWSER ? { executablePath: process.env.CHAT_TEST_BROWSER } : {}) });

  for (const viewport of [
    { width: 1440, height: 900 }, { width: 390, height: 844 },
    { width: 320, height: 568 }, { width: 980, height: 360 }, { width: 390, height: 320 }
  ]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [], requests = [];
    let replyNumber = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('fritia_chat_onboarding_dismissed', '1'));
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url === 'https://api.deepseek.com/v1/models') return route.fulfill({ json: { data: [
        { id: 'deepseek-flash', effort: { supported_levels: ['low', 'high', 'max'] } },
        { id: 'deepseek-v4-pro', effort: { supported_levels: ['low', 'high', 'max'] } }
      ] } });
      if (url === 'https://api.deepseek.com/v1/chat/completions') {
        const body = route.request().postDataJSON();
        requests.push({ url, body });
        if (body.messages[0]?.content?.includes('网页检索规划器')) {
          return route.fulfill({ json: { choices: [{ message: {
            content: JSON.stringify({ queries: ['DeepSeek 功能'], urls: ['https://example.com/article'] })
          } }] } });
        }
        const content = `WEB_REPLY_${++replyNumber} 正文及来源 https://example.com/article`;
        if (body.stream) return route.fulfill({ contentType: 'text/event-stream', body: [
          `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'INTERNAL_ONLY' } }] })}`,
          `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`,
          'data: [DONE]', ''
        ].join('\n\n') });
        return route.fulfill({ json: { choices: [{ message: { content, reasoning_content: 'INTERNAL_ONLY' } }] } });
      }
      if (url === 'https://api.deepseek.com/v1/tools/search') {
        requests.push({ url, body: route.request().postDataJSON() });
        return route.fulfill({ json: { results: [{ title: '搜索来源', url: 'https://example.com/search',
          summary: 'WEB_SEARCH_FIXTURE', content: '搜索正文' }] } });
      }
      if (url === 'https://api.deepseek.com/v1/tools/fetch') {
        requests.push({ url, body: route.request().postDataJSON() });
        return route.fulfill({ json: { title: '阅读来源', content: '# WEB_FETCH_FIXTURE\n网页正文' } });
      }
      return url.startsWith(origin) ? route.continue() : route.abort();
    });
    await page.goto(origin);
    await page.waitForSelector('.conversation-item');
    await page.evaluate(async () => {
      const { saveSettings } = await import('/src/js/settings.js');
      const provider = { id: 'flash-fixture', apiKey: 'fixture-only', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash' };
      saveSettings({ chatProviders: [provider, { ...provider, id: 'pro-fixture', model: 'deepseek-v4-pro' }],
        defaultChatProviderId: provider.id, defaultImageCaptionProviderId: provider.id });
    });
    await page.locator('.conversation-item').first().click();
    await page.click('#chat-model-control-btn');
    await page.waitForSelector('#deepseek-web-controls', { state: 'visible' });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#chat-model-popover')).transform === 'none');
    const popover = page.locator('#chat-model-popover');
    const width = (await popover.boundingBox()).width;
    const offColors = await page.locator('#deepseek-web-search-btn').evaluate(button => ({
      text: getComputedStyle(button).color, dot: getComputedStyle(button.querySelector('i')).backgroundColor
    }));
    assert.equal(await page.locator('#deepseek-web-search-btn').getAttribute('aria-checked'), 'false');
    assert.equal(await page.locator('#deepseek-read-url-btn').getAttribute('aria-checked'), 'false');
    assert.equal(offColors.text, 'rgb(155, 163, 179)');
    assert.equal(offColors.dot, 'rgb(186, 193, 205)');

    const buttonLayout = await page.locator('.deepseek-web-controls__actions').evaluate(container => {
      const buttons = [...container.querySelectorAll('button')];
      return buttons.map(button => {
        const rect = button.getBoundingClientRect(), dot = button.querySelector('i').getBoundingClientRect();
        const text = button.querySelector('span').getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
          textLeft: text.left, textRight: text.right, textTop: text.top, textBottom: text.bottom,
          dotLeft: dot.left, dotRight: dot.right, dotTop: dot.top, dotBottom: dot.bottom };
      });
    });
    assert.ok(Math.abs(buttonLayout[0].top - buttonLayout[1].top) < 1, 'buttons stay on one row');
    for (const rect of buttonLayout) {
      assert.ok(rect.dotRight <= rect.textLeft && rect.textRight <= rect.right + 1, 'dot and label fit button');
      assert.ok(rect.dotTop >= rect.textTop && rect.dotBottom <= rect.textBottom, 'dot aligns with label');
    }

    await page.click('#deepseek-web-search-btn');
    await page.click('#deepseek-read-url-btn');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#deepseek-web-search-btn')).color === 'rgb(79, 99, 255)');
    const onColors = await page.locator('#deepseek-web-search-btn').evaluate(button => ({
      text: getComputedStyle(button).color, dot: getComputedStyle(button.querySelector('i')).backgroundColor
    }));
    assert.equal(onColors.text, 'rgb(79, 99, 255)');
    assert.equal(onColors.dot, 'rgb(33, 166, 117)');
    assert.equal((await popover.boundingBox()).width, width, 'enabling features preserves menu width');
    if (viewport.height > 800) {
      const screenshotDirectory = process.env.CHAT_TEST_SCREENSHOT_DIR || path.join(tmpdir(), 'fritia-deepseek-web');
      await mkdir(screenshotDirectory, { recursive: true });
      const screenshot = path.join(screenshotDirectory, `menu-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: screenshot, animations: 'disabled' });
      console.log(`SCREENSHOT ${screenshot}`);
    }

    await page.click('#chat-model-submenu-trigger');
    await page.waitForSelector('#chat-model-submenu', { state: 'visible' });
    const submenuVisible = await page.locator('#chat-model-submenu').evaluate(menu => {
      const target = menu.querySelector('button'), rect = target.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return menu.contains(hit);
    });
    assert.ok(submenuVisible, 'absolute submenu remains visible outside the scrolling main menu');
    await page.locator('#chat-model-submenu button').filter({ hasText: 'deepseek-v4-pro' }).click();
    await page.waitForSelector('#deepseek-web-controls', { state: 'hidden' });
    assert.equal((await popover.boundingBox()).width, width, 'pro keeps the same menu width');
    await page.click('#chat-model-submenu-trigger');
    await page.locator('#chat-model-submenu button').filter({ hasText: 'deepseek-flash' }).click();
    await page.waitForSelector('#deepseek-web-controls', { state: 'visible' });
    assert.equal(await page.locator('#deepseek-web-search-btn').getAttribute('aria-checked'), 'true');

    const scroll = await page.locator('.chat-model-popover__scroll').evaluate(element => {
      const rect = element.getBoundingClientRect();
      element.scrollTop = element.scrollHeight;
      return { top: rect.top, bottom: rect.bottom, scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight, scrollTop: element.scrollTop,
        overflow: getComputedStyle(element).overflowY, scrollbar: getComputedStyle(element).scrollbarColor };
    });
    assert.ok(scroll.top >= -1 && scroll.bottom <= viewport.height + 1, 'main menu fits the available viewport height');
    assert.equal(scroll.overflow, 'auto');
    assert.notEqual(scroll.scrollbar, 'auto', 'scrollbar uses app colors');
    if (viewport.height <= 360) {
      assert.ok(scroll.scrollHeight > scroll.clientHeight, 'short viewport has scrollable content');
      assert.ok(scroll.scrollTop > 0, 'all menu content can be reached by scrolling');
    }

    await page.evaluate(async () => {
      const { saveSettings } = await import('/src/js/settings.js');
      saveSettings({ temperature: 0.7 });
    });
    await page.reload();
    await page.waitForSelector('.conversation-item');
    await page.locator('.conversation-item').first().click();
    await page.click('#chat-model-control-btn');
    assert.equal(await page.locator('#deepseek-web-search-btn').getAttribute('aria-checked'), 'true');
    assert.equal(await page.locator('#deepseek-read-url-btn').getAttribute('aria-checked'), 'true');
    await page.locator('.chat-model-popover__scroll').evaluate(element => { element.scrollTop = 0; });
    await page.click('#deepseek-web-search-btn');
    assert.equal(await page.locator('#deepseek-web-search-btn').getAttribute('aria-checked'), 'false');
    assert.equal(await page.locator('#deepseek-read-url-btn').getAttribute('aria-checked'), 'true');

    if (viewport.height > 800) {
      // Drive actual composer turns while the app's MCP switch remains off.
      assert.equal(await page.evaluate(async () => {
        const { isMcpEnabledForConversation } = await import('/src/js/mcp_tools.js');
        const store = JSON.parse(localStorage.getItem('fritia_next_chat_store'));
        return isMcpEnabledForConversation(store.activeConversationId);
      }), false);
      const chooseEffort = async label => {
        await page.locator('#chat-reasoning-options button').filter({ hasText: label }).click();
        await page.click('#chat-model-control-btn');
      };
      const send = async text => {
        const expected = `WEB_REPLY_${replyNumber + 1}`;
        const before = requests.length;
        await page.fill('#message-input', text);
        await page.press('#message-input', 'Enter');
        await page.waitForFunction(expected => {
          const store = JSON.parse(localStorage.getItem('fritia_next_chat_store'));
          const latest = store.messages[store.activeConversationId].at(-1);
          return latest?.status === 'sent' && latest.text.includes(expected);
        }, expected);
        return requests.slice(before);
      };

      await page.click('#deepseek-read-url-btn');
      await chooseEffort('深度');
      const baseline = await send('开关关闭时保持原生回复');
      assert.equal(baseline.length, 1);
      assert.equal(baseline[0].body.reasoning_effort, 'high');
      assert.equal(baseline[0].body.stream, false);
      assert.ok(!baseline[0].body.messages.some(message => message.content?.includes('Search / Fetch API')));

      await page.click('#chat-model-control-btn');
      await page.click('#deepseek-web-search-btn');
      await page.click('#deepseek-read-url-btn');
      await page.click('#chat-model-control-btn');
      for (const effort of ['high', 'max']) {
        if (effort === 'max') {
          await page.click('#chat-model-control-btn');
          await chooseEffort('极限');
        }
        const turn = await send(`搜索 DeepSeek 功能并阅读 https://example.com/article ${effort}`);
        assert.equal(turn.length, 4, 'planner, Search, Fetch and main reply all run without MCP');
        const search = turn.find(request => request.url.endsWith('/tools/search'));
        const fetch = turn.find(request => request.url.endsWith('/tools/fetch'));
        assert.deepEqual(search.body, { query: 'DeepSeek 功能', count: 5, need_content: true });
        assert.deepEqual(fetch.body, { url: 'https://example.com/article' });
        const main = turn.at(-1).body;
        assert.equal(main.reasoning_effort, effort);
        assert.deepEqual(main.thinking, { type: 'enabled' });
        assert.equal(main.stream, effort === 'max', 'existing high and native max streaming remain unchanged');
        assert.equal(main.tools, undefined);
        const reference = main.messages.find(message => message.content?.includes('Search / Fetch API'));
        assert.ok(reference?.content.includes('WEB_SEARCH_FIXTURE') && reference.content.includes('WEB_FETCH_FIXTURE'));
        const saved = await page.evaluate(() => {
          const store = JSON.parse(localStorage.getItem('fritia_next_chat_store'));
          return store.messages[store.activeConversationId].at(-1);
        });
        assert.notEqual(saved.meta?.toolMode, true);
        assert.equal(saved.meta?.reasoning?.reasoning_content, 'INTERNAL_ONLY');
        assert.ok(!await page.locator('.message-content').allTextContents().then(values => values.join('').includes('INTERNAL_ONLY')));
      }
      console.log(`PASS ${viewport.width}×${viewport.height}: composer Search/Fetch with MCP off, switches off baseline, high JSON response and max SSE`);
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${viewport.width}×${viewport.height}: flash/pro, independent toggles, colors, fixed width, scrolling, submenu, save and reload`);
  }
} finally { await browser?.close(); server?.kill(); }
