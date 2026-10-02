import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHAT_TEST_BROWSER ? { executablePath: process.env.CHAT_TEST_BROWSER } : {}) });
const origin = process.env.CHAT_TEST_URL || 'http://127.0.0.1:3000';
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('fritia_chat_onboarding_dismissed','1'); window.savedRecoveries = [];
      window.showSaveFilePicker = async options => {
        const entry = { filename: options.suggestedName, active: navigator.userActivation.isActive }; savedRecoveries.push(entry);
        return { createWritable: async () => ({ write: async blob => { entry.size = blob.size; }, close: async () => {}, abort: async () => {} }) };
      };
    });
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin); await page.waitForFunction(() => document.querySelector('.conversation-item'));
    const url = await page.evaluate(() => {
      window.openedLinks = [];
      window.__TAURI_INTERNALS__ = { invoke: async (command, args) => openedLinks.push({ command, ...args }) };
      const link = document.createElement('a'); link.id = 'external-link-test'; link.href = 'https://example.test/help?a=1&b=2#part'; link.target = '_blank'; link.innerHTML = '<span>Open external</span>'; document.body.appendChild(link);
      link.querySelector('span').click(); return link.href;
    });
    assert.deepEqual(await page.evaluate(() => openedLinks), [{ command:'open_external_url', url }]);
    assert.equal(page.url(), origin + '/');
    await page.evaluate(() => { delete window.__TAURI_INTERNALS__; document.getElementById('external-link-test').remove(); document.dispatchEvent(new CustomEvent('fritia-ui-open-panel',{detail:{id:'archive-panel'}})); });
    assert.equal(await page.isDisabled('#archive-recovery-local'), true);
    assert.equal(await page.isDisabled('#archive-recovery-remote'), true);
    await page.evaluate(async () => {
      const { saveRecovery } = await import('/src/js/archive_state.js');
      await saveRecovery({ local: { version:1,localStorage:{fritia_fixture:'keep-local'},indexedDb:{} } }, '仅本地');
    });
    await page.click('#archive-recovery-refresh');
    await page.waitForFunction(() => !document.getElementById('archive-recovery-local').disabled);
    assert.equal(await page.isDisabled('#archive-recovery-remote'), true);
    for (const id of ['archive-recovery-refresh','archive-recovery-local','archive-recovery-remote']) {
      const geometry = await page.locator('#'+id).evaluate(button => {
        const image=button.querySelector('img').getBoundingClientRect();
        const text=[...button.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim());
        const range=document.createRange(); range.selectNodeContents(text); const bounds=range.getBoundingClientRect();
        return { sameRow:Math.abs(image.top+image.height/2-bounds.top-bounds.height/2)<5, lines:range.getClientRects().length };
      });
      assert.ok(geometry.sameRow, id); assert.equal(geometry.lines,1,id);
    }
    await page.click('#archive-recovery-local');
    await page.waitForFunction(() => savedRecoveries[0]?.size>0);
    assert.ok((await page.evaluate(() => savedRecoveries[0])).active,'File picker must retain user activation');
    await page.evaluate(async () => {
      const { saveRecovery } = await import('/src/js/archive_state.js');
      await saveRecovery({ remote: {version:1,localStorage:{fritia_fixture:'keep-remote'},indexedDb:{}} },'仅云端');
    });
    await page.click('#archive-recovery-refresh');
    await page.waitForFunction(() => document.getElementById('archive-recovery-list').options.length === 2);
    await page.selectOption('#archive-recovery-list',{index:0});
    await page.waitForFunction(() => !document.getElementById('archive-recovery-remote').disabled);
    assert.equal(await page.isDisabled('#archive-recovery-local'),true);
    await page.click('#archive-recovery-remote');
    await page.waitForFunction(() => savedRecoveries[1]?.size>0);
    assert.equal(await page.evaluate(async () => (await import('/src/js/archive_sync.js')).exportArchiveRecovery('missing','local').then(r=>r.unavailable)),true);
    assert.equal(await page.evaluate(() => savedRecoveries.length),2);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${viewport.width}: external hyperlink dispatch, one-line recovery controls, missing-side disabled, both save paths`);
    await context.close();
  }
} finally { await browser.close(); }
