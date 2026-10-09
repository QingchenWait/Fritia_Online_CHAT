import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHAT_TEST_BROWSER?{executablePath:process.env.CHAT_TEST_BROWSER}:{})});
const origin=process.env.CHAT_TEST_URL||'http://127.0.0.1:3022';
try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage();
    await page.addInitScript(()=>localStorage.setItem('fritia_chat_onboarding_dismissed','1'));
    await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
    await page.goto(origin);await page.waitForFunction(()=>document.querySelector('.conversation-item'));
    const result=await page.evaluate(async()=>{
      const archive=await import('/src/js/archive_sync.js'),state=await import('/src/js/archive_state.js');
      let closed=false,mode='success',size=0,completeChecks=0;
      const notice=()=>document.getElementById('model-settings-notice');
      const hide=()=>{if(notice())notice().hidden=true;};
      const count=()=>JSON.parse(localStorage.getItem('fritia_archive_sync')||'{}').backupCount||0;
      window.showSaveFilePicker=async()=>{
        if(mode==='cancel')throw new DOMException('cancel','AbortError');
        return {createWritable:async()=>({write:async blob=>{size=blob.size;if(mode==='write-error')throw Error('write failed');},close:async()=>{if(notice()&&!notice().hidden)throw Error('Toast before stream close');if(mode==='close-error')throw Error('close failed');closed=true;},abort:async()=>{}})};
      };
      await archive.exportArchiveZip();if(!closed||size<100||notice()?.textContent!=='备份 ZIP 包已成功导出'||notice().hidden)throw Error('Missing success toast');completeChecks++;
      const before=count();
      for(mode of ['cancel','write-error','close-error']){
        hide();try{await archive.exportArchiveZip();}catch{}
        if((notice()&&!notice().hidden)||count()!==before)throw Error('Failed/cancelled export reported as success');completeChecks++;
      }
      mode='success';hide();closed=false;
      const id=await state.saveRecovery({remote:{version:1,localStorage:{fritia_fixture:'preserved'},indexedDb:{}}},'export fixture');
      await archive.exportArchiveRecovery(id,'remote');if(!closed||notice()?.hidden)throw Error('Recovery success toast missing');completeChecks++;
      hide();delete window.showSaveFilePicker;let downloaded=false;const click=HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click=function(){downloaded=!!this.download;};
      try{await archive.exportArchiveZip();}finally{HTMLAnchorElement.prototype.click=click;}
      if(!downloaded||notice()?.hidden)throw Error('Browser download export missing toast');completeChecks++;
      const rect=notice().getBoundingClientRect();if(rect.left<0||rect.right>innerWidth||rect.bottom>innerHeight)throw Error('Toast overflows viewport');
      return {completeChecks,text:notice().textContent};
    });
    assert.equal(result.completeChecks,6);console.log(`PASS ${viewport.width}: complete ZIP/recovery toast, cancel/failure silence, browser download and notice fit`);await context.close();
  }
}finally{await browser.close();}
