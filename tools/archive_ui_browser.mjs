import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless:true, ...(process.env.CHAT_TEST_BROWSER ? { executablePath:process.env.CHAT_TEST_BROWSER } : {}) });
const origin = process.env.CHAT_TEST_URL || 'http://127.0.0.1:3000';
try {
  for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    const context=await browser.newContext({viewport,serviceWorkers:'block'}); const page=await context.newPage(); const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      localStorage.setItem('fritia_chat_onboarding_dismissed','1');
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=> ' pasted-test-key '}});
      window.saveCalls=[];
      window.showSaveFilePicker=async options=>{
        saveCalls.push({options});
        return {createWritable:async()=>({write:async blob=>{saveCalls.at(-1).size=blob.size;saveCalls.at(-1).header=[...new Uint8Array(await blob.slice(0,4).arrayBuffer())];},close:async()=>{},abort:async()=>{}})};
      };
    });
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await page.goto(origin); await page.waitForFunction(()=>document.querySelector('.conversation-item'));
    await page.evaluate(()=>document.dispatchEvent(new CustomEvent('fritia-ui-open-panel',{detail:{id:'settings-panel',settingsSection:'model',modelTab:'chat'}})));
    await page.click('#chat-provider-paste-key'); assert.equal(await page.inputValue('#chat-provider-api-key'),'pasted-test-key');
    const paste=await page.locator('#chat-provider-paste-key').boundingBox(), get=await page.locator('#chat-provider-get-key').boundingBox();
    assert.ok(paste.x<get.x);
    await page.click('#model-chat-save'); assert.equal(await page.locator('#model-settings-notice').textContent(),'模型配置已经保存');
    await page.click('[data-model-tab="tts"]'); await page.click('#model-tts-save'); assert.equal(await page.locator('#model-settings-notice').textContent(),'模型配置已经保存');
    await page.click('[data-panel-close="settings-panel"]');
    await page.evaluate(()=>document.dispatchEvent(new CustomEvent('fritia-ui-open-panel',{detail:{id:'archive-panel'}})));
    await page.click('#archive-export-btn');
    await page.waitForFunction(()=>saveCalls[0]?.header?.length===4);
    assert.deepEqual(await page.evaluate(()=>saveCalls[0].header),[80,75,3,4]);
    assert.equal(await page.evaluate(()=>saveCalls[0].options.suggestedName.endsWith('.zip')),true);
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fritia_archive_sync')).backupCount===1);
    await page.evaluate(()=>{window.showSaveFilePicker=async()=>{throw new DOMException('cancelled','AbortError');};});
    await page.click('#archive-export-btn'); await page.waitForFunction(()=>document.getElementById('archive-progress-label').textContent==='已取消导出');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('fritia_archive_sync')).backupCount),1);
    await page.evaluate(()=>document.dispatchEvent(new CustomEvent('fritia-archive-conflict',{detail:{
      local:{updatedAt:Date.now(),size:500,device:'Android (test-a)'},remote:{updatedAt:Date.now()-10000,size:700,device:'Windows (test-b)'},recoveryId:'test',
      files:[{path:'app/messages/chat/message-1',choiceKey:'local::message-1',source:'Android / Windows',local:{text:'本地文字'},remote:{text:'云端文字'}}]
    }})));
    assert.equal(await page.locator('#archive-conflict-local-device').textContent(),'Android (test-a)');
    assert.ok((await page.locator('#archive-conflict-files').textContent()).includes('云端文字'));
    assert.equal(await page.locator('[data-archive-choice]').count(),1);
    await page.selectOption('[data-archive-choice]','remote');
    const bounds=await page.locator('.archive-conflict-card').boundingBox();
    assert.ok(bounds.width<=viewport.width && bounds.height<=viewport.height);
    if(process.env.CHAT_TEST_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.CHAT_TEST_SCREENSHOT_DIR}/archive-conflict-${viewport.width}.png`});
    assert.deepEqual(errors,[]);
    console.log(`PASS ${viewport.width}: clipboard, chat/TTS save notice, native-path API export/cancel, per-record conflict comparison`);
    await context.close();
  }
} finally { await browser.close(); }
