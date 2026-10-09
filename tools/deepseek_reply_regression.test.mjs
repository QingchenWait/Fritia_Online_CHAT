import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyModelReasoningBody } from '../src/js/model_reasoning.js';
import { requestLlmCompletion } from '../src/js/llm_request.js';

const provider = { id: 'deepseek', apiKey: 'fixture-only', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash' };
const messages = [{ role: 'system', content: '角色设定：直接回复用户。' }, { role: 'user', content: '走吧走吧' }];
const settings = { ...provider, chatProviders: [provider], defaultChatProviderId: provider.id, defaultImageCaptionProviderId: provider.id, temperature: 0.8 };

test('only official DeepSeek max uses native streaming and a direct-answer instruction', () => {
  const body = { messages, stream: false, temperature: 0.8 }, before = structuredClone(body);
  const next = applyModelReasoningBody(provider, 'max', body);
  assert.equal(next.reasoning_effort, 'max'); assert.deepEqual(next.thinking, { type: 'enabled' });
  assert.equal(next.stream, true); assert.equal(next.response_format, undefined);
  assert.ok(next.messages[0].content.includes('不要再附加'));
  assert.ok(next.messages[0].content.includes('用户明确要求的分析'));
  assert.deepEqual(body, before);
  for (const effort of ['disabled', 'low', 'high']) {
    const unchanged = applyModelReasoningBody(provider, effort, body);
    assert.equal(unchanged.stream, false); assert.equal(unchanged.messages, messages);
  }
  for (const other of [{ ...provider, baseUrl: 'https://gateway.fixture.test/v1' }, { ...provider, model: 'grok-4.7' }]) {
    assert.equal(applyModelReasoningBody(other, 'max', body).messages, messages);
  }
});

test('plain content succeeds with no reply JSON contract or text filtering', async () => {
  const original = globalThis.fetch;
  const reply = '嗯，这就出发。\n点评这家店的小笼包：汤汁很足。';
  let wire, metadata;
  globalThis.fetch = async (url, options) => {
    wire = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: reply, reasoning_content: 'INTERNAL_ONLY' } }] });
  };
  try {
    assert.equal(await requestLlmCompletion({ settings, messages, reasoningEffort: 'max', onCompletion: value => { metadata = value; } }), reply);
    assert.equal(wire.reasoning_effort, 'max'); assert.equal(wire.stream, true);
    assert.equal(wire.response_format, undefined);
    assert.equal(wire.messages.some(message => message.content.includes('只有 reply 一个字段')), false);
    assert.equal(wire.max_tokens, undefined); assert.equal(wire.max_completion_tokens, undefined);
    assert.equal(metadata.reasoning_content, 'INTERNAL_ONLY');
  } finally { globalThis.fetch = original; }
});

test('empty JSON content retains the original complete response fallback', async () => {
  const original = globalThis.fetch;
  const payload = { choices: [{ message: { content: '', reasoning_content: 'AVAILABLE_RAW_RESPONSE' }, finish_reason: 'length' }], usage: { completion_tokens: 12 } };
  globalThis.fetch = async () => Response.json(payload);
  try {
    assert.equal(await requestLlmCompletion({ settings, messages, reasoningEffort: 'max' }), JSON.stringify(payload));
  } finally { globalThis.fetch = original; }
});

function stream(data) {
  const bytes = new TextEncoder().encode(data);
  return new Response(new ReadableStream({ start(controller) {
    for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7));
    controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
}

test('native content and reasoning stay separate across split Chinese bytes', async () => {
  const original = globalThis.fetch;
  let metadata;
  const chunks = [
    { choices: [{ delta: { reasoning_content: 'INTERNAL_ONLY' } }] },
    { choices: [{ delta: { content: '嗯，' } }] },
    { choices: [{ delta: { reasoning_content: 'INTERNAL_MORE' } }] },
    { choices: [{ delta: { content: '这就出发。' } }] }
  ];
  globalThis.fetch = async () => stream(chunks.map(value => `data: ${JSON.stringify(value)}\n\n`).join('') + 'data: [DONE]\n\n');
  try {
    assert.equal(await requestLlmCompletion({ settings, messages, reasoningEffort: 'max', onCompletion: value => { metadata = value; } }), '嗯，这就出发。');
    assert.equal(metadata.reasoning_content, 'INTERNAL_ONLYINTERNAL_MORE'); assert.equal(metadata.content, '嗯，这就出发。');
  } finally { globalThis.fetch = original; }
});

test('non-JSON text and thinking-only streams retain fallback rather than new format errors', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('标为 JSON 的普通文本也保留', { headers: { 'Content-Type': 'application/json' } });
    assert.equal(await requestLlmCompletion({ settings, messages, reasoningEffort: 'max' }), '标为 JSON 的普通文本也保留');
    globalThis.fetch = async () => stream('data: 普通回复并非 JSON\n\ndata: [DONE]\n\n');
    assert.equal(await requestLlmCompletion({ settings, messages, reasoningEffort: 'max' }), '普通回复并非 JSON');
    globalThis.fetch = async () => stream('data: {"choices":[{"delta":{"reasoning_content":"AVAILABLE_RAW_RESPONSE"}}]}\n\ndata: [DONE]\n\n');
    const fallback = await requestLlmCompletion({ settings, messages, reasoningEffort: 'max' });
    assert.equal(JSON.parse(fallback).choices[0].message.reasoning_content, 'AVAILABLE_RAW_RESPONSE');
  } finally { globalThis.fetch = original; }
});

test('existing tool definitions, requested formats and real API errors keep their behavior', async () => {
  const original = globalThis.fetch;
  let wire;
  globalThis.fetch = async (url, options) => { wire = JSON.parse(options.body); return Response.json({ choices: [{ message: { content: '普通回复' } }] }); };
  try {
    for (const body of [{ response_format: { type: 'json_object' } }, { tools: [{ type: 'function', function: { name: 'lookup' } }] }]) {
      assert.equal(await requestLlmCompletion({ settings, messages, body, reasoningEffort: 'max' }), '普通回复');
      assert.deepEqual(wire.tools, body.tools); assert.deepEqual(wire.response_format, body.response_format);
    }
    globalThis.fetch = async () => Response.json({ error: { message: 'invalid API key' } }, { status: 401 });
    await assert.rejects(requestLlmCompletion({ settings, messages, reasoningEffort: 'max' }), /API 请求失败 \(401\)/);
  } finally { globalThis.fetch = original; }
});
