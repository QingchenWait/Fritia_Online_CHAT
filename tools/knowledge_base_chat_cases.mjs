// Runs inside an isolated browser profile. Real KB/IDB and chat request builders
// are used; only the model HTTP endpoint is replaced with a deterministic reply.
export async function knowledgeBaseChatCases() {
  const kb = await import('/src/js/knowledge_base.js');
  const storage = await import('/src/js/storage.js');
  const settings = await import('/src/js/settings.js');
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const first = await kb.createKnowledgeBase('RAG 链路甲');
  const second = await kb.createKnowledgeBase('RAG 链路乙');
  const disabled = await kb.createKnowledgeBase('RAG 链路关闭');
  await kb.searchKnowledgeBase('ragintegrationkey', { knowledgeBaseIds: [first.id] });
  await kb.importTextToKnowledgeBase(first.id, '甲.txt', 'ragintegrationkey 独有甲标记甲壹。');
  await kb.importTextToKnowledgeBase(second.id, '乙.md', '# 标题乙\nragintegrationkey 独有乙标记乙贰。');
  await kb.importFilesToKnowledgeBase(disabled.id, [new File(['ragintegrationkey 禁用内容标记丙叁。'], '关闭.txt')]);
  const provider = { id: 'kb-fixture', apiKey: 'fixture-only', baseUrl: 'https://rag-fixture.invalid/v1', model: 'fixture-model' };
  const runtime = { ...settings.getSettings(), ...provider, chatProviders: [provider], defaultChatProviderId: provider.id,
    defaultImageCaptionProviderId: provider.id, stream: false, deepseekWebSearch: false, deepseekReadUrl: false };
  settings.saveSettings(runtime);
  settings.saveAdvancedSettings({ roundtableFollowUpRate: 0 });
  // Disable extraction for this test, so no extra model calls can masquerade as
  // a successful RAG request. Existing user records are never involved.
  const memories = (await import('/src/js/long_term_memory.js')).getLongTermMemoryStore();
  memories.settings.enabled = false;
  localStorage.setItem(storage.STORAGE_KEYS.longTermMemory, JSON.stringify(memories));
  const character = { id: 'kb-chat-fixture', name: '检索验证角色', prompt: '保留原人格。', source: 'custom' };
  const requests = [];
  const fetchBefore = window.fetch;
  window.fetch = async (input, init) => {
    if (String(input) !== `${provider.baseUrl}/chat/completions`) return fetchBefore(input, init);
    const body = JSON.parse(init.body); requests.push(body);
    const group = body.messages[0].content.includes('只输出 JSON');
    const content = group ? JSON.stringify({ text: '@分析员 正常回复', targetId: 'player', intent: 'answer', emotion: 'neutral', wantsFollowUp: false, suggestedFollowUpTargetId: '', topicHint: '检索' }) : '正常回复';
    return Response.json({ choices: [{ message: { content } }] });
  };
  const checks = [];
  try {
    const { requestCharacterReply } = await import('/src/js/chat_engine.js');
    const { completeToolPrivateMessageReply } = await import('/src/js/tool_chat_engine.js');
    const { runRoundtableTurn, getRoundtableError } = await import('/src/js/roundtable.js');
    for (const mode of ['private', 'mcp', 'group']) {
      for (const active of [[second.id], [first.id, second.id], []]) {
        kb.setActiveKnowledgeBaseIds(active);
        const conversation = { id: `rag-${mode}-${active.length}`, type: mode === 'group' ? 'group' : 'private', memberIds: [character.id], groupSettings: { autoBotChat: true, idleTalk: false, botAtMentionTriggersReply: false, botChainLimit: 1 } };
        const user = storage.normalizeMessage({ id: `rag-user-${mode}-${active.length}`, role: 'user', speakerId: 'player', text: 'ragintegrationkey', createdAt: Date.now() });
        const app = { version: 1, characters: [character], conversations: [conversation], messages: { [conversation.id]: [user] }, activeConversationId: conversation.id };
        const before = requests.length;
        if (mode === 'private') {
          const reply = await requestCharacterReply({ store: app, conversation, character, userText: user.text, userMessage: user, chatSettings: runtime });
          check(reply.text === '正常回复', 'Private reply failed');
        } else if (mode === 'mcp') {
          const reply = await completeToolPrivateMessageReply({ store: app, conversation, character, text: user.text, userMessage: user, selectedClientIds: [], chatSettings: runtime });
          check(reply === '正常回复', `MCP reply failed: ${reply}`);
        } else {
          const result = await runRoundtableTurn({ store: app, conversation, characters: [character], triggerText: user.text, triggerMessageId: user.id, chatSettings: runtime });
          check(!getRoundtableError(), `Roundtable failed: ${JSON.stringify(getRoundtableError())}`);
          check(result.messages[conversation.id].some(message => message.role === 'assistant' && message.text.includes('正常回复')), 'Roundtable reply missing');
        }
        const sent = requests.slice(before);
        check(sent.length === 1, `${mode}: expected one real model request, got ${sent.length}`);
        const rag = sent[0].messages.filter(message => typeof message.content === 'string' && message.content.startsWith('以下是当前对话可参考的知识库片段'));
        check(rag.length === (active.length ? 1 : 0), `${mode}: RAG presence incorrect`);
        if (rag.length) {
          check(rag[0].content.includes('独有甲标记甲壹') === active.includes(first.id), `${mode}: first KB toggle ignored`);
          check(rag[0].content.includes('独有乙标记乙贰') === active.includes(second.id), `${mode}: second KB missing`);
          check(!rag[0].content.includes('禁用内容标记丙叁'), `${mode}: disabled KB leaked`);
        }
        checks.push(`${mode}: ${active.length} enabled KB(s) reach actual model request`);
      }
    }
  } finally { window.fetch = fetchBefore; }
  return checks;
}
