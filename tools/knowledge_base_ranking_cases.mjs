// Real preset data and the user's reported file/query, in an isolated browser.
// Only the model HTTP response is mocked; retrieval and request construction run.
export async function knowledgeBaseRankingCases() {
  const kb = await import('/src/js/knowledge_base.js');
  const storage = await import('/src/js/storage.js');
  const settings = await import('/src/js/settings.js');
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const checks = [];
  const preset = (await kb.listKnowledgeBases()).find(item => item.name === '尘白人物设定 (260622)');
  expect(preset, 'real builtin archive must be installed');
  const source = 'LDFTEP 是制造索法抑制剂的核心材料之一。索法抑制剂通常被认为是昂贵的巴德尔抑制剂的廉价替代品，由恒沙调用自身的庞大算力推演得到，其成本仅需巴德尔抑制剂的十分之一左右。LDFTEP 在其中起到关键作用，其来源是分析员精子中的活性物质，吉诺拉生物通过研究获得了这种物质的量产手段。';
  const first = await kb.createKnowledgeBase('分析员补充资料');
  const second = await kb.createKnowledgeBase('天穹计划资料');
  await kb.importFilesToKnowledgeBase(first.id, [new File([source], 'LDFTEP.txt', { type: 'text/plain' })]);
  await kb.importFilesToKnowledgeBase(second.id, [new File(['天穹计划的启动口令是蓝羽星河。'], '天穹计划.txt', { type: 'text/plain' })]);
  const enabled = [preset.id, first.id, second.id];
  kb.setActiveKnowledgeBaseIds(enabled);
  settings.saveAdvancedSettings({ kbInjectLimit: 6 });
  const query = '看知识库，介绍一下 LDFTEP';
  const birthday = '胧嫣的生日是几号';
  const history = [
    { role: 'user', text: '介绍一下芙提雅、芬妮和晴的角色设定。' },
    { role: 'assistant', text: '芙提雅是天才研究员，芬妮是黄金狮子，晴是海姆达尔的队长。她们都与分析员关系亲密，在世界树公司和海姆达尔部队有各自的经历。'.repeat(8) },
    { role: 'user', text: '再多说说这些角色与分析员之间的故事。' },
    { role: 'assistant', text: '芬妮、芙提雅、晴、陶以及世界树公司，海姆达尔部队与分析员的经历，神格、天启者、泰坦和巴德尔抑制剂，大家的生日和人物介绍。'.repeat(8) }
  ];
  const snapshot = async () => {
    const archive = await kb.exportKnowledgeBaseArchive();
    return JSON.stringify({ knowledgeBases: archive.knowledgeBases, files: archive.files, chunks: archive.chunks,
      indexes: archive.indexes, local: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])) });
  };
  // Both terms must survive the default six results while the real preset is on.
  const direct = await kb.searchKnowledgeBase(query);
  expect(direct.some(item => item.fileName === 'LDFTEP.txt' && item.text === source), 'exact user LDFTEP file missing from default top 6 with preset enabled');
  expect((await kb.searchKnowledgeBase('天穹计划的启动口令是什么？')).some(item => item.knowledgeBaseId === second.id), 'small Chinese KB is starved by independently scored preset');
  checks.push('real builtin plus two small user KBs: exact LDFTEP and Chinese fact survive default top 6');
  const beforeState = localStorage.getItem(storage.STORAGE_KEYS.knowledgeState);
  const beforeRead = await snapshot();
  for (const past of [[], history]) {
    const reference = await kb.buildRagReferenceMessage({ query, userText: query, history: past });
    expect(reference?.content.includes(source), `LDFTEP RAG must include exact uploaded content with ${past.length} history messages`);
    const born = await kb.buildRagReferenceMessage({ query: birthday, userText: birthday, history: past });
    expect(born?.content.includes('角色简介-胧嫣.txt') && /生日\s+2月1日/.test(born.content), `builtin birthday must reach RAG with ${past.length} history messages`);
    checks.push(`current exact LDFTEP and builtin birthday queries survive ${past.length} old history messages`);
  }
  expect(await snapshot() === beforeRead, 'retrieval changed source/index/state records');
  checks.push('healthy multi-KB searches leave all source data, derived indexes and local settings unchanged');
  expect((await kb.searchKnowledgeBase('看知识库，介绍一下 ldftep')).some(item => item.text === source), 'case-insensitive LDFTEP lookup missed the uploaded file');
  const fullRanks = await kb.searchKnowledgeBase(query, { limit: 500 });
  kb.setActiveKnowledgeBaseIds([...enabled].reverse());
  const reverseRanks = await kb.searchKnowledgeBase(query, { limit: 500 });
  const reverseScores = new Map(reverseRanks.map(item => [item.id, item.score]));
  expect(reverseRanks[0].id === fullRanks[0].id && fullRanks.length === reverseRanks.length
    && fullRanks.every(item => Math.abs(item.score - reverseScores.get(item.id)) < 1e-8), 'enabled KB iteration order changes relevance');
  kb.setActiveKnowledgeBaseIds([first.id, second.id]);
  const customOnly = await kb.searchKnowledgeBase('LDFTEP 天穹计划');
  expect(customOnly.some(item => item.text === source) && customOnly.some(item => item.knowledgeBaseId === second.id)
    && customOnly.every(item => item.knowledgeBaseId !== preset.id), 'disabling builtin does not leave both custom KBs searchable');
  kb.setActiveKnowledgeBaseIds([preset.id]);
  const builtinOnly = await kb.buildRagReferenceMessage({ query: birthday, userText: birthday, history });
  expect(builtinOnly?.content.includes('角色简介-胧嫣.txt') && /生日\s+2月1日/.test(builtinOnly.content)
    && !builtinOnly.content.includes('LDFTEP.txt'), 'builtin-only birthday lookup failed with long history');
  kb.setActiveKnowledgeBaseIds(enabled);
  checks.push('Latin case, enabled order and disabling builtin/custom preserve relevant default-limit results');
  const followupHistory = [...history, { role: 'user', text: '天穹计划的启动口令是什么？' }, { role: 'assistant', text: '启动口令是蓝羽星河。' }];
  for (const followup of ['能详细说说吗？', '继续呢？']) {
    const reference = await kb.buildRagReferenceMessage({ query: followup, userText: followup, history: followupHistory });
    expect(reference?.content.includes('天穹计划的启动口令是蓝羽星河。'), `weak follow-up ${followup} must retain the recent relevant source`);
  }
  checks.push('weak follow-ups retain recent relevant history instead of losing the original source');
  localStorage.setItem(storage.STORAGE_KEYS.knowledgeState, beforeState);
  expect(await snapshot() === beforeRead, 'lookup/toggle tests failed to restore source and state snapshot');

  // Moving an unchanged document between enabled libraries must not change its
  // relevance. The raw fixture records are restored byte-for-byte afterward.
  const archive = await kb.exportKnowledgeBaseArchive();
  const document = archive.files.find(item => item.kbId === second.id);
  const chunks = archive.chunks.filter(item => item.fileId === document.id);
  const owners = archive.knowledgeBases.filter(item => [preset.id, second.id].includes(item.id));
  const indexes = archive.indexes.filter(item => [preset.id, second.id].includes(item.kbId));
  const writeRows = async entries => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('fritia_knowledge_base_db', 2); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { await new Promise((resolve, reject) => {
      const tx = db.transaction(['knowledgeBases', 'files', 'chunks', 'indexes'], 'readwrite');
      for (const [store, rows] of entries) for (const row of rows) tx.objectStore(store).put(row);
      tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  };
  const relocationQuery = '天穹计划的启动口令是什么？';
  const originalRanks = await kb.searchKnowledgeBase(relocationQuery, { limit: 500 });
  try {
    await writeRows([['files', [{ ...document, kbId: preset.id }]], ['chunks', chunks.map(item => ({ ...item, kbId: preset.id }))],
      ['knowledgeBases', owners.map(item => ({ ...item, fileCount: item.fileCount + (item.id === preset.id ? 1 : -1), chunkCount: item.chunkCount + (item.id === preset.id ? chunks.length : -chunks.length) }))]]);
    await kb.rebuildKnowledgeBaseIndex(preset.id); await kb.rebuildKnowledgeBaseIndex(second.id);
    const movedRanks = await kb.searchKnowledgeBase(relocationQuery, { limit: 500 });
    expect(movedRanks.length === originalRanks.length, 'relocation changed the candidate corpus');
    for (let i = 0; i < originalRanks.length; i++) {
      expect(movedRanks[i].id === originalRanks[i].id && Math.abs(movedRanks[i].score - originalRanks[i].score) < 1e-8,
        'identical source chunk scores/rank change when stored inside builtin instead of user KB');
    }
  } finally {
    await writeRows([['knowledgeBases', owners], ['files', [document]], ['chunks', chunks], ['indexes', indexes]]);
  }
  expect(await snapshot() === beforeRead, 'fixture regrouping failed to restore original records');
  checks.push('identical document scores and ranks stay invariant when moved into the builtin KB');
  const index = archive.indexes.find(item => item.kbId === first.id);
  const expectedScore = (() => {
    const doc = index.docs[0], term = 'ldftep', tf = doc.terms[term], length = Object.values(doc.terms).reduce((sum, value) => sum + value, 0);
    return Math.log(1 + (index.docCount - index.df[term] + .5) / (index.df[term] + .5))
      * (tf * (1.35 + 1)) / (tf + 1.35 * (1 - .72 + .72 * length / index.avgLength));
  })();
  const single = await kb.searchKnowledgeBase('LDFTEP', { knowledgeBaseIds: [first.id] });
  expect(single.length === 1 && Math.abs(single[0].score - expectedScore) < 1e-8, 'single-KB BM25 formula changed');
  checks.push('single-KB BM25 calculation keeps its existing score');
  kb.setActiveKnowledgeBaseIds([preset.id, second.id]);
  expect(!(await kb.buildRagReferenceMessage({ query, userText: query, history }))?.content.includes(source), 'disabled user KB leaked into RAG');
  kb.setActiveKnowledgeBaseIds(enabled);
  checks.push('disabled LDFTEP KB is excluded while other enabled KBs remain searchable');

  const provider = { id: 'ranking-fixture', apiKey: 'fixture-only', baseUrl: 'https://ranking-fixture.invalid/v1', model: 'fixture-model' };
  const runtime = { ...settings.getSettings(), ...provider, chatProviders: [provider], defaultChatProviderId: provider.id,
    defaultImageCaptionProviderId: provider.id, stream: false, deepseekWebSearch: false, deepseekReadUrl: false };
  settings.saveSettings(runtime);
  const memory = (await import('/src/js/long_term_memory.js')).getLongTermMemoryStore(); memory.settings.enabled = false;
  localStorage.setItem(storage.STORAGE_KEYS.longTermMemory, JSON.stringify(memory));
  const character = { id: 'ranking-bot', name: '检索角色', source: 'custom', prompt: '保持原人格。' };
  const requestCharacterReply = (await import('/src/js/chat_engine.js')).requestCharacterReply;
  const completeToolPrivateMessageReply = (await import('/src/js/tool_chat_engine.js')).completeToolPrivateMessageReply;
  const { runRoundtableTurn, getRoundtableError } = await import('/src/js/roundtable.js');
  settings.saveAdvancedSettings({ roundtableFollowUpRate: 0 });
  const requests = [], originalFetch = window.fetch;
  window.fetch = async (url, init) => {
    if (String(url) !== `${provider.baseUrl}/chat/completions`) return originalFetch(url, init);
    const body = JSON.parse(init.body); requests.push(body);
    const content = body.messages[0].content.includes('只输出 JSON') ? JSON.stringify({ text: '@分析员 受控正常回复', targetId: 'player', intent: 'answer', emotion: 'neutral', wantsFollowUp: false, suggestedFollowUpTargetId: '', topicHint: '检索' }) : '受控正常回复';
    return Response.json({ choices: [{ message: { content } }] });
  };
  try {
    for (const mode of ['private', 'mcp', 'group']) for (const text of [query, birthday]) for (const past of [[], history]) {
      const conversation = { id: `ranking-${mode}-${requests.length}`, type: mode === 'group' ? 'group' : 'private', memberIds: [character.id],
        groupSettings: { autoBotChat: true, idleTalk: false, botAtMentionTriggersReply: false, botChainLimit: 1 } };
      const user = storage.normalizeMessage({ id: `ranking-current-${requests.length}`, role: 'user', text, createdAt: Date.now() });
      const messages = [...past.map((item, i) => storage.normalizeMessage({ ...item, id: `ranking-old-${i}`, createdAt: i + 1 })), user];
      const app = { version: 1, characters: [character], conversations: [conversation], messages: { [conversation.id]: messages }, activeConversationId: conversation.id };
      const before = requests.length;
      if (mode === 'private') {
        const reply = await requestCharacterReply({ store: app, conversation, character, userText: text, userMessage: user, chatSettings: runtime });
        expect(reply.text === '受控正常回复', 'actual private reply failed');
      } else if (mode === 'mcp') {
        const reply = await completeToolPrivateMessageReply({ store: app, conversation, character, text, userMessage: user, selectedClientIds: [], chatSettings: runtime });
        expect(reply === '受控正常回复', 'actual MCP reply failed');
      } else {
        const result = await runRoundtableTurn({ store: app, conversation, characters: [character], triggerText: text, triggerMessageId: user.id, chatSettings: runtime });
        expect(!getRoundtableError() && result.messages[conversation.id].some(item => item.role === 'assistant' && item.text.includes('受控正常回复')), 'actual group reply failed');
      }
      expect(requests.length === before + 1, 'expected exactly one actual model request');
      const rag = requests.at(-1).messages.find(item => typeof item.content === 'string' && item.content.startsWith('以下是当前对话可参考的知识库片段'))?.content;
      expect(text === query ? rag?.includes(source) : rag?.includes('角色简介-胧嫣.txt') && /生日\s+2月1日/.test(rag), 'reported fact missing from actual outgoing model RAG input');
      checks.push(`actual ${mode} request: ${text} with ${past.length} history messages contains source fact`);
    }
  } finally { window.fetch = originalFetch; }
  const nouns = await kb.createKnowledgeBase('查询指令词边界');
  await kb.importFilesToKnowledgeBase(nouns.id, [
    new File(['介绍信由接待处签发。'], '介绍信.txt'),
    new File(['说明书包含设备的检修流程。'], '说明书.txt'),
    new File(['请夏负责夜间值班。'], '请夏.txt')
  ]);
  for (const [question, fileName] of [['介绍信是什么', '介绍信.txt'], ['说明书的维护规则', '说明书.txt'], ['请夏负责什么', '请夏.txt']]) {
    expect((await kb.searchKnowledgeBase(question, { knowledgeBaseIds: [nouns.id], limit: 1 }))[0]?.fileName === fileName,
      `query cleanup changed the topic inside a noun/name: ${question}`);
  }
  checks.push('query instruction cleanup preserves nouns and names such as 介绍信、说明书、请夏');
  return checks;
}
