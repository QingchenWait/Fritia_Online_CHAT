import assert from 'node:assert/strict';
import { attachmentFixtures } from './attachment_fixtures.mjs';
import { attachmentRuntimeCases } from './attachment_runtime_cases.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHAT_TEST_BROWSER?{executablePath:process.env.CHAT_TEST_BROWSER}:{})});
const origin=process.env.CHAT_TEST_URL||'http://127.0.0.1:3022';
try {
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>localStorage.setItem('fritia_chat_onboarding_dismissed','1'));
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await page.goto(origin);await page.waitForFunction(()=>document.querySelector('.conversation-item'));
    const result=await page.evaluate(attachmentRuntimeCases,attachmentFixtures());
    assert.ok(result.checks.length>=35);
    console.log(`PASS ${viewport.width}: ${result.checks.length} attachment cases (${result.requests} controlled API requests)`);
    // New failed rounds are transient. Retain a separately seeded pre-update
    // error to continue validating legacy quarantine recovery from backups.
    await page.locator('.conversation-item').filter({hasText:'附件测试'}).first().click();
    assert.ok(await page.locator('.is-attachment-error').count());
    assert.ok((await page.locator('.is-attachment-error details pre').last().textContent()).length>14000);
    const hasNewErrors = await page.evaluate(id => JSON.parse(localStorage.getItem('fritia_next_chat_store')).messages[id].some(item => item.meta?.attachmentInputError), result.conversationId);
    assert.equal(hasNewErrors,false,'new failed replies are not persisted');
    await page.evaluate(async ({id,error}) => {
      const storage=await import('/src/js/storage.js');
      storage.appendMessage(storage.loadAppStore(),id,{...error,id:'pre-update-attachment-error'});
    },{id:result.conversationId,error:result.legacyError});
    await page.reload();await page.waitForFunction(()=>document.querySelector('.conversation-item'));
    const persistent=await page.evaluate(async fixture=>{
      const {buildModelMessageContent}=await import('/src/js/llm_media.js');
      const {getMediaDataUrl}=await import('/src/js/media_store.js');
      return {content:await buildModelMessageContent({attachments:[fixture],historical:true}),bytes:!!await getMediaDataUrl(fixture.dataRef)};
    },result.blockedFixture);
    assert.deepEqual(persistent,{content:'',bytes:true});
    await page.locator('.conversation-item').filter({hasText:'附件测试'}).first().click();
    assert.ok(await page.locator('.is-attachment-error').count());
    assert.ok((await page.locator('.is-attachment-error details pre').textContent()).length>14000);
    let uploadRequest;
    await page.route('**/chat/completions',async route=>{
      uploadRequest=route.request().postDataJSON();
      await route.fulfill({json:{choices:[{message:{role:'assistant',content:'UI_UPLOAD_SUCCESS'}}]}});
    });
    await page.locator('#file-input').setInputFiles({name:'from-picker.cmd',mimeType:'application/octet-stream',buffer:Buffer.from('@echo off\r\necho UI_PICKER_CMD_7788')});
    await page.waitForFunction(()=>!document.getElementById('attachment-preview').classList.contains('hidden'));
    await page.fill('#message-input','分析刚上传的脚本');await page.click('#send-btn');
    await page.waitForFunction(()=>[...document.querySelectorAll('.message-content')].some(node=>node.textContent==='UI_UPLOAD_SUCCESS'));
    assert.ok(JSON.stringify(uploadRequest).includes('UI_PICKER_CMD_7788')&&!JSON.stringify(uploadRequest).includes('file_data'));
    await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase('fritia_attachment_inputs');request.onsuccess=resolve;request.onerror=()=>reject(request.error);}));
    await page.reload();await page.waitForFunction(()=>document.querySelector('.conversation-item'));
    const restored=await page.evaluate(async fixture=>{
      const {filterAttachmentHistory}=await import('/src/js/attachment_inputs.js');
      await filterAttachmentHistory(Object.values(JSON.parse(localStorage.getItem('fritia_next_chat_store')).messages).flat());
      return (await import('/src/js/llm_media.js')).buildModelMessageContent({attachments:[fixture],historical:true});
    },attachmentFixtures().longErrorPdf);
    assert.equal(restored,'','Error metadata must restore quarantine on a device without the old local cache');
    assert.deepEqual(errors,[]);
    console.log(`PASS ${viewport.width}: persisted/restored quarantine, retained file, full error UI and real file-picker upload`);
    await context.close();
  }
}finally{await browser.close();}
