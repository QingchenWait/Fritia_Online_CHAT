import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { test } from 'node:test';
import * as reasoning from '../src/js/model_reasoning.js';
import * as responses from '../src/js/openai_responses.js';
import { normalizeMessage, normalizeGroupSettings } from '../src/js/storage.js';
import { AttachmentInputError, assertModelResponse } from '../src/js/attachment_state.js';
import { requestLlmCompletion } from '../src/js/llm_request.js';
import { buildDeepSeekWebReference } from '../src/js/deepseek_web.js';

const provider = { id: 'web-chat-fixture', apiKey: 'fixture-only', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash' };
const character = { id: 'web-chat-bot', name: '测试角色', prompt: '保留原人格设定。' };
const playerText = '查询最新资料并阅读 https://example.com/article';
const player = { id: 'fixture-user', role: 'user', speakerId: 'player', speakerName: '分析员', text: playerText, status: 'sent', createdAt: 1 };
const webContent = 'WEB_REFERENCE_MARKER ' + '外部资料'.repeat(500);
const tools = [{ type: 'function', function: { name: 'existing_lookup', parameters: { type: 'object' } } }];

function initialStore(conversation) {
  return { version: 1, characters: [character], conversations: [conversation], messages: { [conversation.id]: [structuredClone(player)] }, activeConversationId: conversation.id, updatedAt: 1 };
}

async function loadChatModules(enabled, { tokenHardLimit = 300000 } = {}) {
  let id = 0;
  const events = [], memory = [], requests = [];
  const settings = { ...provider, chatProviders: [provider], defaultChatProviderId: provider.id,
    defaultImageCaptionProviderId: provider.id, temperature: 0.67, deepseekWebSearch: enabled, deepseekReadUrl: enabled };
  const stubs = {
    appendMessage: (store, conversationId, message) => ({ ...store, messages: { ...store.messages,
      [conversationId]: [...(store.messages[conversationId] || []), normalizeMessage(message)] } }),
    replaceMessage: (store, conversationId, messageId, patch) => ({ ...store, messages: { ...store.messages,
      [conversationId]: store.messages[conversationId].map(message => message.id === messageId ? normalizeMessage({ ...message, ...patch }) : message) } }),
    createId: () => `fixture-${++id}`, now: () => 2000,
    getConversationMessages: (store, conversationId) => store.messages[conversationId] || [], normalizeGroupSettings,
    getDefaultChatProvider: () => provider, getSettings: () => settings,
    getAdvancedSettings: () => ({ historyLimit: 24, roundtableCallLimit: 15, roundtableTokenHardLimit: tokenHardLimit, roundtableFollowUpRate: 0 }),
    buildRagReferenceMessage: async () => ({ role: 'system', content: 'EXISTING_RAG_REFERENCE' }),
    buildLongTermMemoryMessage: async () => ({ role: 'system', content: 'EXISTING_MEMORY_REFERENCE' }),
    recordLongTermMemoryTurn: turn => memory.push(turn),
    characterDisplayName: value => value.name, buildDeepSeekIntimateUserMessage: async () => null,
    shouldKeepMessageForCurrentDeepSeekMode: () => true,
    buildModelMessageContent: async ({ text }) => text,
    attachmentLabelText: () => '', buildAttachmentContentParts: async () => [],
    filterAttachmentHistory: async history => history,
    filterFailedTurnHistory: history => history, isFailedTurnMessage: () => false,
    markFailedTurn: () => { throw new Error('Unexpected failed turn'); },
    isAttachmentErrorMessage: () => false, assertModelResponse, AttachmentInputError,
    requestWithAttachments: async (messages, selected, options, run) => run(messages, { files: [] }),
    saveDataUrlAsMedia: () => { throw new Error('Unexpected media write'); },
    getTtsErrorLog: () => '', synthesizeMimoVoiceClone: () => { throw new Error('Unexpected TTS request'); },
    collectMcpToolDefinitions: async () => ({ tools, registry: { existing_lookup: { toolName: 'existing_lookup', client: { name: 'fixture MCP' } } }, permissions: { completeToolResultReply: false } }),
    callMcpToolByRegistryEntry: async (entry, args) => {
      events.push('mcp-function'); assert.deepEqual(args, { query: 'existing task' });
      return { content: [{ type: 'text', text: 'EXISTING_MCP_RESULT' }] };
    },
    formatMcpContentText: () => 'EXISTING_MCP_RESULT', getMcpConfig: () => ({ permissions: { completeToolResultReply: false } }),
    getSelectedMcpClientIds: () => ['fixture MCP'],
    isLmStudioSettings: () => false, isLmStudioProvider: () => false, requestLmStudioCompletion: () => {},
    ...reasoning, ...responses, requestLlmCompletion, buildDeepSeekWebReference
  };
  async function load(name, extras = '') {
    const source = await readFile(new URL(`../src/js/${name}.js`, import.meta.url), 'utf8');
    const imports = new Map([...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)]
      .map(match => [match[2], match[1].split(',').map(value => value.trim())]));
    const module = new SourceTextModule(source + extras);
    await module.link(specifier => {
      const names = imports.get(specifier);
      for (const name of names) assert.ok(name in stubs, `Missing fixture dependency: ${name}`);
      return new SyntheticModule(names, function () { for (const name of names) this.setExport(name, stubs[name]); });
    });
    await module.evaluate();
    return module.namespace;
  }
  const privateChat = await load('chat_engine');
  const mcpChat = await load('tool_chat_engine');
  Object.assign(stubs, { requestToolAwareCompletion: mcpChat.requestToolAwareCompletion,
    normalizeToolCalls: mcpChat.normalizeToolCalls, extractMcpResultAttachments: mcpChat.extractMcpResultAttachments,
    normalizeGeneratedAttachments: mcpChat.normalizeGeneratedAttachments });
  const groupChat = await load('roundtable', '\nexport { getBudgetState, estimateTokens };');
  function fetcher(main) {
    return async (url, init) => {
      const body = JSON.parse(init.body), request = { url: String(url), body };
      requests.push(request);
      if (String(url).endsWith('/tools/search')) {
        events.push('search');
        return Response.json({ results: [{ title: '真实检索来源', url: 'https://source.example.org/article', summary: '检索摘要', content: webContent }] });
      }
      if (String(url).endsWith('/tools/fetch')) {
        events.push('fetch'); return Response.json({ title: '用户网页', content: webContent });
      }
      if (body.response_format?.type === 'json_object') {
        events.push('planner'); return Response.json({ choices: [{ message: { content: JSON.stringify({ queries: ['最新资料'], urls: ['https://example.com/article'] }) } }] });
      }
      events.push('main'); return main(request);
    };
  }
  return { privateChat, mcpChat, groupChat, settings, events, memory, requests, fetcher };
}

async function withFetch(fetcher, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try { return await run(); } finally { globalThis.fetch = original; }
}

function assertReference(body, enabled) {
  const contents = body.messages.map(message => String(message.content));
  assert.equal(contents.some(content => content.includes('WEB_REFERENCE_MARKER')), enabled);
  assert.ok(contents.includes('EXISTING_RAG_REFERENCE'));
  assert.ok(contents.includes('EXISTING_MEMORY_REFERENCE'));
  assert.ok(contents[0].includes('保留原人格设定'));
  assert.equal(body.reasoning_effort, 'high');
  assert.deepEqual(body.thinking, { type: 'enabled' });
  assert.equal(body.max_tokens, undefined); assert.equal(body.max_completion_tokens, undefined);
}

test('real private reply uses optional web context and retains the existing message/archive shape', async () => {
  for (const enabled of [false, true]) {
    const fixture = await loadChatModules(enabled);
    const conversation = { id: 'private-integration', type: 'private', characterId: character.id };
    let store = initialStore(conversation);
    await withFetch(fixture.fetcher(({ body }) => {
      assertReference(body, enabled);
      assert.equal(body.temperature, 0.67); assert.equal(body.stream, false); assert.equal(body.tools, undefined);
      return Response.json({ choices: [{ message: { content: '原人格的正常答复。', reasoning_content: '原思考状态' } }] });
    }), async () => {
      assert.equal(await fixture.privateChat.completePrivateMessageReply({ store, conversation, character, text: playerText,
        userMessage: player, chatSettings: fixture.settings, reasoningEffort: 'high', onStore: next => { store = next; } }), '原人格的正常答复。');
    });
    const saved = store.messages[conversation.id].at(-1);
    assert.equal(saved.status, 'sent'); assert.equal(saved.meta.toolMode, undefined);
    assert.equal(saved.meta.reasoning.reasoning_content, '原思考状态');
    assert.deepEqual(Object.keys(store).sort(), Object.keys(initialStore(conversation)).sort());
    assert.deepEqual(Object.keys(saved).sort(), ['id', 'role', 'speakerId', 'speakerName', 'text', 'attachments', 'createdAt', 'status', 'meta'].sort());
    assert.equal(JSON.stringify(store).includes('WEB_REFERENCE_MARKER'), false);
    assert.equal(fixture.memory.length, 1);
    assert.equal(fixture.requests.length, enabled ? 4 : 1);
  }
});

test('real MCP loop receives web references before preserving the existing function call/result sequence', async () => {
  for (const enabled of [false, true]) {
    const fixture = await loadChatModules(enabled);
    const conversation = { id: 'mcp-integration', type: 'private', characterId: character.id };
    let store = initialStore(conversation), mainCalls = 0;
    await withFetch(fixture.fetcher(({ body }) => {
      assertReference(body, enabled);
      assert.deepEqual(body.tools, tools); assert.equal(body.tool_choice, 'auto');
      assert.equal(body.temperature, 0.67); assert.equal(body.stream, true);
      mainCalls++;
      if (mainCalls === 1) return Response.json({ choices: [{ message: { content: '', reasoning_content: '先查原工具',
        tool_calls: [{ id: 'existing-call', type: 'function', function: { name: 'existing_lookup', arguments: '{"query":"existing task"}' } }] } }] });
      assert.equal(body.messages.find(message => message.role === 'tool').content, 'EXISTING_MCP_RESULT');
      assert.equal(body.messages.find(message => message.tool_calls?.length).reasoning_content, '先查原工具');
      return Response.json({ choices: [{ message: { content: '原工具与网页资料已处理。', reasoning_content: '完成原任务' } }] });
    }), async () => {
      assert.equal(await fixture.mcpChat.completeToolPrivateMessageReply({ store, conversation, character, text: playerText,
        userMessage: player, selectedClientIds: ['fixture MCP'], chatSettings: fixture.settings, reasoningEffort: 'high',
        onStore: next => { store = next; } }), '原工具与网页资料已处理。');
    });
    assert.equal(mainCalls, 2);
    assert.deepEqual(fixture.events, enabled ? ['planner', 'search', 'fetch', 'main', 'mcp-function', 'main'] : ['main', 'mcp-function', 'main']);
    const saved = store.messages[conversation.id].at(-1);
    assert.equal(saved.status, 'sent'); assert.equal(saved.meta.toolMode, true);
    assert.equal(saved.meta.toolTrace.calls[0].toolName, 'existing_lookup');
    assert.equal(saved.meta.toolTrace.calls[0].status, 'success');
    assert.equal(saved.meta.toolTrace.resumeState, undefined);
    assert.equal(JSON.stringify(store).includes('WEB_REFERENCE_MARKER'), false);
  }
});

test('real roundtable preserves JSON replies and counts external reference tokens in its existing budget', async () => {
  const budgets = [], referenceTokens = [];
  for (const enabled of [false, true]) {
    const fixture = await loadChatModules(enabled);
    const conversation = { id: 'group-integration', type: 'group', memberIds: [character.id],
      groupSettings: { autoBotChat: true, idleTalk: false, botAtMentionTriggersReply: false } };
    const initial = initialStore(conversation);
    let store = initial;
    await withFetch(fixture.fetcher(({ body }) => {
      assertReference(body, enabled);
      assert.equal(body.temperature, 0.82); assert.equal(body.stream, true); assert.equal(body.tools, undefined);
      assert.ok(body.messages[0].content.includes('只输出 JSON'));
      assert.equal(body.response_format, undefined);
      const userContext = JSON.parse(body.messages.at(-1).content.slice(body.messages.at(-1).content.indexOf('{')));
      assert.equal(userContext.playerInput, playerText);
      const reference = body.messages.find(message => String(message.content).includes('WEB_REFERENCE_MARKER'));
      referenceTokens.push(reference ? fixture.groupChat.estimateTokens(reference.content) : 0);
      return Response.json({ choices: [{ message: { content: JSON.stringify({ text: '@分析员 已查到资料，可以继续聊啦。', targetId: 'player',
        intent: 'answer', emotion: 'happy', wantsFollowUp: false, suggestedFollowUpTargetId: '', topicHint: '查询资料' }) } }] });
    }), async () => {
      store = await fixture.groupChat.runRoundtableTurn({ store, conversation, characters: [character], triggerText: playerText,
        triggerMessageId: player.id, chatSettings: fixture.settings, reasoningEffort: 'high' });
    });
    const saved = store.messages[conversation.id].at(-1);
    assert.equal(saved.status, 'sent'); assert.equal(saved.text, '@分析员 已查到资料，可以继续聊啦。');
    assert.equal(saved.meta.targetId, 'player'); assert.equal(saved.meta.intent, 'answer');
    assert.equal(saved.meta.toolMode, undefined); assert.equal(fixture.groupChat.getRoundtableError(), null);
    assert.equal(JSON.stringify(store).includes('WEB_REFERENCE_MARKER'), false);
    assert.deepEqual(Object.keys(store).sort(), Object.keys(initial).sort());
    assert.equal(fixture.requests.length, enabled ? 4 : 1);
    const budget = fixture.groupChat.getBudgetState();
    assert.equal(budget.total, 1); assert.equal(budget.hardLimited, false);
    budgets.push(budget.tokenTotal);
  }
  assert.equal(budgets[1] - budgets[0], referenceTokens[1]);
});

test('optional web references that exceed the roundtable budget yield to the existing JSON reply', async () => {
  const budgets = [];
  for (const enabled of [false, true]) {
    const fixture = await loadChatModules(enabled, { tokenHardLimit: 2000 });
    const conversation = { id: 'group-budget-boundary', type: 'group', memberIds: [character.id], groupSettings: { autoBotChat: true, idleTalk: false } };
    let store = initialStore(conversation);
    await withFetch(fixture.fetcher(({ body }) => {
      // The same page fixtures fit the normal budget above; at this boundary
      // retrieval completes but its optional context must leave the reply room.
      assertReference(body, false);
      return Response.json({ choices: [{ message: { content: JSON.stringify({ text: '@分析员 继续原来的聊天吧。', targetId: 'player',
        intent: 'answer', emotion: 'neutral', wantsFollowUp: false, suggestedFollowUpTargetId: '', topicHint: '原聊天' }) } }] });
    }), async () => {
      store = await fixture.groupChat.runRoundtableTurn({ store, conversation, characters: [character], triggerText: playerText,
        triggerMessageId: player.id, chatSettings: fixture.settings, reasoningEffort: 'high' });
    });
    const saved = store.messages[conversation.id].at(-1);
    assert.equal(saved.status, 'sent'); assert.equal(saved.text, '@分析员 继续原来的聊天吧。');
    assert.equal(saved.meta.fallback, false); assert.equal(fixture.groupChat.getRoundtableError(), null);
    assert.equal(fixture.requests.filter(request => request.url.endsWith('/tools/search')).length, enabled ? 1 : 0);
    assert.equal(fixture.requests.filter(request => request.url.endsWith('/tools/fetch')).length, enabled ? 1 : 0);
    const budget = fixture.groupChat.getBudgetState();
    assert.equal(budget.total, 1); assert.equal(budget.hardLimited, false);
    budgets.push(budget.tokenTotal);
  }
  assert.equal(budgets[1], budgets[0]);
});
