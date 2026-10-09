import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chooseArchiveDestination} from '../src/js/archive_io.js';

function bridge(options={}) {
  const calls=[],chunks=[];let written=0,complete=false;
  const respond=(input,result)=>queueMicrotask(()=>window.__FRITIA_ARCHIVE_CALLBACK__(input.token,result));
  const api={};
  for(const method of ['chooseFile','beginWrite','writeChunk','finishWrite','abortWrite']) api[method]=raw=>{
    const input=JSON.parse(raw);calls.push({method,length:raw.length,input});
    if(method==='chooseFile')respond(input,options.cancel?{cancelled:true}:{uri:'content://chosen/only'});
    if(method==='beginWrite'){assert.equal(input.uri,'content://chosen/only');respond(input,{writeId:'save-session',chunkBytes:131072});}
    if(method==='writeChunk'){
      assert.equal(input.offset,written);assert.equal(input.writeId,'save-session');
      const bytes=Buffer.from(input.body,'base64');assert.ok(bytes.length<=131072);chunks.push(bytes);written+=bytes.length;
      respond(input,options.failChunk?{error:'fixture provider write failure'}:{written:options.badOffset?written-1:written});
    }
    if(method==='finishWrite'){complete=true;respond(input,options.failClose?{error:'fixture close failure'}:{saved:true,written});}
    if(method==='abortWrite')respond(input,{aborted:true});
  };
  return {api,calls,chunks,get complete(){return complete;}};
}

test('Android transmits bounded chunks with backpressure and exact byte preservation',async()=>{
  const previous=globalThis.window,b=bridge();globalThis.window={FritiaArchive:b.api};
  try{
    const bytes=Uint8Array.from({length:3*1024*1024+17},(_,i)=>(i*31)%256),blob=new Blob([bytes]);
    blob.arrayBuffer=()=>{throw Error('Whole-archive allocation is forbidden');};
    const write=await chooseArchiveDestination('archive.zip');const result=await write(blob);
    assert.equal(result.saved,true);assert.equal(result.written,bytes.length);
    assert.deepEqual(Buffer.concat(b.chunks),Buffer.from(bytes));
    assert.ok(b.calls.every(call=>call.length<177000));
    assert.equal(b.calls.filter(call=>call.method==='finishWrite').length,1);
  }finally{globalThis.window=previous;}
});

test('chunk/ack/close errors abort the matching write without reporting success',async()=>{
  const previous=globalThis.window;
  try{for(const option of ['failChunk','badOffset','failClose']){
    const b=bridge({[option]:true});globalThis.window={FritiaArchive:b.api};
    const write=await chooseArchiveDestination('archive.zip');await assert.rejects(write(new Blob(['PK fixture'])));
    assert.equal(b.calls.at(-1).method,'abortWrite');assert.equal(b.calls.at(-1).input.writeId,'save-session');
    if(option!=='failClose')assert.equal(b.complete,false);
  }}finally{globalThis.window=previous;}
});

test('cancel and incompatible Android bridge do not start a write',async()=>{
  const previous=globalThis.window;
  try{
    const b=bridge({cancel:true});globalThis.window={FritiaArchive:b.api};assert.equal(await chooseArchiveDestination('archive.zip'),null);assert.deepEqual(b.calls.map(x=>x.method),['chooseFile']);
    let chosen=false;globalThis.window={FritiaArchive:{chooseFile(){chosen=true;},writeFile(){}}};
    await assert.rejects(chooseArchiveDestination('archive.zip'),/分块/);assert.equal(chosen,false);
  }finally{globalThis.window=previous;}
});

test('Windows native save route is unchanged',async()=>{
  const previous=globalThis.window,calls=[];globalThis.window={__TAURI_INTERNALS__:{invoke:async(command,args)=>{calls.push({command,args});return command==='choose_archive_file'?'X:/selected.zip':null;}}};
  try{const write=await chooseArchiveDestination('archive.zip');await write(new Blob(['ZIP']));assert.deepEqual(calls.map(x=>x.command),['choose_archive_file','write_archive_file']);assert.equal(calls[1].args.path,'X:/selected.zip');assert.equal(atob(calls[1].args.body),'ZIP');}finally{globalThis.window=previous;}
});
