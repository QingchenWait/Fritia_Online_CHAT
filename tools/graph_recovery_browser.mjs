import assert from 'node:assert/strict';
import {recoveryLimitCases} from './recovery_limit_cases.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHAT_TEST_BROWSER?{executablePath:process.env.CHAT_TEST_BROWSER}:{})});
const origin=process.env.CHAT_TEST_URL||'http://127.0.0.1:3022';
try {
  for(const viewport of [{width:1440,height:1000},{width:700,height:1000},{width:390,height:844}]){
    const context=await browser.newContext({viewport,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('fritia_chat_onboarding_dismissed','1'));
    await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
    await page.goto(origin);await page.waitForFunction(()=>document.querySelector('.conversation-item'));
    const cdp=await context.newCDPSession(page);
    await page.evaluate(async()=>{
      const translate=CanvasRenderingContext2D.prototype.translate;
      CanvasRenderingContext2D.prototype.translate=function(x,y){if(this.canvas.id==='memory-graph-canvas')window.graphDraw={x,y};return translate.call(this,x,y);};
      const scale=CanvasRenderingContext2D.prototype.scale;
      CanvasRenderingContext2D.prototype.scale=function(x,y){if(this.canvas.id==='memory-graph-canvas')window.graphScale=x;return scale.call(this,x,y);};
      (await import('/src/js/long_term_memory.js')).openMemoryNodePanel();window.graphEvents=[];
      for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.getElementById('memory-graph-canvas').addEventListener(type,e=>graphEvents.push({type,x:e.clientX,y:e.clientY}));
    });
    await page.waitForFunction(()=>window.graphDraw);
    await page.waitForTimeout(350);
    // Start on empty canvas, away from the seeded node cluster and edge-swipe zone.
    const box=await page.locator('#memory-graph-canvas').boundingBox(),x=box.x+120,y=box.y+35;
    const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({x:p[0],y:p[1],id:i+1,radiusX:2,radiusY:2,force:1}))});
    const drag=async()=>{await touch('touchStart',[[x,y]]);for(let i=1;i<=8;i++){await touch('touchMove',[[x+i*12,y+i*6]]);await page.waitForTimeout(25);}await touch('touchEnd',[]);await page.waitForTimeout(80);};
    await page.evaluate(()=>{document.getElementById('memory-graph-canvas').style.touchAction='auto';graphEvents=[];});await drag();
    assert.ok(await page.evaluate(()=>graphEvents.some(e=>e.type==='pointercancel')),'old CSS reproduces browser takeover');
    await page.evaluate(()=>{document.getElementById('memory-graph-canvas').style.removeProperty('touch-action');graphEvents=[];});
    const before=await page.evaluate(()=>graphDraw);await drag();const after=await page.evaluate(()=>graphDraw);
    assert.ok(Math.abs(after.x-before.x-96)<2&&Math.abs(after.y-before.y-48)<2,'continuous full-distance touch pan: '+JSON.stringify({before,after,box,events:await page.evaluate(()=>graphEvents)}));
    assert.ok(await page.evaluate(()=>graphEvents.filter(e=>e.type==='pointermove').length>=7&&!graphEvents.some(e=>e.type==='pointercancel')));
    const mouseBefore=await page.evaluate(()=>graphDraw);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+60,y+30,{steps:6});await page.mouse.up();await page.waitForTimeout(80);
    const mouseAfter=await page.evaluate(()=>graphDraw);assert.ok(Math.abs(mouseAfter.x-mouseBefore.x-60)<2,'mouse drag preserved: '+JSON.stringify({mouseBefore,mouseAfter,events:await page.evaluate(()=>graphEvents)}));
    const scaleBefore=await page.evaluate(()=>graphScale);await touch('touchStart',[[x,y],[x+80,y]]);for(let i=1;i<=5;i++)await touch('touchMove',[[x-i*4,y],[x+80+i*4,y]]);await touch('touchEnd',[]);await page.waitForTimeout(80);
    assert.ok(await page.evaluate(b=>graphScale>b,scaleBefore),'graph pinch zoom preserved');
    await page.evaluate(async()=>{(await import('/src/js/long_term_memory.js')).closeMemoryNodePanel();});
    console.log(`PASS ${viewport.width}: old touch cancellation reproduced; continuous touch, mouse and pinch pass`);
    if(viewport.width!==700){const result=await page.evaluate(recoveryLimitCases);console.log(`PASS ${viewport.width}: ${result.checks.length} recovery safety checks`);}
    await page.evaluate(()=>document.dispatchEvent(new CustomEvent('fritia-ui-open-panel',{detail:{id:'archive-panel'}})));
    await page.waitForFunction(()=>document.querySelector('#archive-recovery-limit + .custom-select'));
    await page.locator('#archive-recovery-limit + .custom-select .custom-select-trigger').click();
    assert.deepEqual(await page.locator('#archive-recovery-limit + .custom-select .custom-select-option').allTextContents(),['5','10','20','40']);
    await page.locator('#archive-recovery-limit + .custom-select .custom-select-option').filter({hasText:/^10$/}).click();
    await page.waitForFunction(()=>!document.getElementById('archive-recovery-limit').disabled);
    assert.equal(await page.evaluate(async()=> (await import('/src/js/archive_state.js')).getRecoveryLimit()),10);
    const button=await page.locator('#archive-recovery-remote').boundingBox(),limit=await page.locator('.archive-recovery-limit').boundingBox();
    assert.ok(limit.y>=button.y+button.height-2||(Math.abs(limit.y+limit.height/2-button.y-button.height/2)<3&&limit.x>=button.x+button.width-2),'limit appears after cloud export, right or below: '+JSON.stringify({button,limit}));
    assert.ok(limit.x>=0&&limit.x+limit.width<=viewport.width,'limit stays inside viewport');
    await page.reload();await page.waitForFunction(()=>document.querySelector('.conversation-item'));
    await page.evaluate(()=>document.dispatchEvent(new CustomEvent('fritia-ui-open-panel',{detail:{id:'archive-panel'}})));
    await page.waitForFunction(()=>document.getElementById('archive-recovery-limit').value==='10');
    assert.deepEqual(errors,[]);console.log(`PASS ${viewport.width}: custom limit menu, wrap and persisted preference`);await context.close();
  }
}finally{await browser.close();}
