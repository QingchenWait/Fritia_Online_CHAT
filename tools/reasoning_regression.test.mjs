import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { test } from 'node:test';
import * as reasoning from '../src/js/model_reasoning.js';
import * as responses from '../src/js/openai_responses.js';
import { requestLlmCompletion } from '../src/js/llm_request.js';
import { assertModelResponse } from '../src/js/attachment_state.js';
import * as failedTurns from '../src/js/failed_turns.js';

const provider = { id: 'test', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: 'test-only' };
const settings = { ...provider, temperature: 0.8 };

test('documented model efforts and request protocols', () => {
  for (const model of ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-pro']) {
    assert.deepEqual(reasoning.getModelReasoningProfile({ model }).options.map(x => x.value), ['disabled', 'low', 'high', 'max']);
    assert.deepEqual(reasoning.buildModelReasoningBody({ model }, 'high'), { thinking: { type: 'enabled' }, reasoning_effort: 'high' });
  }
  for (const model of ['gpt-6-astra', 'gpt-6.1-sol']) {
    assert.deepEqual(reasoning.getModelReasoningProfile({ model }).options.map(x => x.value), ['low', 'medium', 'high', 'xhigh', 'max']);
    assert.equal('temperature' in reasoning.applyModelReasoningBody({ model }, 'high', { temperature: 0.8 }), false);
  }
  assert.equal(reasoning.getModelReasoningProfile({ model: 'gpt-6-sol' }).options[0].value, 'none');
  assert.deepEqual(reasoning.buildModelReasoningBody({ model: 'mimo-v2.6-flash' }, 'enabled'), { thinking: { type: 'enabled' } });
  assert.deepEqual(reasoning.buildModelReasoningBody({ model: 'unknown' }, 'high'), {});
});

test('catalog discovery: exact efforts, mandatory thinking, switch, failure and account isolation', async () => {
  const savedFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return Response.json({ data: [
      { id: 'future-1', reasoning: { supported_efforts: ['max', 'low'], mandatory: true } },
      { id: 'future-2', reasoning: { mandatory: false } },
      { id: 'future-3', supported_parameters: ['reasoning'] }
    ] });
  };
  try {
    const base = { baseUrl: 'https://catalog.test/v1', apiKey: 'account-a' };
    await Promise.all(['future-1', 'future-2', 'future-3'].map(model => reasoning.loadModelReasoningProfile({ ...base, model })));
    assert.equal(requests, 1);
    assert.deepEqual(reasoning.getModelReasoningProfile({ ...base, model: 'future-1' }).options.map(x => x.value), ['low', 'max']);
    assert.deepEqual(reasoning.buildModelReasoningBody({ ...base, model: 'future-1' }, 'max'), { reasoning: { effort: 'max' } });
    assert.deepEqual(reasoning.buildModelReasoningBody({ ...base, model: 'future-2' }, 'enabled'), { reasoning: { enabled: true } });
    assert.equal(reasoning.getModelReasoningProfile({ ...base, model: 'future-3' }).options[0].value, 'default');
    globalThis.fetch = async () => { throw new Error('No metadata endpoint'); };
    const unavailable = { ...base, apiKey: 'account-b', model: 'future-1' };
    assert.equal((await reasoning.loadModelReasoningProfile(unavailable)).id, 'default');
    assert.equal((await reasoning.loadModelReasoningProfile({ ...unavailable, model: 'deepseek-flash' })).id, 'deepseek-v4');
  } finally {
    globalThis.fetch = savedFetch;
  }
});

function streamResponse(deltas, { tail = false } = {}) {
  const wire = ': keepalive\nevent: message\n' + deltas.map(delta => `data: ${JSON.stringify({ choices: [{ delta }] })}`).join('\r\n\r\n') + (tail ? '' : '\n\ndata: [DONE]\n\n');
  const bytes = new TextEncoder().encode(wire);
  return new Response(new ReadableStream({ start(controller) {
    // Split JSON and multibyte Chinese characters across transport chunks.
    for (let i = 0; i < bytes.length; i += 17) controller.enqueue(bytes.slice(i, i + 17));
    controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
}

async function loadToolEngine(fetcher, overrides = {}) {
  let id = 0;
  const stubs = {
    appendMessage: (store, conversationId, message) => ({ ...store, messages: [...store.messages, message] }),
    replaceMessage: (store, conversationId, messageId, patch) => ({ ...store, messages: store.messages.map(message => message.id === messageId ? { ...message, ...patch } : message) }),
    createId: () => `test-${++id}`, now: () => Date.now(), getConversationMessages: store => store.messages,
    getDefaultChatProvider: () => provider, getSettings: () => settings, getAdvancedSettings: () => ({ historyLimit: 24 }),
    buildRagReferenceMessage: async () => null, buildLongTermMemoryMessage: async () => null,
    recordLongTermMemoryTurn: () => {}, buildDeepSeekIntimateUserMessage: async () => null,
    shouldKeepMessageForCurrentDeepSeekMode: () => true, buildModelMessageContent: async ({ text }) => text,
    filterAttachmentHistory: async history => history, isAttachmentErrorMessage: () => false,
    assertModelResponse,
    requestWithAttachments: async (messages, provider, options, request) => request(messages, { files: [] }),
    saveDataUrlAsMedia: () => { throw new Error('Unexpected media write'); },
    collectMcpToolDefinitions: async () => ({
      tools: [{ type: 'function', function: { name: 'lookup', parameters: { type: 'object' } } }],
      registry: { lookup: { toolName: 'lookup', client: { name: 'test' } } },
      permissions: { completeToolResultReply: true }
    }),
    callMcpToolByRegistryEntry: async () => ({ content: [{ type: 'text', text: '42' }] }),
    formatMcpContentText: () => '42', getMcpConfig: () => ({ permissions: { completeToolResultReply: true } }),
    isLmStudioSettings: () => false, isLmStudioProvider: () => false, requestLmStudioCompletion: () => {},
    ...reasoning, ...responses, ...failedTurns, ...overrides
  };
  const source = await readFile(new URL('../src/js/tool_chat_engine.js', import.meta.url), 'utf8');
  const imports = new Map([...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)]
    .map(match => [match[2], match[1].split(',').map(x => x.trim())]));
  const module = new SourceTextModule(source + '\nexport { readStreamingCompletion, extractJsonCompletion, compactResumeMessages };');
  await module.link(specifier => {
    const names = imports.get(specifier);
    return new SyntheticModule(names, function () { names.forEach(name => this.setExport(name, stubs[name])); });
  });
  await module.evaluate();
  const savedFetch = globalThis.fetch;
  globalThis.fetch = fetcher;
  return { engine: module.namespace, restore: () => { globalThis.fetch = savedFetch; } };
}

test('stream/JSON preserve full reasoning, structured blocks and unterminated last event', async () => {
  const { engine, restore } = await loadToolEngine();
  try {
    const secret = '完整思考'.repeat(2000);
    const result = await engine.readStreamingCompletion(streamResponse([
      { reasoning_content: secret, reasoning_details: [{ index: 0, type: 'reasoning.encrypted', data: 'abc' }] },
      { reasoning_content: '末尾', reasoning_details: [{ index: 0, type: 'reasoning.encrypted', data: 'def' }], content: '答案' }
    ], { tail: true }));
    assert.equal(result.reasoning_content, secret + '末尾');
    assert.equal(result.reasoning_details[0].data, 'abcdef');
    assert.equal(result.content, '答案');
    assert.equal(engine.extractJsonCompletion({ choices: [{ message: { reasoning_content: '', content: 'OK' } }] }).reasoning_content, '');
    assert.equal(engine.compactResumeMessages([{ role: 'assistant', ...result }])[0].reasoning_content, secret + '末尾');
  } finally { restore(); }
});

test('real tool loop sends reasoning with tool results and intermediate replies', async () => {
  const requests = [];
  const secret = '必须完整回传'.repeat(1500);
  const { engine, restore } = await loadToolEngine(async (url, init) => {
    const request = JSON.parse(init.body);
    requests.push(request);
    if (requests.length === 1) return streamResponse([
      { reasoning_content: secret },
      { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{"q":' } }] },
      { tool_calls: [{ index: 0, function: { arguments: '"test"}' } }] }
    ]);
    const previous = request.messages.find(message => message.tool_calls?.length);
    assert.equal(previous.reasoning_content, secret);
    assert.equal(request.messages.find(message => message.role === 'tool').tool_call_id, 'call-1');
    if (requests.length === 2) {
      return Response.json({ choices: [{ message: { role: 'assistant', content: '我继续查询', reasoning_content: '中间思考' } }] });
    }
    assert.equal(request.messages.find(message => message.content === '我继续查询').reasoning_content, '中间思考');
    return Response.json({ choices: [{ message: { role: 'assistant', content: '结果为 42。', reasoning_content: '已完成' } }] });
  });
  try {
    let store = { messages: [] };
    const args = { conversation: { id: 'chat' }, character: { id: 'bot', name: '角色' }, text: '查询', selectedClientIds: ['test'], reasoningEffort: 'high', onStore: next => { store = next; } };
    assert.equal(await engine.completeToolPrivateMessageReply({ ...args, store }), '结果为 42。');
    assert.equal(store.messages.at(-1).status, 'sent');
    assert.equal(store.messages.at(-1).meta.reasoning.reasoning_content, '已完成');
    assert.equal(requests.every(request => request.thinking.type === 'enabled' && request.reasoning_effort === 'high'), true);
  } finally { restore(); }
});

test('provider-specific metadata uses documented endpoints and fields', async () => {
  const savedFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push([url, options]);
    if (url.includes('deepseek.com')) return Response.json({ data: [{ id: 'future-deepseek', effort: { supported_levels: ['low', 'high', 'max', 'ultra'] } }] });
    if (url.includes('moonshot.ai')) return Response.json({ data: [{ id: 'future-kimi', supports_reasoning: true }, { id: 'kimi-k2.6', supports_reasoning: false }] });
    return Response.json({ output: { models: [{ model: 'future-qwen', capabilities: ['Reasoning'], model_info: { max_reasoning_tokens: 32768 } }] } });
  };
  try {
    const deepseek = { ...provider, model: 'future-deepseek' };
    assert.deepEqual((await reasoning.loadModelReasoningProfile(deepseek)).options.map(x => x.value), ['disabled', 'low', 'high', 'max', 'ultra']);
    assert.deepEqual(reasoning.buildModelReasoningBody(deepseek, 'ultra'), { thinking: { type: 'enabled' }, reasoning_effort: 'ultra' });
    const kimi = { ...provider, baseUrl: 'https://api.moonshot.ai/v1', model: 'future-kimi' };
    assert.equal((await reasoning.loadModelReasoningProfile(kimi)).options[0].label, '思考（API 默认）');
    assert.equal(reasoning.getModelReasoningProfile({ ...kimi, model: 'kimi-k2.6' }).id, 'catalog-no-reasoning');
    const qwen = { ...provider, baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', model: 'future-qwen' };
    assert.equal((await reasoning.loadModelReasoningProfile(qwen)).options[0].label, '思考（API 默认）');
    assert.equal(requests.at(-1)[0], 'https://dashscope-intl.aliyuncs.com/api/v1/models?model=future-qwen&page_size=100');
    assert.deepEqual(reasoning.buildModelReasoningBody({ ...qwen, model: 'qwen3.8-max' }, 'medium'), { enable_thinking: true, reasoning_effort: 'medium' });
    assert.deepEqual(reasoning.buildModelReasoningBody({ ...qwen, model: 'qwen3-235b-a22b-thinking-2507' }, 'disabled'), {});
    assert.deepEqual(reasoning.buildModelReasoningBody({ ...qwen, model: 'qwen3-32b' }, 'enabled'), { enable_thinking: true });
    assert.deepEqual(reasoning.buildModelReasoningBody({ model: 'glm-4.7' }, 'disabled'), { thinking: { type: 'disabled' } });
    assert.deepEqual(reasoning.getModelReasoningProfile({ model: 'glm-5.3' }).options.map(x => x.value), ['low', 'high', 'max']);
    assert.deepEqual(reasoning.getModelReasoningProfile({ model: 'kimi-k3' }).options.map(x => x.value), ['low', 'high', 'max']);
    assert.equal(requests.every(([, options]) => options.headers.Authorization === 'Bearer test-only'), true);
  } finally { globalThis.fetch = savedFetch; }
});

test('successful tool reply survives a later memory storage failure', async () => {
  let store = { messages: [] };
  const { engine, restore } = await loadToolEngine(async () => Response.json({ choices: [{ message: { content: '有效的正常回复' } }] }), {
    recordLongTermMemoryTurn: () => { throw new Error('fixture memory write failure'); }
  });
  try {
    await assert.rejects(engine.completeToolPrivateMessageReply({ store, conversation: { id: 'memory-failure-fixture' },
      character: { id: 'bot', name: '角色' }, text: '正常输入', onStore: next => { store = next; } }), /memory write failure/);
    assert.equal(store.messages.at(-1).status, 'sent');
    assert.equal(store.messages.at(-1).text, '有效的正常回复');
    assert.equal(failedTurns.isFailedTurnMessage(store.messages.at(-1), 'memory-failure-fixture'), false);
  } finally { restore(); }
});

test('resume snapshots keep tool call boundaries and complete JSON arguments', async () => {
  const { engine, restore } = await loadToolEngine();
  try {
    const argumentsJson = JSON.stringify({ text: '长参数'.repeat(4000) });
    const messages = [
      { role: 'user', content: 'test' },
      { role: 'assistant', reasoning_content: 'thought', tool_calls: [{ id: 'a', function: { name: 'lookup', arguments: argumentsJson } }] },
      ...Array.from({ length: 36 }, () => ({ role: 'tool', tool_call_id: 'a', content: 'result' }))
    ];
    const snapshot = engine.compactResumeMessages(messages);
    assert.equal(snapshot[0].role, 'assistant');
    assert.equal(snapshot[0].tool_calls[0].function.arguments, argumentsJson);
  } finally { restore(); }
});

test('GPT-6 Responses adapter preserves encrypted reasoning and tool sequence', async () => {
  const savedFetch = globalThis.fetch;
  const gpt = { ...provider, baseUrl: 'https://api.openai.com/v1', model: 'gpt-6-astra' };
  const tools = [{ type: 'function', function: { name: 'lookup', parameters: { type: 'object', properties: {} } } }];
  const output = [
    { type: 'reasoning', id: 'rs-1', summary: [], encrypted_content: 'opaque encrypted bytes' },
    { type: 'function_call', id: 'fc-1', call_id: 'call-1', name: 'lookup', arguments: '{}' }
  ];
  const requests = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(init.body); requests.push(body);
    assert.equal(body.reasoning.effort, 'high');
    assert.equal(body.store, false);
    assert.deepEqual(body.include, ['reasoning.encrypted_content']);
    assert.equal(body.tools[0].name, 'lookup');
    assert.equal('temperature' in body, false);
    const data = { type: 'response.completed', response: { status: 'completed', output } };
    return new Response(`event: response.completed\ndata: ${JSON.stringify(data)}`, { headers: { 'Content-Type': 'text/event-stream' } });
  };
  try {
    assert.equal(responses.needsOpenAIResponses(gpt, 'high', tools), true);
    assert.equal(responses.needsOpenAIResponses({ ...gpt, model: 'gpt-6-sol' }, 'none', tools), false);
    assert.equal(responses.needsOpenAIResponses({ ...gpt, baseUrl: 'https://gateway.test/v1' }, 'high', tools), false);
    const args = { provider: gpt, tools, toolChoice: 'auto', reasoningEffort: 'high' };
    const completion = await responses.requestOpenAIResponses({ ...args, messages: [{ role: 'user', content: 'lookup' }] });
    assert.deepEqual(completion.responses_output, output);
    assert.equal(completion.toolCalls[0].id, 'call-1');
    await responses.requestOpenAIResponses({ ...args, messages: [
      { role: 'user', content: 'lookup' },
      { role: 'assistant', content: '', responses_output: completion.responses_output },
      { role: 'tool', tool_call_id: 'call-1', content: '42' }
    ] });
    assert.deepEqual(requests[1].input.slice(1, 3), output);
    assert.deepEqual(requests[1].input.at(-1), { type: 'function_call_output', call_id: 'call-1', output: '42' });
  } finally { globalThis.fetch = savedFetch; }
});

test('regular chat stores reasoning separately without changing its text response', async () => {
  const savedFetch = globalThis.fetch;
  let metadata;
  let sent;
  const chatSettings = { ...settings, chatProviders: [provider], defaultChatProviderId: 'test' };
  try {
    globalThis.fetch = async (url, init) => {
      sent = JSON.parse(init.body);
      return Response.json({ choices: [{ message: { content: '正常答复', reasoning_content: '完整思考' } }] });
    };
    assert.equal(await requestLlmCompletion({ settings: chatSettings, messages: [{ role: 'user', content: 'test' }], reasoningEffort: 'high', onCompletion: (message, usedProvider) => { metadata = { message, usedProvider }; } }), '正常答复');
    assert.equal(metadata.message.reasoning_content, '完整思考');
    assert.equal(metadata.usedProvider.model, provider.model);
    assert.equal(sent.reasoning_effort, 'high');
    globalThis.fetch = async () => streamResponse([{ reasoning_content: '流式思考' }, { content: '流式答复' }], { tail: true });
    assert.equal(await requestLlmCompletion({ settings: chatSettings, messages: [{ role: 'user', content: 'test' }], onCompletion: message => { metadata = message; } }), '流式答复');
    assert.equal(metadata.reasoning_content, '流式思考');
  } finally { globalThis.fetch = savedFetch; }
});
