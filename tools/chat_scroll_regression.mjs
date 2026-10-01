// Run against npm run dev, with Playwright available locally. Uses an isolated
// browser context and synthetic messages; never reads the user's browser data.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHAT_TEST_BROWSER ? { executablePath: process.env.CHAT_TEST_BROWSER } : {}) });
const baseUrl = process.env.CHAT_TEST_URL || 'http://127.0.0.1:3000';
try {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }, { width: 3840, height: 2160 }, { width: 1280, height: 720 }, { width: 844, height: 390 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', hasTouch: viewport.width < 760 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('fritia_chat_onboarding_dismissed', '1'));
    await page.route('**/*', route => route.request().url().startsWith(baseUrl) ? route.continue() : route.abort());
    await page.goto(baseUrl);
    await page.waitForFunction(() => document.querySelector('.conversation-item'));
    const imageData = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 6000;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#dad8ff'; ctx.fillRect(0, 0, 320, 6000);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    let releaseImage;
    const imageReady = new Promise(resolve => { releaseImage = resolve; });
    await page.route('**/regression-long.png', async route => {
      await imageReady;
      await route.fulfill({ contentType: 'image/png', body: Buffer.from(imageData, 'base64') });
    });
    await page.evaluate(async () => {
      const storage = await import('/src/js/storage.js');
      const store = storage.loadAppStore();
      const character = store.characters[0];
      const conversation = store.conversations.find(item => item.memberIds.includes(character.id));
      store.activeConversationId = conversation.id;
      store.messages[conversation.id] = Array.from({ length: 25 }, (_, index) => ({
        id: `old-${index}`, role: index % 2 ? 'user' : 'assistant', speakerId: character.id,
        speakerName: character.name, text: `历史 ${index}：用于验证阅读位置与长图加载。`, createdAt: Date.now(), status: 'sent'
      }));
      store.messages[conversation.id].push({ id: 'long-image', role: 'user', speakerId: 'player', speakerName: '分析员', text: '', status: 'sent', createdAt: Date.now(), attachments: [{ id: 'image', type: 'image', url: '/regression-long.png', name: 'long.png' }] });
      storage.saveAppStore(store);
      document.querySelector('.app-shell').classList.add('is-chat-open');
      window.regressionImage = document.querySelector('.message-image');
    });
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
    const checkBottom = async label => {
      await settle();
      const dimensions = await page.evaluate(() => {
        const container = document.getElementById('message-list');
        const row = container.lastElementChild;
        return {
          gap: document.querySelector('.composer').getBoundingClientRect().top - row.getBoundingClientRect().bottom,
          targetGap: parseFloat(getComputedStyle(container).getPropertyValue('--chat-composer-gap')),
          bottomDistance: container.scrollHeight - container.clientHeight - container.scrollTop,
          sameImage: window.regressionImage === document.querySelector('.message-image')
        };
      });
      assert.ok(dimensions.gap >= dimensions.targetGap - 1, `${viewport.width} ${label}: ${JSON.stringify(dimensions)}`);
      assert.ok(dimensions.bottomDistance <= 1, `${label}: not at bottom`);
      assert.equal(dimensions.sameImage, true, `${label}: historical image remounted`);
    };
    await checkBottom('image pending');
    releaseImage();
    await page.waitForFunction(() => document.querySelector('.message-image')?.naturalHeight === 6000);
    await checkBottom('long image loaded');
    const updateReply = async (status, text, trace = false) => page.evaluate(async ({ status, text, trace }) => {
      const { loadAppStore, saveAppStore } = await import('/src/js/storage.js');
      const store = loadAppStore();
      const messages = store.messages[store.activeConversationId];
      const reply = { id: 'reply', role: 'assistant', speakerId: store.characters[0].id, speakerName: '测试', status, text, createdAt: Date.now(), meta: trace ? { toolMode: true, toolTrace: { thoughts: [{ content: '正在思考并调用 MCP', status: 'running' }], calls: [] } } : {} };
      const index = messages.findIndex(item => item.id === 'reply');
      if (index >= 0) messages[index] = reply; else messages.push(reply);
      saveAppStore(store);
    }, { status, text, trace });
    await updateReply('typing', '', true);
    await checkBottom('MCP thinking');
    await page.evaluate(() => {
      document.getElementById('message-input').style.height = '128px';
      const preview = document.getElementById('attachment-preview');
      preview.classList.remove('hidden'); preview.style.height = '80px';
    });
    await checkBottom('composer grows');
    await updateReply('sent', '超长回复内容\n'.repeat(500));
    await checkBottom('oversized reply');
    await page.evaluate(() => {
      const container = document.getElementById('message-list');
      container.scrollTop -= 450;
    });
    await settle();
    const before = await page.locator('#message-list').evaluate(node => node.scrollTop);
    await updateReply('sent', '超长回复内容\n'.repeat(520));
    await settle();
    const after = await page.locator('#message-list').evaluate(node => node.scrollTop);
    assert.ok(Math.abs(after - before) < 2, `${viewport.width}: reading position jumped ${after - before}`);
    await page.evaluate(() => { const node = document.getElementById('message-list'); node.scrollTop = node.scrollHeight; });
    await settle();
    await page.setViewportSize({ width: viewport.width, height: Math.max(380, viewport.height - 200) });
    await checkBottom('viewport/keyboard resize');
    if (viewport.width < 760) {
      await page.evaluate(() => {
        const viewport = window.visualViewport;
        Object.defineProperty(viewport, 'height', { configurable: true, value: 330 });
        viewport.dispatchEvent(new Event('resize'));
      });
      await checkBottom('visual viewport keyboard');
      assert.ok(await page.locator('.composer').evaluate(node => node.getBoundingClientRect().bottom <= 331), 'keyboard covers composer');
      await page.evaluate(() => { delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event('resize')); });
      await checkBottom('keyboard closed');
    } else {
      const cdp = await context.newCDPSession(page);
      for (const zoom of [1.25, 1.5]) {
        await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: zoom });
        await checkBottom(`page scale ${zoom}`);
      }
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    }
    if (process.env.CHAT_TEST_SCREENSHOT_DIR && [1920, 390].includes(viewport.width)) {
      await updateReply('sent', '布局回归验证：长图历史下的新回复与输入栏保持间距。');
      await checkBottom('screenshot');
      await page.screenshot({ path: `${process.env.CHAT_TEST_SCREENSHOT_DIR}/heim-chat-${viewport.width}.png` });
    }
    assert.deepEqual(errors, []);
    if (viewport.width === 1920) {
      let catalogRequests = 0;
      await page.route('https://api.deepseek.com/models', route => {
        catalogRequests++;
        return route.fulfill({ json: { data: [{ id: 'future-deepseek', effort: { supported_levels: ['low', 'max'] } }] } });
      });
      await page.evaluate(async () => {
        const { saveSettings } = await import('/src/js/settings.js');
        saveSettings({ chatProviders: [{ id: 'metadata-test', baseUrl: 'https://api.deepseek.com', apiKey: 'test-only', model: 'future-deepseek' }], defaultChatProviderId: 'metadata-test' });
      });
      await page.click('#chat-model-control-btn');
      await page.waitForFunction(() => document.querySelectorAll('#chat-reasoning-options button').length === 3);
      assert.deepEqual(await page.locator('#chat-reasoning-options button > span:first-child').allTextContents(), ['普通', '轻度', '极限']);
      await page.locator('#chat-reasoning-options button').last().click();
      assert.equal(await page.locator('#chat-reasoning-progress').getAttribute('aria-valuetext'), '极限');
      assert.equal(catalogRequests, 1);
      assert.deepEqual(errors, []);
    }
    console.log(`PASS ${viewport.width}x${viewport.height}: delayed long image, MCP, composer resize, oversized reply, reader anchor, viewport resize`);
    await context.close();
  }
} finally {
  await browser.close();
}
