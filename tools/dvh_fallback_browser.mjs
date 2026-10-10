// Isolated browser contexts; never reads the user's browser profile or data.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.CHAT_TEST_URL || 'http://127.0.0.1:3038';
const browser = await chromium.launch({ headless: true, ...(process.env.CHAT_TEST_BROWSER ? { executablePath: process.env.CHAT_TEST_BROWSER } : {}) });

function detachFallbackRules() {
  const removed = [];
  for (const sheet of document.styleSheets) {
    if (!/chat-scroll-(desktop|mobile)\.css$/.test(sheet.href || '')) continue;
    for (let index = sheet.cssRules.length - 1; index >= 0; index--) {
      const rule = sheet.cssRules[index];
      if (rule.type === CSSRule.SUPPORTS_RULE && /height:.*dvh/i.test(rule.conditionText)) {
        removed.push({ sheet, index, css: rule.cssText }); sheet.deleteRule(index);
      }
    }
  }
  return removed;
}

function restoreFallbackRules(removed) {
  [...removed].reverse().forEach(({ sheet, index, css }) => sheet.insertRule(css, index));
}

function appStyleSnapshot() {
  return [...document.querySelectorAll('#app, #app *')].map(node => {
    const style = getComputedStyle(node), rect = node.getBoundingClientRect();
    return { css: [...style].map(name => [name, style.getPropertyValue(name)]),
      rect: [rect.x, rect.y, rect.width, rect.height] };
  });
}

function layout() {
  const pane = document.querySelector('.chat-pane'), composer = document.querySelector('.composer');
  const input = document.getElementById('message-input').getBoundingClientRect();
  const list = document.querySelector('.list-scroll');
  const rect = composer.getBoundingClientRect();
  return { paneHeight: pane.getBoundingClientRect().height, top: rect.top, bottom: rect.bottom,
    height: rect.height, inputHeight: input.height, display: getComputedStyle(composer).display,
    viewportHeight: innerHeight, listScrolls: list.scrollHeight > list.clientHeight };
}

const helperSource = [detachFallbackRules, restoreFallbackRules, appStyleSnapshot, layout].map(fn => fn.toString()).join('\n');
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));

async function openFixture(viewport, legacy = false, withoutVisualViewport = false) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(withoutViewport => {
    localStorage.setItem('fritia_chat_onboarding_dismissed', '1');
    if (withoutViewport) Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
  }, withoutVisualViewport);
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (!url.startsWith(origin)) return route.abort();
    if (legacy && new URL(url).pathname.endsWith('.css')) {
      const response = await route.fetch();
      // Emulate a parser without dvh: dvh declarations become invalid, and the
      // same negative @supports guard becomes true. JS and other CSS stay intact.
      return route.fulfill({ response, body: (await response.text()).replace(/(-?\d*\.?\d+)dvh\b/g, '$1unsupportedDvh') });
    }
    return route.continue();
  });
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('.conversation-item'));
  const fixture = await page.evaluate(async () => {
    const storage = await import('/src/js/storage.js'), app = storage.loadAppStore();
    const members = app.characters.slice(0, 3).map(item => item.id);
    const privateId = app.conversations.find(item => item.type === 'private').id;
    for (let index = 0; index < 40; index++) {
      const id = `group:dvh-fixture-${index}`;
      app.conversations.push(storage.normalizeConversation({ id, type: 'group', title: `高度回退测试 ${index}`, memberIds: members }));
      app.messages[id] = [];
    }
    const groupId = app.conversations.at(-1).id;
    app.activeConversationId = groupId; storage.saveAppStore(app);
    document.getElementById('app').classList.add('is-chat-open');
    return { groupId, privateId };
  });
  await page.addScriptTag({ content: helperSource });
  await settle(page);
  return { context, page, errors, fixture };
}

try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 760, height: 700 },
    { width: 761, height: 700 }, { width: 844, height: 390 }, { width: 1440, height: 900 }, { width: 3840, height: 2160 }]) {
    const { context, page, errors } = await openFixture(viewport);
    const result = await page.evaluate(() => {
      const supported = CSS.supports('height', '100dvh'), before = appStyleSnapshot();
      const removed = detachFallbackRules(), after = appStyleSnapshot();
      const same = JSON.stringify(before) === JSON.stringify(after);
      restoreFallbackRules(removed);
      return { supported, same, rules: removed.length, nodes: before.length, geometry: layout() };
    });
    assert.equal(result.supported, true); assert.equal(result.rules, 2);
    assert.equal(result.same, true, `supported UI changed: ${JSON.stringify({ viewport, result })}`);
    assert.ok(result.geometry.bottom <= viewport.height + 1);
    assert.deepEqual(errors, []);
    console.log(`PASS supported ${viewport.width}×${viewport.height}: all ${result.nodes} APP element styles/rectangles unchanged`);
    await context.close();
  }

  for (const [viewport, withoutViewport] of [[{ width: 320, height: 568 }, false], [{ width: 390, height: 844 }, false],
    [{ width: 390, height: 844 }, true], [{ width: 844, height: 390 }, false]]) {
    const { context, page, errors, fixture } = await openFixture(viewport, true, withoutViewport);
    const good = await page.evaluate(() => layout());
    assert.ok(good.top >= 0 && good.bottom <= viewport.height + 1, JSON.stringify(good));
    assert.ok(good.inputHeight >= 42 && good.listScrolls);
    await page.evaluate(() => { window.detachedDvhFallback = detachFallbackRules(); }); await settle(page);
    const broken = await page.evaluate(() => layout());
    assert.ok(broken.top >= viewport.height, `must reproduce the unsupported-unit bug: ${JSON.stringify(broken)}`);
    await page.evaluate(() => restoreFallbackRules(window.detachedDvhFallback)); await settle(page);
    const recovered = await page.evaluate(() => layout());
    assert.ok(recovered.top >= 0 && recovered.bottom <= viewport.height + 1, JSON.stringify(recovered));
    await page.evaluate(async id => { const storage = await import('/src/js/storage.js'); storage.saveAppStore({ ...storage.loadAppStore(), activeConversationId: id }); }, fixture.privateId);
    await settle(page);
    const privateChat = await page.evaluate(() => layout());
    assert.ok(privateChat.top >= 0 && privateChat.bottom <= viewport.height + 1);
    await page.setViewportSize({ ...viewport, height: Math.max(380, viewport.height - 200) }); await settle(page);
    const resized = await page.evaluate(() => layout());
    assert.ok(resized.top >= 0 && resized.bottom <= resized.viewportHeight + 1);
    assert.deepEqual(errors, []);
    console.log(`PASS legacy ${viewport.width}×${viewport.height}${withoutViewport ? ' without VisualViewport' : ''}: reproduced offscreen composer, fallback restores private/group chat, long-list scrolling and resize`);
    await context.close();
  }
} finally { await browser.close(); }
