// Runs unmodified application modules in isolated browser / release WebViews.
export async function attachmentRuntimeCases(fixtures) {
  const checks=[], assert=(condition,name)=>{if(!condition)throw Error(name);checks.push(name);};
  const module=name=>import(new URL('./src/js/'+name,location.href).href);
  const media=await module('llm_media.js'), inputs=await module('attachment_inputs.js'), state=await module('attachment_state.js');
  const engine=await module('chat_engine.js'), tools=await module('tool_chat_engine.js'), settingsModule=await module('settings.js');
  const storage=await module('storage.js'), mediaStore=await module('media_store.js');
  const originalFetch=window.fetch, requests=[];
  window.attachmentTestRequests=requests;
  const traces=[];
  let failure=null;
  window.fetch=async(url,init)=>{
    if(!/\/(?:chat\/completions|responses)$/.test(String(url)))return originalFetch(url,init);
    const body=JSON.parse(init.body);requests.push({url:String(url),body});
    if(failure&&(!failure.onlyHost||new URL(url).hostname===failure.onlyHost))return new Response(JSON.stringify(failure.body),{status:failure.status,headers:{'Content-Type':'application/json'}});
    if(String(url).endsWith('/responses'))return Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'fixture-success'}]}]});
    const group=JSON.stringify(body).includes('圆桌密语');
    return Response.json({choices:[{message:{role:'assistant',content:group?JSON.stringify({text:'fixture-group-success',targetId:'player',intent:'answer',wantsFollowUp:false}):'fixture-success'}}]});
  };
  const provider=(kind)=>({id:'fixture',name:kind,apiKey:'fixture-not-a-real-key',baseUrl:kind==='gpt'?'https://api.openai.com/v1':kind==='mimo'?'https://api.xiaomimimo.com/v1':'https://api.deepseek.com/v1',model:kind==='gpt'?'gpt-6-sol':kind==='mimo'?'mimo-v2.6-flash':'deepseek-flash'});
  const settings=kind=>settingsModule.normalizeSettings({chatProviders:[provider(kind)],defaultChatProviderId:'fixture'});
  const character={id:'attachment-fixture-bot',name:'附件验证',prompt:'按用户请求回答。',source:'custom',createdAt:Date.now(),updatedAt:Date.now()};
  const conversation={id:'attachment-fixture-'+crypto.randomUUID(),type:'private',title:'附件测试',memberIds:[character.id],createdAt:Date.now(),updatedAt:Date.now()};
  let store={version:1,characters:[character],conversations:[conversation],messages:{[conversation.id]:[]},activeConversationId:conversation.id};
  const current=(text,attachments=[])=>{const message={id:crypto.randomUUID(),role:'user',speakerId:'player',speakerName:'分析员',text,attachments,createdAt:Date.now()};store=storage.appendMessage(store,conversation.id,message);return message;};
  const invoke=async(message,kind='deepseek',tool=false)=>{
    let updated=store;
    const fn=tool?tools.completeToolPrivateMessageReply:engine.completePrivateMessageReply;
    const result=await fn({store,conversation,character,text:message.text,userMessage:message,chatSettings:settings(kind),selectedClientIds:[],onStore:value=>{updated=value;const trace=value.messages[conversation.id].at(-1)?.meta?.toolTrace?.resumeState;if(trace)traces.push(trace);}});
    store=updated;return result;
  };
  try {
    for(const [key,marker]of [['cmd','CMD_MARKER_1729'],['utf16','UTF16_MARKER_2026'],['gb','GB_MARKER_826'],['unknown','UNKNOWN_MARKER_2048'],['docx','DOCX_MARKER_2718'],['xlsx','XLSX_MARKER_1618'],['pptx','PPTX_MARKER_3141']]) {
      const content=await media.buildModelMessageContent({attachments:[fixtures[key]]});
      assert(JSON.stringify(content).includes(marker),key+' text extraction');
      assert(content.every(part=>part.type==='text'),key+' has no binary file part');
      if(['cmd','utf16','gb'].includes(key))assert(JSON.stringify(content).includes('你好'),key+' preserves Chinese encoding');
      if(key==='xlsx')assert(JSON.stringify(content).includes('销售数据'),'workbook sheet name retained');
      if(key==='pptx')assert(JSON.stringify(content).indexOf('PPTX_FIRST_SLIDE')<JSON.stringify(content).indexOf('PPTX_MARKER_3141'),'presentation relationship order retained');
    }
    const pdf=await media.buildModelMessageContent({attachments:[fixtures.pdf]});
    const pdfText=await inputs.prepareAttachmentRequest([{role:'user',content:pdf}],provider('deepseek'));
    assert(JSON.stringify(pdfText.messages).includes('PDF_MARKER_5772'),'PDF.js local text extraction in this runtime');
    for(const kind of ['deepseek','mimo','gpt']) {
      const message=current('分析脚本 '+kind,[fixtures.cmd]);const start=requests.length;
      await invoke(message,kind);
      assert(requests.length===start+1 && store.messages[conversation.id].at(-1).status==='sent',kind+' ordinary file request succeeds');
      const wire=JSON.stringify(requests.at(-1).body);
      assert(wire.includes('CMD_MARKER_1729')&&!wire.includes('file_data')&&!wire.includes('_fritiaAttachment'),kind+' sends full script as text, no private provenance');
    }
    await invoke(current('使用工具分析',[fixtures.long]),'deepseek',true);
    assert(JSON.stringify(requests.at(-1).body).includes('END_OF_FULL_CMD_999'),'MCP mode receives complete long script');
    assert(JSON.stringify(traces).includes('END_OF_FULL_CMD_999'),'MCP resume snapshots retain complete attachment text');
    const responses=await module('openai_responses.js');
    const cmd=await media.buildModelMessageContent({attachments:[fixtures.cmd]});
    await responses.requestOpenAIResponses({provider:provider('gpt'),messages:[{role:'user',content:cmd}],tools:[],toolChoice:'none',reasoningEffort:'low'});
    assert(requests.at(-1).body.input[0].content.some(part=>part.type==='input_text'&&part.text.includes('CMD_MARKER_1729')),'Responses script conversion');
    await responses.requestOpenAIResponses({provider:provider('gpt'),messages:[{role:'user',content:pdf}],tools:[],toolChoice:'none',reasoningEffort:'low'});
    assert(requests.at(-1).body.input[0].content.some(part=>part.type==='input_file'&&part.file_data.startsWith('data:application/pdf;base64,')),'Responses keeps supported PDF input with real MIME');
    const saved=await mediaStore.saveDataUrlAsMedia(fixtures.binary.dataUrl,{name:fixtures.binary.name,mime:fixtures.binary.mime});
    const binary={...fixtures.binary,dataRef:saved.ref,dataUrl:''};window.attachmentBlockedFixture=binary;
    const before=requests.length, badMessage=current('分析这个文件',[binary]);
    const error=await invoke(badMessage);
    assert(error.includes('附件读取失败')&&requests.length===before,'unsupported binary gets a dedicated preflight error without API request');
    assert(store.messages[conversation.id].at(-1).meta.attachmentInputError,'file error is marked for history isolation');
    assert(!(localStorage.getItem('fritia_long_term_memory')||'').includes(badMessage.id),'unsupported input does not enter long-term memory');
    await invoke(current('后续纯文本'));
    assert(store.messages[conversation.id].at(-1).status==='sent','plain text succeeds after unsupported attachment');
    assert(!JSON.stringify(requests.at(-1).body).includes('unsupported.bin')&&!JSON.stringify(requests.at(-1).body).includes('附件读取失败'),'rejected attachment and error are absent from future context');
    assert(await mediaStore.getMediaDataUrl(saved.ref)===fixtures.binary.dataUrl,'quarantine preserves original downloadable bytes');
    const legacy=[{role:'user',content:[{type:'file',file:{filename:fixtures.cmd.name,file_data:fixtures.cmd.dataUrl}},{type:'file',file:{filename:fixtures.legacyBinary.name,file_data:fixtures.legacyBinary.dataUrl}}]}];
    const legacyIssues=[];const rebuilt=await inputs.prepareAttachmentRequest(legacy,provider('mimo'),{historical:true,issues:legacyIssues});
    assert(JSON.stringify(rebuilt.messages).includes('CMD_MARKER_1729')&&!JSON.stringify(rebuilt.messages).includes('file_data')&&legacyIssues.length===1,'legacy resume payload repairs scripts and isolates binary files');
    store=storage.appendMessage(store,conversation.id,{id:crypto.randomUUID(),role:'assistant',speakerId:character.id,speakerName:character.name,text:'工具调用已停止。',status:'error',createdAt:Date.now(),meta:{toolMode:true,toolTrace:{interrupted:true,resumeState:{messages:legacy,userText:'继续分析脚本',stepCount:0,toolCallCount:0,selectedClientIds:[]}}}});
    await invoke(current('继续'),'deepseek',true);
    assert(JSON.stringify(requests.at(-1).body).includes('CMD_MARKER_1729')&&!JSON.stringify(requests.at(-1).body).includes('file_data'),'actual MCP resume repairs legacy file content before sending');
    const raw={error:{message:'Unsupported file type: input[0].content[1].file_data',type:'invalid_request_error',code:null}};
    const first=await media.buildModelMessageContent({attachments:[fixtures.otherPdf]});
    const second=await media.buildModelMessageContent({attachments:[fixtures.rejectedPdf]});
    failure={status:400,body:raw};let caught;
    try { await responses.requestOpenAIResponses({provider:provider('gpt'),messages:[{role:'user',content:[first.find(p=>p.type==='file'),second.find(p=>p.type==='file')]}],tools:[],toolChoice:'none',reasoningEffort:'low'}); } catch(e){caught=e;}
    failure=null;
    assert(caught?.kind==='attachment-input'&&caught.message.includes(JSON.stringify(raw)),'API file error retains the complete original error');
    const kept=await inputs.prepareAttachmentRequest([{role:'user',content:first}],provider('gpt'),{historical:true});
    assert(kept.files.length===1,'an indexed rejection does not quarantine a different supported PDF');
    const rejected=await media.buildModelMessageContent({attachments:[fixtures.rejectedPdf],historical:true});
    assert(rejected==='','rejected API attachment is excluded on later turns');
    failure={status:401,body:{error:{message:'invalid API key'}}};
    const configError=await invoke(current('配置错误测试'));failure=null;
    assert(configError.includes('检查 API Key')&&!store.messages[conversation.id].at(-1).meta?.attachmentInputError,'configuration errors remain distinct');
    const error200={error:{code:'400',message:'file type is not supported'}};failure={status:200,body:error200};
    let rejected200=false;try { await (await module('llm_request.js')).requestLlmCompletion({settings:settings('gpt'),messages:[{role:'user',content:first}]}); }catch(e){rejected200=e.kind==='attachment-input'&&e.message.includes('file type is not supported');}
    failure=null;assert(rejected200,'HTTP 200 error payload is not treated as assistant prose');
    const longError={error:{message:'file type is not supported '+ 'x'.repeat(14000),type:'invalid_request_error'}};
    failure={status:400,body:longError};await invoke(current('长错误测试',[fixtures.longErrorPdf]),'gpt');failure=null;
    assert(store.messages[conversation.id].at(-1).meta.attachmentApiError===JSON.stringify(longError),'full API error survives message text display limits');
    const oldErrors=await inputs.filterAttachmentHistory([{role:'assistant',status:'sent',text:JSON.stringify(error200)},{role:'assistant',status:'sent',text:'讨论 file type is not supported 的解决办法'}]);
    assert(oldErrors.length===1&&oldErrors[0].text.startsWith('讨论'),'legacy JSON errors are isolated while ordinary discussion remains');
    const request=await module('llm_request.js'),imageContent=await media.buildModelMessageContent({attachments:[fixtures.image]});
    const imageSettings=settingsModule.normalizeSettings({chatProviders:[{...provider('gpt'),id:'primary',model:'fixture-vision',baseUrl:'https://primary.fixture.test/v1'},{...provider('gpt'),id:'image'}],defaultChatProviderId:'primary',defaultImageCaptionProviderId:'image'});
    failure={status:400,body:{error:{message:'image type is not supported'}},onlyHost:'primary.fixture.test'};
    const imageReply=await request.requestLlmCompletion({settings:imageSettings,messages:[{role:'user',content:imageContent}]});failure=null;
    assert(imageReply==='fixture-success'&&(await media.buildModelMessageContent({attachments:[fixtures.image],historical:true})).length>0,'existing image-provider fallback still works without premature quarantine');
    failure={status:400,body:{error:{message:'image_url: unsupported image type'}}};let imageError;
    try {await request.requestLlmCompletion({settings:settings('gpt'),messages:[{role:'user',content:imageContent}]});}catch(e){imageError=e;}
    failure=null;assert(imageError?.kind==='attachment-input'&&(await media.buildModelMessageContent({attachments:[fixtures.image],historical:true}))==='','unsupported image input is isolated after final rejection');
    const audioContent=await media.buildModelMessageContent({attachments:[fixtures.audio]});let audioError;
    try {await responses.requestOpenAIResponses({provider:provider('gpt'),messages:[{role:'user',content:audioContent}],tools:[],toolChoice:'none',reasoningEffort:'low'});}catch(e){audioError=e;}
    assert(audioError?.kind==='attachment-input','Responses audio is explicitly rejected instead of silently dropped');
    settingsModule.saveSettings(settings('deepseek'));
    const group={...conversation,id:'attachment-group-'+crypto.randomUUID(),title:'附件群聊测试',type:'group',groupSettings:{autoBotChat:false,idleTalk:false,maxParticipants:2}};
    let groupStore={...store,conversations:[...store.conversations,group],messages:{...store.messages,[group.id]:[]}};
    const roundtable=await module('roundtable.js');
    const groupMessage={id:crypto.randomUUID(),role:'user',speakerId:'player',speakerName:'分析员',text:'@附件验证 分析附件',attachments:[fixtures.groupBinary],createdAt:Date.now()};
    groupStore=storage.appendMessage(groupStore,group.id,groupMessage);
    await roundtable.runRoundtableTurn({store:groupStore,conversation:group,characters:[character],triggerText:groupMessage.text,triggerAttachments:groupMessage.attachments,onStore:s=>{groupStore=s;}});
    assert(groupStore.messages[group.id].at(-1).meta?.attachmentInputError,'group chat uses attachment-specific error and isolation');
    groupStore=storage.appendMessage(groupStore,group.id,{...groupMessage,id:crypto.randomUUID(),text:'@附件验证 继续普通文字聊天',attachments:[]});
    await roundtable.runRoundtableTurn({store:groupStore,conversation:group,characters:[character],triggerText:'@附件验证 继续普通文字聊天',onStore:s=>{groupStore=s;}});
    assert(groupStore.messages[group.id].at(-1).status==='sent','group chat recovers on the next plain-text turn');
    assert(!JSON.stringify(requests.at(-1).body).includes('group-unsupported.bin'),'group request and RAG context omit rejected file');
    return {checks,requests:requests.length,blockedFixture:binary,conversationId:conversation.id};
  } finally { window.fetch=originalFetch; }
}
