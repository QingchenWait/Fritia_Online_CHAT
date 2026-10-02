// Shared isolated-state checks for Chromium and the release WebViews.
export async function recoveryLimitCases() {
  const m=await import(new URL('./src/js/archive_state.js',location.href).href);
  const checks=[], assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
  const snapshot={local:{version:1,localStorage:{fritia_fixture:'preserve'},indexedDb:{}}};
  const dump=()=>new Promise((resolve,reject)=>{const q=indexedDB.open('fritia_archive_state',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction('state'),s=tx.objectStore('state'),keys=s.getAllKeys(),values=s.getAll();tx.oncomplete=()=>{db.close();resolve(Object.fromEntries(keys.result.map((k,i)=>[k,values.result[i]])));};tx.onerror=()=>reject(tx.error);};q.onerror=()=>reject(q.error);});
  const clean=async()=>{for(const item of await m.archiveState('recoveries')||[])await m.deleteRecovery(item.id);};
  assert(await m.getRecoveryLimit()===20,'default limit is 20');
  for(const key of ['device','target/baseline','target/catalog','pack-sentinel','legacy/target']) await m.archiveState(key,{keep:key});
  const liveBefore=JSON.stringify({...localStorage});
  const originalNow=Date.now;let stamp=originalNow()-1000000;
  try {
    for(const limit of [5,10,20,40]){
      await clean();await m.setRecoveryLimit(limit);const ids=[];Date.now=()=>++stamp;
      for(let i=0;i<limit+3;i++)ids.push(await m.saveRecovery(snapshot,'fixture-'+i));
      const list=await m.archiveState('recoveries');
      assert(list.length===limit,limit+' cap enforced');
      assert(JSON.stringify(list.map(x=>x.id))===JSON.stringify(ids.slice(-limit).reverse()),limit+' keeps exactly newest snapshots');
      assert((await Promise.all(ids.slice(0,3).map(id=>m.archiveState(id)))).every(x=>x===undefined),limit+' deletes only excess oldest payloads');
      for(const key of ['device','target/baseline','target/catalog','pack-sentinel','legacy/target'])assert((await m.archiveState(key)).keep===key,limit+' preserves '+key);
    }
    Date.now=originalNow;
    await m.setRecoveryLimit(5);
    assert((await m.archiveState('recoveries')).length===40,'changing limit alone does not delete data');
    await m.saveRecovery(snapshot,'lowered limit');
    assert((await m.archiveState('recoveries')).length===5,'next new snapshot applies lowered limit');
    for(const invalid of [0,1,6,41,Infinity,'bad']){let rejected=false;try{await m.setRecoveryLimit(invalid);}catch{rejected=true;}assert(rejected&&await m.getRecoveryLimit()===5,'invalid setting rejected: '+invalid);}
    await clean();let oldIds=[];Date.now=()=>stamp++;
    for(let i=0;i<5;i++)oldIds.push(await m.saveRecovery(snapshot,'ordered-'+i));
    let index=await m.archiveState('recoveries');await m.archiveState('recoveries',[index[2],index[4],index[0],index[3],index[1]]);
    const newest=await m.saveRecovery(snapshot,'newest');
    assert(await m.archiveState(oldIds[0])===undefined&&!!await m.archiveState(newest),'pruning uses time rather than list position');
    await clean();Date.now=()=>stamp;
    const ties=[];for(let i=0;i<7;i++)ties.push(await m.saveRecovery(snapshot,'tie-'+i));
    assert(JSON.stringify((await m.archiveState('recoveries')).map(x=>x.id))===JSON.stringify(ties.slice(-5).reverse()),'equal timestamps preserve newest insertion order');
    Date.now=originalNow;
    const concurrent=await Promise.all(Array.from({length:8},(_,i)=>m.saveRecovery(snapshot,'concurrent-'+i)));
    index=await m.archiveState('recoveries');assert(index.length===5&&index.every(item=>concurrent.includes(item.id)),'concurrent writers serialize without extra deletions');
    const currentState=await dump();
    const oldDelete=IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete=function(key){const result=oldDelete.call(this,key);if(String(key).startsWith('recovery-'))this.transaction.abort();return result;};
    let failed=false;try{await m.saveRecovery(snapshot,'must roll back');}catch{failed=true;}finally{IDBObjectStore.prototype.delete=oldDelete;}
    assert(failed&&JSON.stringify(await dump())===JSON.stringify(currentState),'delete failure rolls back new snapshot, index and all removals');
    const oldPut=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,key){if(String(key).startsWith('recovery-'))throw new DOMException('fixture full disk','QuotaExceededError');return oldPut.call(this,value,key);};
    failed=false;try{await m.saveRecovery(snapshot,'new snapshot write fails');}catch{failed=true;}finally{IDBObjectStore.prototype.put=oldPut;}
    assert(failed&&JSON.stringify(await dump())===JSON.stringify(currentState),'new snapshot failure rolls back even previously queued deletions');
    await m.archiveState('recovery-limit','40');const invalidPreference=await dump();failed=false;try{await m.saveRecovery(snapshot,'bad preference');}catch{failed=true;}
    assert(failed&&JSON.stringify(await dump())===JSON.stringify(invalidPreference),'corrupt limit cannot silently trigger a smaller retention count');
    await m.setRecoveryLimit(5);
    const bad=index.at(-1),valid=await m.archiveState(bad.id);await m.archiveState(bad.id,{...valid,id:'device'});
    const corruptBefore=await dump();failed=false;try{await m.saveRecovery(snapshot,'corrupt candidate');}catch{failed=true;}
    assert(failed&&JSON.stringify(await dump())===JSON.stringify(corruptBefore),'mismatched candidate stops all deletion and insertion');
    await m.archiveState(bad.id,valid);
    const validIndex=await m.archiveState('recoveries');await m.archiveState('recoveries',[...validIndex,{id:'device',at:1,label:'forged'}]);
    const forgedBefore=await dump();failed=false;try{await m.saveRecovery(snapshot,'forged index');}catch{failed=true;}
    assert(failed&&JSON.stringify(await dump())===JSON.stringify(forgedBefore),'foreign-key index cannot delete device or any other entry');
    await m.archiveState('recoveries',validIndex);
    Date.now=()=>1;const rollbackClock=await dump();failed=false;try{await m.saveRecovery(snapshot,'clock moved backward');}catch{failed=true;}
    assert(failed&&JSON.stringify(await dump())===JSON.stringify(rollbackClock),'clock rollback never deletes the just-created safety copy or a newer substitute');
    assert(JSON.stringify({...localStorage})===liveBefore,'live localStorage stays byte-for-byte unchanged');
    return {checks,limit:await m.getRecoveryLimit(),count:(await m.archiveState('recoveries')).length};
  } finally {Date.now=originalNow;}
}
