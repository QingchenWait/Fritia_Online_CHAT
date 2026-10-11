import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chooseArchiveDestination} from '../src/js/archive_io.js';
import {conversationImageFilename, saveConversationImage} from '../src/js/conversation_share.js';

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

test('PNG default filename uses local time and zero-padded YYMMDD_HHMMSS',()=>{
  assert.equal(conversationImageFilename(new Date(2026,9,11,3,0,25)), '海姆休息室_261011_030025.png');
  assert.equal(conversationImageFilename(new Date(2001,0,2,0,4,5)), '海姆休息室_010102_000405.png');
});

test('Windows PNG uses native chooser before WebView pickers and writes the renamed path',async()=>{
  const previous=globalThis.window,calls=[];
  globalThis.window={showDirectoryPicker(){throw Error('Restricted WebView directory picker');},showSaveFilePicker(){throw Error('Native picker must win');},
    __TAURI_INTERNALS__:{invoke:async(command,args)=>{calls.push({command,args});return command==='choose_archive_file'?'D:/chosen/renamed.png':null;}}};
  try{
    assert.equal(await saveConversationImage(new Blob(['PNG fixture'],{type:'image/png'})),false);
    assert.equal(calls[0].command,'choose_archive_file');assert.equal(calls[0].args.mime,'image/png');
    assert.match(calls[0].args.filename,/^海姆休息室_\d{6}_\d{6}\.png$/);
    assert.equal(calls[1].args.path,'D:/chosen/renamed.png');assert.equal(atob(calls[1].args.body),'PNG fixture');
  }finally{globalThis.window=previous;}
});

test('Android PNG uses image/png SAF and bounded writes without a whole-image allocation',async()=>{
  const previous=globalThis.window,b=bridge();globalThis.window={FritiaArchive:b.api,showSaveFilePicker(){throw Error('Native picker must win');}};
  try{
    const bytes=Uint8Array.from({length:1024*1024+29},(_,i)=>(i*17)%256),blob=new Blob([bytes],{type:'image/png'});
    blob.arrayBuffer=()=>{throw Error('Whole-image allocation is forbidden');};
    assert.equal(await saveConversationImage(blob,'海姆休息室_261011_030025.png'),false);
    assert.equal(b.calls[0].input.mime,'image/png');assert.equal(b.calls[0].input.filename,'海姆休息室_261011_030025.png');
    assert.deepEqual(Buffer.concat(b.chunks),Buffer.from(bytes));assert.equal(b.complete,true);
  }finally{globalThis.window=previous;}
});

test('PNG cancellation and write failure never report a saved image',async()=>{
  const previous=globalThis.window;
  try{
    for(const option of ['cancel','failChunk','badOffset','failClose']){
      const b=bridge({[option]:true});globalThis.window={FritiaArchive:b.api};
      if(option==='cancel'){assert.equal(await saveConversationImage(new Blob(['PNG'])),null);assert.deepEqual(b.calls.map(x=>x.method),['chooseFile']);}
      else {await assert.rejects(saveConversationImage(new Blob(['PNG'])));assert.equal(b.calls.at(-1).method,'abortWrite');}
    }
    const commands=[];globalThis.window={__TAURI_INTERNALS__:{invoke:async command=>{commands.push(command);return null;}}};
    assert.equal(await saveConversationImage(new Blob(['PNG'])),null);assert.deepEqual(commands,['choose_archive_file']);
  }finally{globalThis.window=previous;}
});

test('Web PNG picker offers editable name and PNG type, handles cancel and aborts failed writes',async()=>{
  const previous=globalThis.window;let pickerOptions,saved,aborted=false,closed=false;
  globalThis.window={showDirectoryPicker(){throw Error('Directory picker is no longer used');},showSaveFilePicker:async options=>{
    pickerOptions=options;return {createWritable:async()=>({write:async blob=>{saved=blob;},close:async()=>{closed=true;}})};
  }};
  try{
    const blob=new Blob(['PNG'],{type:'image/png'});assert.equal(await saveConversationImage(blob,'海姆休息室_261011_030025.png'),false);
    assert.equal(pickerOptions.suggestedName,'海姆休息室_261011_030025.png');assert.deepEqual(pickerOptions.types[0].accept,{'image/png':['.png']});assert.equal(saved,blob);assert.equal(closed,true);
    window.showSaveFilePicker=async()=>{throw new DOMException('Cancelled','AbortError');};assert.equal(await saveConversationImage(blob),null);
    window.showSaveFilePicker=async()=>({createWritable:async()=>({write:async()=>{throw Error('Disk full');},abort:async()=>{aborted=true;}})});
    await assert.rejects(saveConversationImage(blob),/Disk full/);assert.equal(aborted,true);
  }finally{globalThis.window=previous;}
});
