import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHAT_TEST_BROWSER ? { executablePath: process.env.CHAT_TEST_BROWSER } : {}) });
const origin = process.env.CHAT_TEST_URL || 'http://127.0.0.1:3022';
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('fritia_chat_onboarding_dismissed', '1'));
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin); await page.waitForFunction(() => document.querySelector('.conversation-item'));
    await page.evaluate(async () => {
      const state = await import('/src/js/archive_state.js'); window.recoveryState = state;
      const snapshot = { version: 1, localStorage: { fritia_fixture: 'precious' }, indexedDb: {} };
      window.keepId = await state.saveRecovery({ local: snapshot }, '保留');
      window.deleteId = await state.saveRecovery({ local: snapshot, remote: snapshot }, '只删除这一条');
      await state.archiveState('test/baseline', { keep: true });
      window.liveBefore = localStorage.getItem('fritia_next_chat_store');
      document.dispatchEvent(new CustomEvent('fritia-ui-open-panel', { detail: { id: 'archive-panel' } }));
    });
    await page.waitForFunction(() => document.querySelector('#archive-recovery-list').options.length === 2);
    const menu = '#archive-recovery-list + .custom-select';
    await page.click(`${menu} .custom-select-trigger`);
    const rowHeights = await page.locator(`${menu} .archive-recovery-option`).evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
    assert.deepEqual(rowHeights, [32, 32]);
    await page.locator(`${menu} .archive-recovery-delete`).first().click();
    assert.ok(await page.locator('#archive-recovery-delete-description').textContent().then(x => x.includes('只删除这一条')));
    await page.click('#archive-recovery-delete-cancel');
    assert.equal(await page.evaluate(async () => (await recoveryState.archiveState('recoveries')).length), 2);
    await page.click(`${menu} .custom-select-trigger`);
    await page.locator(`${menu} .archive-recovery-delete`).first().click();
    // Changing the selected value after opening the dialog cannot redirect deletion.
    await page.evaluate(() => { document.querySelector('#archive-recovery-list').value = keepId; });
    await page.click('#archive-recovery-delete-confirm');
    await page.waitForFunction(() => !document.querySelector('#archive-recovery-delete-dialog').open);
    assert.deepEqual(await page.evaluate(async () => ({ deleted: await recoveryState.archiveState(deleteId) === undefined,
      kept: !!await recoveryState.archiveState(keepId), baseline: await recoveryState.archiveState('test/baseline'),
      live: localStorage.getItem('fritia_next_chat_store') === liveBefore })), { deleted: true, kept: true, baseline: {keep:true}, live: true });
    await page.evaluate(async () => {
      const { archiveState, saveRecovery, deleteRecovery } = recoveryState;
      for (const invalid of ['recoveries','device','test/baseline','recovery-123-bad']) {
        let rejected = false; try { await deleteRecovery(invalid); } catch { rejected = true; }
        if (!rejected) throw Error('Unsafe deletion accepted: ' + invalid);
      }
      const snapshot = { localStorage: { fritia_test: 'retain' }, indexedDb: {} };
      const failedId = await saveRecovery({ local: snapshot }, 'rollback');
      const originalDelete = IDBObjectStore.prototype.delete;
      IDBObjectStore.prototype.delete = function(key) {
        const result = originalDelete.call(this, key);
        if (key === failedId) this.transaction.abort();
        return result;
      };
      let failed = false;
      try { await deleteRecovery(failedId); } catch { failed = true; }
      finally { IDBObjectStore.prototype.delete = originalDelete; }
      if (!failed || !await archiveState(failedId) || !(await archiveState('recoveries')).some(x=>x.id===failedId)) throw Error('Rollback failed');
      const [,newId] = await Promise.all([deleteRecovery(failedId), saveRecovery({ local:snapshot }, 'concurrent')]);
      if (!await archiveState(newId) || !(await archiveState('recoveries')).some(x=>x.id===newId)) throw Error('Concurrent save lost');
      const corruptId = await saveRecovery({local:snapshot}, 'mismatch');
      const corrupt = await archiveState(corruptId); corrupt.id = keepId; await archiveState(corruptId,corrupt);
      let refused = false; try { await deleteRecovery(corruptId); } catch { refused = true; }
      if (!refused || !await archiveState(corruptId)) throw Error('Mismatched identity removed');
    });
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('fritia-archive-sync-status', { detail: {
      phase: 'working', label: '正在上传增量文件', progress: 0.6,
      detail: { current: 'pack-' + 'a'.repeat(64) + '.gz', completed: 3, total: 12 }
    } })));
    const geometry = await page.locator('.archive-progress-line').first().evaluate(line => {
      const label = line.querySelector('span').getBoundingClientRect();
      const count = line.querySelector('small > span:last-child').getBoundingClientRect();
      const rect = line.getBoundingClientRect();
      return { sameLine: Math.abs(label.top-count.top)<8, inBounds:count.right<=rect.right+1, count:line.querySelector('small > span:last-child').textContent };
    });
    assert.deepEqual(geometry, { sameLine:true, inBounds:true, count:' (3 / 12)' });
    console.log(`PASS ${viewport.width}: targeted deletion, cancel, rollback, concurrent save, invalid identity, compact rows, visible progress counts`);
    await page.evaluate(() => {
      document.getElementById('archive-panel').classList.add('hidden');
      window.loginChecks=0; window.openedLogin=0; window.detailRequests=0; window.connected=false; window.loginFails=false;
      window.__TAURI_INTERNALS__ = { invoke: async (command,args) => {
        if(command==='open_modelscope_window') { openedLogin++; return {}; }
        if(command==='close_modelscope_window') return {};
        if(command!=='modelscope_fetch') return {};
        const url=args.request.url;
        let payload;
        if(url.endsWith('/users/login/info')) {
          loginChecks++;
          if(loginFails) throw Error('simulated network failure');
          payload={Success:true,Data:connected?{Id:'fixture-user'}:{}};
        } else if(url.includes('/dolphin/mcpServers')) payload={Success:true,Data:{McpServer:{McpServers:[{Name:'test',Path:'fixture',ChineseName:'测试 MCP'}],TotalCount:1}}};
        else { detailRequests++; payload={Success:true,Data:{Name:'test',Path:'fixture'}}; }
        return {status:200,bodyBase64:btoa(unescape(encodeURIComponent(JSON.stringify(payload))))};
      }};
      document.dispatchEvent(new CustomEvent('fritia-ui-open-panel',{detail:{id:'plugin-store-panel'}}));
      document.querySelector('[data-plugin-store-section="mcp"]').click();
    });
    await page.waitForSelector('[data-plugin-install-id]');
    await page.waitForFunction(() => !document.querySelector('#plugin-store-status').textContent.includes('正在检测'));
    const before=await page.evaluate(()=>loginChecks);
    await page.click('[data-plugin-install-id]');
    await page.waitForFunction(()=>openedLogin===1);
    assert.deepEqual(await page.evaluate(()=>[loginChecks,detailRequests]),[before+1,0]);
    await page.evaluate(()=>{ connected=true; });
    await page.waitForFunction(()=>detailRequests===1);
    assert.equal(await page.locator('#plugin-detail-panel').evaluate(x=>x.classList.contains('hidden')),false);
    await page.evaluate(()=>{ document.getElementById('plugin-detail-panel').classList.add('hidden'); });
    const signedBefore=await page.evaluate(()=>loginChecks);
    await page.click('[data-plugin-install-id]');
    await page.waitForFunction(()=>detailRequests===2);
    assert.deepEqual(await page.evaluate(()=>[loginChecks,openedLogin]),[signedBefore+1,1]);
    await page.evaluate(()=>{ document.getElementById('plugin-detail-panel').classList.add('hidden'); loginFails=true; });
    await page.click('[data-plugin-install-id]');
    await page.waitForFunction(()=>document.getElementById('plugin-store-status').textContent.includes('simulated network failure'));
    assert.equal(await page.evaluate(()=>detailRequests),2);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${viewport.width}: fresh login per install, logged-out login window, post-login resume, signed-in detail, network failure stops`);
    await context.close();
  }
} finally { await browser.close(); }
