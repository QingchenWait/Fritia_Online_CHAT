import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.CHAT_TEST_URL || 'http://127.0.0.1:3040';
let server, browser;
try {
  if (!process.env.CHAT_TEST_URL) {
    server = spawn(process.execPath, ['tools/static_server.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...process.env, PORT: '3040' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(new Error(`Server exited: ${code}`))); });
  }
  browser = await chromium.launch({ headless: true, ...(process.env.CHAT_TEST_BROWSER ? { executablePath: process.env.CHAT_TEST_BROWSER } : {}) });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [], requests = [];
    let mode = 'native';
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('fritia_chat_onboarding_dismissed', '1'));
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url === 'https://api.deepseek.com/v1/models') return route.fulfill({ json: { data: [{ id: 'deepseek-flash', effort: { supported_levels: ['low', 'high', 'max'] } }] } });
      if (url === 'https://api.deepseek.com/v1/chat/completions') {
        const body = route.request().postDataJSON(); requests.push(body);
        if (mode === 'json-empty') return route.fulfill({ json: { choices: [{ message: { content: '', reasoning_content: 'RAW_FALLBACK_AVAILABLE' } }], id: 'empty-body-fallback' } });
        if (mode === 'non-json') return route.fulfill({ contentType: 'text/event-stream', body: 'data: 普通文本兜底回复\n\ndata: [DONE]\n\n' });
        if (mode === 'plain') return route.fulfill({ json: { choices: [{ message: { content: '嗯，我也喜欢你，进来抱一下。', reasoning_content: 'INTERNAL_ONLY' } }] } });
        if (mode === 'mislabel-json') return route.fulfill({ contentType: 'application/json', body: '标为 JSON 的普通文本也保留' });
        if (mode === 'other-json') return route.fulfill({ json: { choices: [{ message: { content: '{"text":"普通 JSON 回复，无 reply 字段"}', reasoning_content: 'INTERNAL_ONLY' } }] } });
        if (mode === 'stream-empty') return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"reasoning_content":"STREAM_FALLBACK_AVAILABLE"}}]}\n\ndata: [DONE]\n\n' });
        if (body.reasoning_effort !== 'max') return route.fulfill({ json: { choices: [{ message: { content: '正常点评小笼包，汤汁很足。', reasoning_content: 'INTERNAL_ONLY' } }] } });
        const chunks = [
          { choices: [{ delta: { reasoning_content: 'INTERNAL_ONLY' } }] },
          { choices: [{ delta: { content: '嗯，这就出发。\n' } }] },
          { choices: [{ delta: { content: '手给我，我们慢慢走过去。' } }] }
        ];
        return route.fulfill({ contentType: 'text/event-stream', body: chunks.map(value => `data: ${JSON.stringify(value)}\n\n`).join('') + 'data: [DONE]\n\n' });
      }
      return url.startsWith(origin) ? route.continue() : route.abort();
    });
    await page.goto(origin); await page.waitForFunction(() => document.querySelector('.conversation-item'));
    const configure = intimate => page.evaluate(async intimate => {
      const { saveSettings } = await import('/src/js/settings.js');
      const provider = { id: 'deepseek-fixture', apiKey: 'fixture-only', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash' };
      saveSettings({ chatProviders: [provider], defaultChatProviderId: provider.id, defaultImageCaptionProviderId: provider.id,
        localizationSensitivity: 1, deepseekIntimateMode: intimate });
    }, intimate);
    const latest = () => page.evaluate(() => {
      const store = JSON.parse(localStorage.getItem('fritia_next_chat_store'));
      return store.messages[store.activeConversationId].at(-1);
    });
    async function send(text, expected) {
      const before = requests.length;
      await page.fill('#message-input', text); await page.press('#message-input', 'Enter');
      await page.waitForFunction(expected => {
        const store = JSON.parse(localStorage.getItem('fritia_next_chat_store'));
        const last = store.messages[store.activeConversationId].at(-1);
        return last?.status === 'sent' && last.text.includes(expected);
      }, expected);
      assert.equal(requests.length, before + 1);
      assert.equal((await latest()).status, 'sent');
    }
    async function choose(label) {
      await page.click('#chat-model-control-btn');
      await page.locator('#chat-reasoning-options button').filter({ hasText: label }).click();
      await page.click('#chat-model-control-btn');
    }
    await configure(false); await page.locator('.conversation-item').first().click(); await choose('极限');
    for (const intimate of [false, true]) {
      await configure(intimate); await send(`走吧走吧 ${intimate ? 'special-on' : 'special-off'}`, '手给我，我们慢慢走过去。');
      const wire = requests.at(-1), saved = await latest();
      assert.equal(wire.reasoning_effort, 'max'); assert.deepEqual(wire.thinking, { type: 'enabled' });
      assert.equal(wire.stream, true); assert.equal(wire.response_format, undefined);
      assert.ok(wire.messages.some(message => message.role === 'system' && message.content.includes('不要再附加')));
      assert.equal(wire.messages.some(message => message.role === 'user' && message.content.includes('<特殊模式>')), intimate);
      assert.equal(saved.meta.reasoning.reasoning_content, 'INTERNAL_ONLY'); assert.equal(saved.meta.deepseekIntimateMode, intimate);
      assert.ok(!await page.locator('.message-content').allTextContents().then(values => values.join().includes('INTERNAL_ONLY')));
    }
    await choose('深度'); await send('正常点评应完整保留', '正常点评小笼包');
    assert.equal(requests.at(-1).reasoning_effort, 'high'); assert.equal(requests.at(-1).stream, false);
    assert.equal(requests.at(-1).response_format, undefined);
    await choose('极限');
    mode = 'plain'; await send('亲亲老婆', '嗯，我也喜欢你，进来抱一下。');
    mode = 'mislabel-json'; await send('响应头标为 JSON 仍需保留文本', '标为 JSON 的普通文本也保留');
    mode = 'other-json'; await send('JSON 形式回复仍可接受', '普通 JSON 回复，无 reply 字段');
    mode = 'non-json'; await send('非 JSON 流式文本需要兜底', '普通文本兜底回复');
    mode = 'json-empty'; await send('空正文需要保留原始响应', 'empty-body-fallback');
    assert.ok((await latest()).text.includes('RAW_FALLBACK_AVAILABLE'));
    mode = 'stream-empty'; await send('流式空正文仍需要兜底', 'STREAM_FALLBACK_AVAILABLE');
    const failures = await page.evaluate(() => {
      const store = JSON.parse(localStorage.getItem('fritia_next_chat_store'));
      return store.messages[store.activeConversationId].filter(message => message.status === 'error');
    });
    assert.equal(failures.length, 0, 'valid text and fallback must never become fabricated format errors');
    await page.reload(); await page.waitForFunction(() => document.querySelector('.conversation-item'));
    const texts = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('fritia_next_chat_store')).messages).flat().map(message => message.text));
    assert.ok(texts.some(text => text.includes('嗯，我也喜欢你，进来抱一下。')));
    assert.ok(texts.some(text => text.includes('empty-body-fallback')));
    assert.deepEqual(errors, []); await context.close();
    console.log(`PASS ${viewport.width}×${viewport.height}: native max stream, special on/off, plain/JSON/non-JSON text accepted, JSON/SSE empty fallback, no fake format error, reload`);
  }
} finally { await browser?.close(); server?.kill(); }
