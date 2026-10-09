import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getModelReasoningProfile, loadModelReasoningProfile, applyModelReasoningBody } from '../src/js/model_reasoning.js';
import { prepareAttachmentRequest } from '../src/js/attachment_inputs.js';
import { markFailedTurn, filterFailedTurnHistory, persistentChatStore } from '../src/js/failed_turns.js';
import { isAttachmentErrorMessage } from '../src/js/attachment_state.js';

const provider = { id: 'Grok', baseUrl: 'https://api.x.ai/v1', model: 'grok-4.7', apiKey: 'fixture-only' };

test('Grok 4.7 supports exactly four efforts without disabling reasoning', () => {
  const profile = getModelReasoningProfile(provider);
  assert.deepEqual(profile.options.map(option => option.value), ['low', 'medium', 'high', 'xhigh']);
  assert.equal(profile.defaultValue, 'high');
  for (const effort of ['low', 'medium', 'high', 'xhigh']) {
    const body = applyModelReasoningBody(provider, effort, { temperature: 0.8, presence_penalty: 1, frequency_penalty: 1, stop: ['end'] });
    assert.deepEqual(body, { temperature: 0.8, reasoning_effort: effort });
  }
  assert.equal(applyModelReasoningBody(provider, 'none', {}).reasoning_effort, 'high');
});

test('custom capabilities object reproduces screenshot and every metadata type is safe', async () => {
  const original = globalThis.fetch;
  const shapes = [undefined, null, {}, { reasoning: true }, { reasoning: false }, { reasoning: { supported: true } }, ['Reasoning'], 'Vision, Reasoning', 7, false];
  globalThis.fetch = async () => Response.json({ data: shapes.map((capabilities, index) => ({ id: `custom-${index}`, capabilities })) });
  try {
    for (let index = 0; index < shapes.length; index++) {
      const settings = { ...provider, baseUrl: 'https://metadata.fixture.test/v1', model: `custom-${index}` };
      const profile = await loadModelReasoningProfile(settings);
      assert.equal(profile.options[0].label, [3, 5, 6, 7].includes(index) ? '思考（API 默认）' : '默认');
      assert.doesNotThrow(() => applyModelReasoningBody(settings, 'default', {}));
    }
  } finally { globalThis.fetch = original; }
});

test('only explicitly registered current-turn IDs are excluded from persistence and context', () => {
  const normal = { id: 'normal', role: 'assistant', status: 'sent', text: '讨论 API 请求失败和 error 的解决办法' };
  const legacy = { id: 'legacy-error', role: 'assistant', status: 'error', text: '历史错误', attachments: [{ dataRef: 'keep' }] };
  const user = { id: 'new-user', role: 'user', attachments: [{ dataRef: 'new-file' }] };
  const error = { id: 'new-error', role: 'assistant', status: 'error' };
  const store = { messages: { 'case-a': [normal, legacy, user, error], 'case-b': [user, normal] } };
  const before = structuredClone(store);
  markFailedTurn('case-a', [user.id, error.id]);
  assert.deepEqual(persistentChatStore(store).messages['case-a'], [normal, legacy]);
  assert.deepEqual(filterFailedTurnHistory(store.messages['case-a'], 'case-a'), [normal, legacy]);
  assert.deepEqual(persistentChatStore(store).messages['case-b'], [user, normal]);
  assert.deepEqual(store, before, 'runtime bubbles and original attachments remain intact');
});

test('native Grok audio uses documented STT multipart format and cached transcription', async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return Response.json({ text: '音频测试内容', duration: 1 });
  };
  try {
    const messages = [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: btoa('fixture-audio'), format: 'wav' } }] }];
    for (let index = 0; index < 2; index++) {
      const prepared = await prepareAttachmentRequest(messages, provider);
      assert.deepEqual(prepared.messages[0].content, [{ type: 'text', text: '音频 "附件" 的转写：\n音频测试内容' }]);
    }
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://api.x.ai/v1/stt');
    assert.equal(requests[0].options.headers.Authorization, 'Bearer fixture-only');
    assert.deepEqual([...requests[0].options.body.keys()], ['model', 'file']);
    assert.equal(requests[0].options.body.get('model'), 'grok-voice-transcribe-2.0');
    assert.equal(await requests[0].options.body.get('file').text(), 'fixture-audio');
    assert.equal(requests[0].options.headers['Content-Type'], undefined, 'browser owns multipart boundary');
  } finally { globalThis.fetch = original; }
});

test('confirmed normal JSON error examples are not mistaken for failed API replies', () => {
  const message = { role: 'assistant', status: 'sent', text: '{"error":{"message":"file type is not supported"}}' };
  assert.equal(isAttachmentErrorMessage({ ...message, meta: { modelReplySucceeded: true } }), false);
  assert.equal(isAttachmentErrorMessage(message), true, 'legacy error compatibility is retained');
});
