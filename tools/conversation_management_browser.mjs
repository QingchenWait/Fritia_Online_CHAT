import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHAT_TEST_BROWSER ? { executablePath: process.env.CHAT_TEST_BROWSER } : {}) });
const origin = process.env.CHAT_TEST_URL || 'http://127.0.0.1:3038';
const artifacts = new URL('../.codex/conversation-management/', import.meta.url);
await mkdir(artifacts, { recursive: true });
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' }), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('fritia_chat_onboarding_dismissed', '1'));
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin);
    await page.waitForFunction(() => document.querySelector('.conversation-item'));
    const fixture = await page.evaluate(async () => {
      const storage = await import('/src/js/storage.js'), media = await import('/src/js/media_store.js');
      const canvas = document.createElement('canvas'); canvas.width = 60; canvas.height = 40;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ef7744'; ctx.fillRect(0, 0, 60, 40);
      const exclusive = await media.saveDataUrlAsMedia(canvas.toDataURL(), { id: 'management-exclusive' });
      const shared = await media.saveDataUrlAsMedia(canvas.toDataURL(), { id: 'management-shared' });
      const tool = await media.saveDataUrlAsMedia(canvas.toDataURL(), { id: 'management-tool' });
      const voice = await media.saveDataUrlAsMedia('data:audio/wav;base64,UklGRg==', { id: 'management-voice' });
      const app = storage.loadAppStore();
      app.characters.push(storage.normalizeCharacterRecord({ id: 'management-custom', name: '管理测试角色', avatar: 'src/_char/Fritia/Profile_Fritia.png', source: 'custom' }));
      const id = 'private:management-custom';
      app.conversations.unshift(storage.normalizeConversation({ id, title: '管理测试角色', memberIds: ['management-custom'] }));
      app.messages[id] = [
        storage.normalizeMessage({ id: 'delete-image', role: 'user', speakerName: '分析员', text: '**分享测试**\n\n- 完整 Markdown\n- 图片保留原样', attachments: [{ type: 'image', name: '图片.png', dataRef: exclusive.ref }] }),
        storage.normalizeMessage({ id: 'delete-tool', role: 'assistant', speakerId: 'management-custom', speakerName: '管理测试角色', text: '工具回复', meta: { toolMode: true, toolOtherAttachments: [{ type: 'file', dataRef: tool.ref, name: '工具.txt' }], toolTrace: { thoughts: [{ title: '思考中', status: 'success', content: '思考记录' }], calls: [{ toolName: '测试工具', status: 'success', result: '工具结果', attachments: [{ dataRef: tool.ref }] }] } } }),
        storage.normalizeMessage({ id: 'delete-voice', role: 'assistant', speakerId: 'management-custom', speakerName: '管理测试角色', text: '语音正文', attachments: [{ type: 'audio', dataRef: voice.ref, duration: 4 }], meta: { voiceReply: true } }),
        storage.normalizeMessage({ id: 'keep-message', role: 'assistant', speakerId: 'management-custom', text: 'KEEP_UNSELECTED', attachments: [{ type: 'image', dataRef: shared.ref }] }),
        storage.normalizeMessage({ id: 'short-message', role: 'user', speakerName: '分析员', text: '短消息' }),
        ...Array.from({ length: 24 }, (_, index) => storage.normalizeMessage({ id: `long-${index}`, role: index % 2 ? 'assistant' : 'user', speakerId: 'management-custom', speakerName: index % 2 ? '管理测试角色' : '分析员', text: `长图 ${index}\n\n${'应保留所有选中消息及中文换行。'.repeat(5)}\n\n\`\`\`js\nconst value = ${index};\n\`\`\`` }))
      ];
      const originalOther = JSON.stringify(app.messages[app.conversations[1].id]);
      app.activeConversationId = id; storage.saveAppStore(app);
      const memory = (await import('/src/js/long_term_memory.js')).getLongTermMemoryStore();
      memory.memories = [
        { id: 'memory-exclusive', scope: 'private:management-custom', characterId: 'management-custom', source: 'private', text: '独占记忆', sourceMessageIds: ['delete-image'] },
        { id: 'memory-shared', scope: 'private:management-custom', characterId: 'management-custom', source: 'private', text: '共享记忆', sourceMessageIds: ['delete-image', 'keep-message'] }
      ];
      memory.edges = [{ id: 'edge-exclusive', head: '分析员', relation: '喜欢', tail: '测试', sourceMemoryIds: ['memory-exclusive'] }];
      localStorage.setItem('fritia_long_term_memory', JSON.stringify(memory));
      localStorage.setItem('management-protected', JSON.stringify({ ref: shared.ref }));
      return { id, originalOther, exclusive: exclusive.ref, shared: shared.ref, tool: tool.ref, voice: voice.ref };
    });
    await page.locator('.conversation-item').filter({ hasText: '管理测试角色' }).first().click();
    await page.evaluate(async () => {
      await import('/src/vendor/html-to-image/html-to-image.js');
      const original = htmlToImage.toCanvas;
      htmlToImage.toCanvas = async (node, options) => {
        const bounds = node.getBoundingClientRect();
        const title = node.querySelector('.chat-head__titles h1');
        const range = document.createRange(); range.selectNodeContents(title);
        const text = range.getBoundingClientRect();
        const avatar = node.querySelector('.is-self .message-avatar')?.getBoundingClientRect();
        window.__lastShareLayout = { title: { left: text.left - bounds.left, top: text.top - bounds.top, right: text.right - bounds.left, bottom: text.bottom - bounds.top },
          rightGutter: avatar ? bounds.right - avatar.right : null };
        return original(node, options);
      };
    });
    async function enter() {
      await page.click('#chat-info-btn'); await page.click('#detail-conversation-management');
      assert.ok(await page.locator('#app').evaluate(node => node.classList.contains('is-conversation-management')));
      assert.equal(await page.locator('.composer').isVisible(), false);
      assert.equal(await page.locator('#conversation-management-delete').isEnabled(), false);
    }
    await enter();
    assert.equal(await page.locator('#app').evaluate(node => node.classList.contains('is-detail-open')), false);
    for (const id of ['delete-image', 'delete-tool', 'delete-voice']) {
      const row = page.locator(`[data-message-id="${id}"]`);
      await row.scrollIntoViewIfNeeded(); await row.locator('.message-content').click();
      assert.equal(await row.getAttribute('aria-checked'), 'true');
    }
    if (viewport.width === 1440) {
      for (const size of [{ width: 320, height: 568 }, { width: 760, height: 360 }, { width: 1024, height: 280 }, { width: 1280, height: 720 }, { width: 1536, height: 864 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }, { width: 3840, height: 2160 }]) {
        await page.setViewportSize(size);
        const geometry = await page.evaluate(() => {
          const hint = document.getElementById('conversation-management-hint').getBoundingClientRect(), pane = document.querySelector('.chat-pane').getBoundingClientRect();
          const controls = document.getElementById('conversation-management-actions').getBoundingClientRect();
          return { hintBottom: hint.bottom, paneBottom: pane.bottom, controlsRight: controls.right, width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert.ok(Math.abs(geometry.hintBottom - geometry.paneBottom) < 2, JSON.stringify({ size, geometry }));
        assert.ok(geometry.controlsRight <= geometry.width); assert.equal(geometry.overflow, false);
      }
      await page.setViewportSize(viewport);
    }
    await page.screenshot({ path: new URL(`selection-${viewport.width}.png`, artifacts).pathname.replace(/^\/([A-Z]:)/, '$1'), fullPage: true });
    await page.click('#conversation-management-delete');
    for (const size of (viewport.width === 1440 ? [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1024, height: 280 }] : [viewport])) {
      await page.setViewportSize(size);
      const confirmation = await page.locator('#conversation-delete-panel').evaluate(panel => {
        const shell = panel.querySelector('.conversation-delete-shell').getBoundingClientRect();
        const footer = panel.querySelector('.conversation-delete-actions').getBoundingClientRect();
        const title = panel.querySelector('#conversation-delete-title');
        return { title: title.textContent, weight: Number(getComputedStyle(title).fontWeight), top: shell.top, bottom: shell.bottom, height: shell.height,
          footerGap: shell.bottom - footer.bottom, buttons: [...panel.querySelectorAll('.conversation-delete-actions button')].map(button => {
            const icon = button.querySelector('img').getBoundingClientRect(), label = button.querySelector('span').getBoundingClientRect();
            return { centerDifference: Math.abs(icon.top + icon.height / 2 - label.top - label.height / 2), iconRight: icon.right, labelLeft: label.left };
          }) };
      });
      assert.equal(confirmation.title, '对话删除确认'); assert.ok(confirmation.weight >= 600);
      assert.ok(confirmation.top >= 15 && confirmation.bottom <= size.height - 15, JSON.stringify({ size, confirmation }));
      assert.ok(confirmation.footerGap <= 2, 'no stretched blank area below actions');
      if (size.height >= 568) assert.ok(confirmation.height < size.height * .8, JSON.stringify({ size, confirmation }));
      assert.ok(confirmation.buttons.every(button => button.centerDifference < 2 && button.iconRight <= button.labelLeft));
      if (size.width === viewport.width) await page.screenshot({ animations: 'disabled', path: new URL(`delete-confirm-${viewport.width}.png`, artifacts).pathname.replace(/^\/([A-Z]:)/, '$1') });
    }
    await page.setViewportSize(viewport);
    await page.click('#conversation-delete-cancel');
    assert.equal(await page.locator('#message-list [aria-checked="true"]').count(), 3);
    await page.click('#conversation-management-share');
    await page.waitForFunction(() => !document.getElementById('conversation-share-copy').disabled || document.getElementById('conversation-share-status').textContent.includes('失败'), null, { timeout: 120000 });
    assert.ok(await page.locator('#conversation-share-copy').isEnabled(), await page.locator('#conversation-share-status').textContent());
    const short = await page.evaluate(async () => {
      const img = document.getElementById('conversation-share-image'); await img.decode();
      const blob = await (await fetch(img.src)).blob();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0); const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let orange = 0; for (let index = 0; index < pixels.length; index += 4) if (pixels[index] === 239 && pixels[index + 1] === 119 && pixels[index + 2] === 68) orange++;
      const layout = window.__lastShareLayout, expected = layout.title;
      let minY = Infinity, maxY = 0;
      for (let y = 0; y < 98; y++) for (let x = Math.floor(expected.left * 1.5); x < Math.ceil(expected.right * 1.5); x++) {
        const offset = (y * canvas.width + x) * 4;
        if (pixels[offset] < 80 && pixels[offset + 1] < 80 && pixels[offset + 2] < 80) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      }
      return { width: img.naturalWidth, height: img.naturalHeight, bytes: [...bytes], orange, layout, textInk: { minY, maxY } };
    });
    assert.equal(short.width, 768); assert.ok(short.height >= 432);
    await writeFile(new URL(`share-${viewport.width}.png`, artifacts), new Uint8Array(short.bytes));
    assert.ok(short.orange > 200, `the original image must be present in the PNG (${short.orange})`);
    assert.ok(short.layout.rightGutter <= 21, 'user avatar must end at the symmetric right gutter');
    assert.ok(short.textInk.minY >= short.layout.title.top * 1.5 - 2 && short.textInk.maxY <= short.layout.title.bottom * 1.5 + 2,
      `text pixels must preserve browser baseline: ${JSON.stringify({ layout: short.layout, ink: short.textInk })}`);
    assert.equal(await page.locator('.composer').isVisible(), true);
    await page.evaluate(() => {
      window.__savedImage = null; window.__copiedImage = null;
      window.showSaveFilePicker = async ({ suggestedName: filename }) => ({ createWritable: async () => ({ write: async blob => { window.__savedImage = { filename, size: blob.size, mime: blob.type }; }, close: async () => {} }) });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async items => { window.__copiedImage = (await items[0].getType('image/png')).size; } } });
    });
    await page.click('#conversation-share-copy'); await page.waitForFunction(() => window.__copiedImage > 0);
    await page.click('#conversation-share-save'); await page.waitForFunction(() => window.__savedImage?.mime === 'image/png');
    await page.click('#conversation-share-close');
    if (viewport.width === 1440) {
      await page.setViewportSize({ width: 1024, height: 280 });
      await enter(); await page.evaluate(() => document.querySelector('[data-message-id="delete-image"]').click());
      await page.click('#conversation-management-delete');
      assert.equal(await page.locator('#conversation-delete-confirm').isVisible(), true);
      const bodyScroll = await page.locator('.conversation-delete-body').evaluate(node => node.scrollHeight > node.clientHeight);
      assert.equal(bodyScroll, true);
      await page.click('#conversation-delete-cancel'); await page.click('#conversation-management-close');
      await page.setViewportSize(viewport);
    }
    await enter();
    await page.locator('[data-message-id="short-message"]').scrollIntoViewIfNeeded();
    await page.locator('[data-message-id="short-message"]').press('Space');
    await page.click('#conversation-management-share');
    await page.waitForFunction(() => !document.getElementById('conversation-share-copy').disabled || document.getElementById('conversation-share-status').textContent.includes('失败'), null, { timeout: 120000 });
    const single = await page.locator('#conversation-share-image').evaluate(async img => { await img.decode(); return [img.naturalWidth, img.naturalHeight]; });
    assert.deepEqual(single, [768, 432]);
    await page.click('#conversation-share-close');
    await enter();
    await page.evaluate(() => document.querySelectorAll('[data-message-id^="long-"]').forEach(row => row.click()));
    await page.click('#conversation-management-share');
    await page.waitForFunction(() => !document.getElementById('conversation-share-copy').disabled || document.getElementById('conversation-share-status').textContent.includes('失败'), null, { timeout: 120000 });
    assert.ok(await page.locator('#conversation-share-copy').isEnabled(), await page.locator('#conversation-share-status').textContent());
    const long = await page.locator('#conversation-share-image').evaluate(async img => {
      await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = 300;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 300 - img.naturalHeight);
      const pixels = ctx.getImageData(0, 0, canvas.width, 300).data;
      let ink = 0; for (let index = 0; index < pixels.length; index += 4) if (pixels[index] < 100 && pixels[index + 1] < 100 && pixels[index + 2] < 100) ink++;
      return { width: img.naturalWidth, height: img.naturalHeight, lastRow: document.querySelectorAll('.conversation-share-stage').length, ink,
        bytes: [...new Uint8Array(await (await (await fetch(img.src)).blob()).arrayBuffer())] };
    });
    assert.equal(long.width, 768); assert.ok(long.height > 4500); assert.equal(long.lastRow, 0);
    assert.ok(long.ink > 100, 'the final selected message must survive tile translation');
    await writeFile(new URL(`long-${viewport.width}.png`, artifacts), new Uint8Array(long.bytes));
    await page.screenshot({ path: new URL(`preview-${viewport.width}.png`, artifacts).pathname.replace(/^\/([A-Z]:)/, '$1') });
    await page.click('#conversation-share-close');
    await enter();
    await page.evaluate(() => ['delete-image', 'delete-tool', 'delete-voice'].forEach(id => document.querySelector(`[data-message-id="${id}"]`).click()));
    await page.click('#conversation-management-delete'); await page.click('#conversation-delete-confirm');
    await page.waitForFunction(() => !document.getElementById('app').classList.contains('is-conversation-management'));
    const deleted = await page.evaluate(async fixture => {
      const app = JSON.parse(localStorage.getItem('fritia_next_chat_store')), memory = JSON.parse(localStorage.getItem('fritia_long_term_memory'));
      const { getMediaDataUrl } = await import('/src/js/media_store.js');
      return { ids: app.messages[fixture.id].map(m => m.id), memoryIds: memory.memories.map(m => m.id), edges: memory.edges.length,
        exclusive: await getMediaDataUrl(fixture.exclusive), tool: await getMediaDataUrl(fixture.tool), voice: await getMediaDataUrl(fixture.voice), shared: !!await getMediaDataUrl(fixture.shared),
        other: JSON.stringify(app.messages[app.conversations[1].id]) };
    }, fixture);
    assert.ok(!deleted.ids.some(id => id.startsWith('delete-')));
    assert.ok(deleted.ids.includes('keep-message'));
    assert.deepEqual(deleted.memoryIds, ['memory-shared'], JSON.stringify(deleted)); assert.equal(deleted.edges, 0);
    assert.equal(deleted.exclusive, ''); assert.equal(deleted.tool, ''); assert.equal(deleted.voice, ''); assert.equal(deleted.shared, true);
    assert.equal(deleted.other, fixture.originalOther);
    await enter(); await page.reload(); await page.waitForFunction(() => document.querySelector('.conversation-item'));
    assert.equal(await page.locator('#app').evaluate(node => node.classList.contains('is-conversation-management')), false);
    await page.locator('.conversation-item').filter({ hasText: '管理测试角色' }).first().click();
    await enter();
    if (viewport.width < 761) { await page.click('.mobile-back'); assert.equal(await page.locator('#app').evaluate(node => node.classList.contains('is-chat-open')), false); }
    else { await page.locator('.conversation-item').filter({ hasText: '芙提雅' }).first().click(); }
    assert.equal(await page.locator('#app').evaluate(node => node.classList.contains('is-conversation-management')), false);
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}: multi-select, cancel, PNG ${short.width}×${short.height}/${long.height}, directory/clipboard, exclusive deletion, shared retention, refresh and navigation`);
    await context.close();
  }
} finally { await browser.close(); }
