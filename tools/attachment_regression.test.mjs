import assert from 'node:assert/strict';
import {test} from 'node:test';
import {attachmentFixtures} from './attachment_fixtures.mjs';
import {dataUrlBytes,decodeAttachmentText,extractDocumentText} from '../src/js/attachment_documents.js';
import {buildModelMessageContent} from '../src/js/llm_media.js';
import {prepareAttachmentRequest,classifyAttachmentApiError} from '../src/js/attachment_inputs.js';
import {attachmentKey,blockedAttachment,isAttachmentErrorMessage} from '../src/js/attachment_state.js';
import {requestLlmCompletion} from '../src/js/llm_request.js';

test('text is decoded by content, preserving UTF-8, UTF-16, GB18030 and commas',()=>{
  const fixtures=attachmentFixtures();
  for(const name of ['cmd','utf16','gb'])assert.ok(decodeAttachmentText(dataUrlBytes(fixtures[name].dataUrl),fixtures[name].name).includes('你好'));
  assert.equal(decodeAttachmentText(dataUrlBytes('data:text/plain;charset=utf-8,one,two%0Athree')),'one,two\nthree');
  assert.equal(decodeAttachmentText(Uint8Array.from([0x63,0x61,0x66,0xe9]),'legacy.txt'),'café');
});

test('binary renamed to a script cannot bypass decoding',async()=>{
  await assert.rejects(extractDocumentText(Uint8Array.from([0,255,0,1,2,0]),'bad.cmd','text/plain'));
  await assert.rejects(extractDocumentText(Uint8Array.from([77,90,0,0,5,4]),'renamed.cmd','text/plain'));
});

test('private attachment metadata is removed; old raw script file parts become text',async()=>{
  const fixture=attachmentFixtures().cmd;
  const input=await prepareAttachmentRequest([{role:'user',content:[{type:'file',file:{filename:fixture.name,file_data:fixture.dataUrl}}]}],{baseUrl:'https://api.deepseek.com/v1'});
  assert.equal(input.files.length,0);
  assert.ok(input.messages[0].content.every(part=>part.type==='text'&&!('_fritiaAttachment' in part)));
  assert.ok(JSON.stringify(input.messages).includes('CMD_MARKER_1729'));
});

test('the three reported errors are attachment errors; auth/rate/server failures are not',async()=>{
  for(const [index,message]of ['.messages[5]: file must have a file_id or file_data','messages[5] user content: file type is not supported',"Invalid file data: 'input[2].content[1].file_data'. unsupported MIME type 'application/octet-stream'"].entries()){
    const info={name:'case'+index,keys:[await attachmentKey('reported-'+index)]};
    const error=Object.assign(new Error(message),{body:JSON.stringify({error:{message}}),status:400});
    const result=await classifyAttachmentApiError(error,{files:[{info,messageIndex:5,inputIndex:2,partIndex:1}]});
    assert.equal(result.kind,'attachment-input');assert.ok(result.message.includes(error.body));assert.ok(await blockedAttachment(info.keys));
  }
  for(const status of [401,429,500]){
    const info={name:'keep',keys:[await attachmentKey('keep-'+status)]},error=Object.assign(new Error('file server unavailable'),{status});
    assert.equal(await classifyAttachmentApiError(error,{files:[{info}]}),error);assert.equal(await blockedAttachment(info.keys),null);
  }
  const config=Object.assign(new Error('file model is invalid'),{status:400,body:JSON.stringify({error:{message:'file model is invalid',param:'model'}})});
  assert.equal(await classifyAttachmentApiError(config,{files:[{info:{name:'keep',keys:['a'.repeat(64)]}}]}),config);
});

test('legacy attachment errors are filtered without hiding ordinary discussion',()=>{
  assert.equal(isAttachmentErrorMessage({role:'assistant',status:'sent',text:'{"error":{"code":"400","message":"file type is not supported"}}'}),true);
  assert.equal(isAttachmentErrorMessage({role:'assistant',status:'sent',text:'如何修复 file type is not supported？'}),false);
});

test('a streamed file error remains a full error, not normal completion text',async()=>{
  const attachment=attachmentFixtures().pdf;
  const content=await buildModelMessageContent({attachments:[attachment]});
  const raw=JSON.stringify({error:{message:'Unsupported file type',code:'400',param:'messages[0].content[1]'}});
  const saved=globalThis.fetch;
  globalThis.fetch=async()=>new Response('data: '+raw+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
  try {
    await assert.rejects(requestLlmCompletion({settings:{apiKey:'fixture',baseUrl:'https://api.openai.com/v1',model:'gpt-6-sol'},messages:[{role:'user',content}]}),e=>e.kind==='attachment-input'&&e.body===raw);
  } finally{globalThis.fetch=saved;}
});
