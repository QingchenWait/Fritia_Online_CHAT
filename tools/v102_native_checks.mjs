// Imported by the isolated native harness, never by the released frontend.
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

export async function runFeatures(clients, pass, debugPort) {
  for (const [name, client] of Object.entries(clients)) {
    const progress = await client(`return validationSteps.filter(x=>x.detail);`);
    assert.ok(progress.length > 0);
    assert.ok(progress.every(x=>x.detail.completed>=0 && x.detail.completed<=x.detail.total));
    assert.ok(progress.some(x=>x.label==='正在上传增量文件'));
    if (name==='android') assert.ok(progress.some(x=>x.conflictVisible && x.displayed.includes(' / ')), 'Conflict dialog must display live counts');
    pass(name+' actual sync reports file/record counts, including conflict resolution', { events:progress.length, phases:[...new Set(progress.map(x=>x.label))] });
    const deletion = await client(`return (${testRecovery.toString()})();`);
    assert.ok(deletion.onlyTargetRemoved && deletion.liveUnchanged && deletion.cancelPreserved && deletion.rowsCompact);
    pass(name+' actual recovery dropdown confirmation deletes only the bound snapshot and index row',deletion);
    await client(`return (${mockModelScope.toString()})();`);
    await waitFor(client, `return !!document.querySelector('[data-plugin-install-id]') && !document.getElementById('plugin-store-status').textContent.includes('正在检测');`);
    const initialChecks = await client('return nativeLoginTest.checks;');
    await client(`document.querySelector('[data-plugin-install-id]').click(); return true;`);
    await waitFor(client,'return nativeLoginTest.opened === 1;');
    const loggedOut = await client('return {checks:nativeLoginTest.checks,details:nativeLoginTest.details};');
    assert.deepEqual(loggedOut,{checks:initialChecks+1,details:0});
    let loginWindow;
    if(name==='android') {
      for(let i=0;i<30;i++) {
        loginWindow=await client('return JSON.parse(FritiaValidation.modelScopeInfo());');
        if(loginWindow.url?.includes('modelscope.cn/login')&&loginWindow.visible) break;
        await sleep(100);
      }
      assert.ok(loginWindow.visible && loginWindow.url.includes('modelscope.cn/login'),JSON.stringify(loginWindow));
    } else {
      for(let i=0;i<40;i++) {
        const pages=await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
        loginWindow=pages.find(x=>x.url.includes('modelscope.cn/login'));
        if(loginWindow)break;
        await sleep(100);
      }
      assert.ok(loginWindow,'Native Windows login WebView must navigate to /login');
      loginWindow={url:loginWindow.url,type:loginWindow.type};
    }
    pass(name+' card install opens the real embedded /login window when logged out',loginWindow);
    await client('nativeLoginTest.connected=true;return true;');
    await waitFor(client,'return nativeLoginTest.details===1;');
    assert.equal(await client(`return document.getElementById('plugin-detail-panel').classList.contains('hidden');`),false);
    const before=await client(`document.getElementById('plugin-detail-panel').classList.add('hidden');return nativeLoginTest.checks;`);
    await client(`document.querySelector('[data-plugin-install-id]').click();return true;`);
    await waitFor(client,'return nativeLoginTest.details===2;');
    assert.deepEqual(await client('return [nativeLoginTest.checks,nativeLoginTest.opened];'),[before+1,1]);
    await client(`document.getElementById('plugin-detail-panel').classList.add('hidden');nativeLoginTest.fail=true;document.querySelector('[data-plugin-install-id]').click();return true;`);
    await waitFor(client,`return document.getElementById('plugin-store-status').textContent.includes('fixture network failure');`);
    assert.equal(await client('return nativeLoginTest.details;'),2);
    pass(name+' install resumes after login, rechecks signed-in cookies, stops on network failure', { loginApi:'controlled responses', actualRemoteAccountLogin:false });
    await client(`window.__TAURI__=nativeLoginTest.previous;document.getElementById('plugin-store-panel').classList.add('hidden');return true;`);
  }
}

async function waitFor(client, script) {
  for(let i=0;i<100;i++) { if(await client(script))return; await sleep(100); }
  throw Error('Timed out: '+script);
}

async function testRecovery() {
  const state=await import(new URL('./src/js/archive_state.js',location.href).href);
  const getAll=async()=>new Promise((resolve,reject)=>{
    const open=indexedDB.open('fritia_archive_state',1);
    open.onsuccess=()=>{const db=open.result,tx=db.transaction('state'),store=tx.objectStore('state'),keys=store.getAllKeys(),values=store.getAll();tx.oncomplete=()=>{db.close();resolve(Object.fromEntries(keys.result.map((k,i)=>[k,values.result[i]])));};tx.onerror=()=>reject(tx.error);};open.onerror=()=>reject(open.error);
  });
  const snapshot={version:1,localStorage:{fritia_fixture:'keep-original'},indexedDb:{}};
  const target=await state.saveRecovery({local:snapshot,remote:snapshot},'v1.0.2 待删除的测试副本');
  const kept=await state.saveRecovery({local:snapshot},'v1.0.2 必须保留的测试副本');
  const before=await getAll(),liveBefore=JSON.stringify({...localStorage});
  document.dispatchEvent(new CustomEvent('fritia-ui-open-panel',{detail:{id:'archive-panel'}}));
  const select=document.getElementById('archive-recovery-list');
  for(let i=0;i<80&&!Array.from(select.options).some(o=>o.value===target);i++)await new Promise(r=>setTimeout(r,50));
  const index=Array.from(select.options).findIndex(o=>o.value===target);
  if(index<0)throw Error('Recovery missing from menu');
  const dropdown=select.nextElementSibling;
  dropdown.querySelector('.custom-select-trigger').click();
  const rowsCompact=Array.from(dropdown.querySelectorAll('.archive-recovery-option')).every(x=>x.getBoundingClientRect().height===32);
  dropdown.querySelectorAll('.archive-recovery-delete')[index].click();
  if(!document.getElementById('archive-recovery-delete-dialog').open)throw Error('Confirmation dialog missing');
  document.getElementById('archive-recovery-delete-cancel').click();
  const cancelPreserved=!!await state.archiveState(target);
  await new Promise(r=>setTimeout(r,30));
  dropdown.querySelector('.custom-select-trigger').click();
  dropdown.querySelectorAll('.archive-recovery-delete')[index].click();
  select.value=kept;select.dispatchEvent(new Event('change'));
  document.getElementById('archive-recovery-delete-confirm').click();
  for(let i=0;i<80&&document.getElementById('archive-recovery-delete-dialog').open;i++)await new Promise(r=>setTimeout(r,50));
  const after=await getAll();
  const beforeKeys=Object.keys(before).filter(k=>![target,'recoveries'].includes(k));
  const onlyTargetRemoved=after[target]===undefined && after[kept]!==undefined
    && beforeKeys.every(k=>JSON.stringify(before[k])===JSON.stringify(after[k]))
    && JSON.stringify(after.recoveries)===JSON.stringify(before.recoveries.filter(x=>x.id!==target))
    && Object.keys(after).length===Object.keys(before).length-1;
  const liveUnchanged=liveBefore===JSON.stringify({...localStorage});
  document.getElementById('archive-panel').classList.add('hidden');
  return {onlyTargetRemoved,liveUnchanged,cancelPreserved,rowsCompact,unaffectedStateKeys:beforeKeys.length};
}

async function mockModelScope() {
  const invoke=window.__TAURI__?.core?.invoke||window.__TAURI_INTERNALS__?.invoke;
  window.nativeLoginTest={previous:window.__TAURI__,checks:0,opened:0,details:0,connected:false,fail:false};
  window.__TAURI__={core:{invoke:async(command,args)=>{
    const test=nativeLoginTest;
    if(command==='open_modelscope_window'){test.opened++;return invoke(command,args);}
    if(command!=='modelscope_fetch')return invoke(command,args);
    const url=args.request.url;let payload;
    if(url.endsWith('/users/login/info')){
      test.checks++;if(test.fail)throw Error('fixture network failure');
      payload={Success:true,Data:test.connected?{Id:'fixture-account'}:{}};
    }else if(url.includes('/dolphin/mcpServers'))payload={Success:true,Data:{McpServer:{McpServers:[{Name:'test',Path:'fixture',ChineseName:'隔离测试 MCP'}],TotalCount:1}}};
    else {test.details++;payload={Success:true,Data:{Name:'test',Path:'fixture'}};}
    return {status:200,bodyBase64:btoa(unescape(encodeURIComponent(JSON.stringify(payload))))};
  }}};
  document.dispatchEvent(new CustomEvent('fritia-ui-open-panel',{detail:{id:'plugin-store-panel'}}));
  document.querySelector('[data-plugin-store-section="mcp"]').click();
  return true;
}
