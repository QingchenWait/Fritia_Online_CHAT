import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHAT_PROVIDER_PRESETS, getProviderPresetForUrl, buildMimoTtsSyncPatch } from '../src/js/model_provider_presets.js';
import { normalizeSettings } from '../src/js/settings.js';

test('all requested presets keep exact names, endpoints and model IDs', () => {
  assert.deepEqual(CHAT_PROVIDER_PRESETS.map(({ key, id, baseUrl, model }) => [key, id, baseUrl, model]), [
    ['deepseek', 'DeepSeek', 'https://api.deepseek.com/v1', 'deepseek-flash'],
    ['mimo', 'MiMO', 'https://api.xiaomimimo.com/v1', 'mimo-v2.6-flash'],
    ['qwen', 'Qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen3.8-flash'],
    ['openai', 'OpenAI', 'https://api.openai.com/v1', 'gpt-6-luna'],
    ['glm', 'GLM', 'https://open.bigmodel.cn/api/paas/v4', 'glm-5.3-flash'],
    ['kimi', 'Kimi', 'https://api.moonshot.cn/v1', 'kimi-k3'],
    ['local', 'LM Studio', 'http://localhost:1234/v1', ''],
    ['custom', 'custom', 'https://api.openai.com/v1', 'gpt-6-luna']
  ]);
});

test('key links match parsed hostnames, including unsaved URLs and local endpoints', () => {
  const links = [
    'https://platform.deepseek.com/api_keys',
    'https://platform.xiaomimimo.com/console/api-keys',
    'https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key',
    'https://platform.openai.com/api-keys',
    'https://bigmodel.cn/apikey/platform',
    'https://platform.kimi.com/console/api-keys',
    'https://lmstudio.ai/'
  ];
  CHAT_PROVIDER_PRESETS.slice(0, 7).forEach((preset, index) => {
    assert.equal(getProviderPresetForUrl(`  ${preset.baseUrl}/  `).website, links[index]);
  });
  for (const baseUrl of ['http://localhost:1234/v1', 'http://127.0.0.1:8080/v1', 'http://[::1]:1234/v1']) assert.equal(getProviderPresetForUrl(baseUrl).key, 'local');
  for (const value of ['', 'api.deepseek.com', 'not a URL', 'https://api.deepseek.com.evil.test/v1', 'https://unknown.test/?model=deepseek', 'javascript:alert(1)', 'https://api.deepseek.com@unknown.test/v1']) assert.equal(getProviderPresetForUrl(value), null);
});

test('LM Studio name and empty model survive normalization and default selection', () => {
  const local = CHAT_PROVIDER_PRESETS.find(item => item.key === 'local');
  const settings = normalizeSettings({ chatProviders: [{ ...local, apiKey: '' }, { ...local, apiKey: '' }], defaultChatProviderId: 'LM Studio', defaultImageCaptionProviderId: 'LM Studio' });
  assert.equal(settings.chatProviders[0].id, 'LM Studio');
  assert.equal(settings.chatProviders[1].id, 'LM Studio-2');
  assert.equal(settings.chatProviders[0].model, '');
  assert.equal(settings.defaultChatProviderId, 'LM Studio');
  assert.equal(settings.defaultImageCaptionProviderId, 'LM Studio');
  assert.equal(normalizeSettings({ chatProviders: [{ id: 'existing name', baseUrl: 'https://api.openai.com/v1', model: '' }] }).chatProviders[0].model, 'gpt-6-luna');
  assert.equal(normalizeSettings({ chatProviders: [{ id: 'existing name' }] }).chatProviders[0].id, 'existing-name');
});

const mimo = { id: 'MiMO', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.6-flash', apiKey: 'chat-key' };
const tts = { id: 'mimo-tts', baseUrl: mimo.baseUrl, model: 'mimo-v2.5-tts-voiceclone', apiKey: 'separate-tts-key', speed: 1.25 };

test('saving a changed MiMO chat key copies only the chosen TTS credential', () => {
  const second = { ...tts, id: 'mimo-tts-2', apiKey: 'other-key' };
  const settings = { ttsProviders: [tts, second], defaultTtsProviderId: second.id };
  const before = structuredClone(settings);
  const patch = buildMimoTtsSyncPatch(settings, { ...mimo, apiKey: 'old-key' }, mimo);
  assert.deepEqual(patch.ttsProviders[0], tts);
  assert.deepEqual(patch.ttsProviders[1], { ...second, apiKey: 'chat-key' });
  assert.deepEqual(settings, before);
  assert.equal('defaultTtsProviderId' in patch, false);
});

test('TTS overrides stay independent when saving unchanged chat keys or unrelated settings', () => {
  const settings = { ttsProviders: [tts], defaultTtsProviderId: tts.id };
  assert.deepEqual(buildMimoTtsSyncPatch(settings, mimo, { ...mimo, model: 'mimo-v2.6-pro' }), {});
  assert.deepEqual(buildMimoTtsSyncPatch(settings, mimo, { ...mimo, apiKey: '' }), {});
  assert.deepEqual(buildMimoTtsSyncPatch(settings, mimo, { ...mimo, baseUrl: 'https://unknown.test/v1', apiKey: 'different' }), {});
  assert.deepEqual(buildMimoTtsSyncPatch(settings, mimo, { ...mimo, apiKey: 'new-chat-key' }).ttsProviders[0], { ...tts, apiKey: 'new-chat-key' });
});

test('MiMO TTS is created when absent without changing unrelated providers or defaults', () => {
  const other = { ...tts, baseUrl: 'https://other.test/v1', model: 'other-tts' };
  const settings = { ttsProviders: [other], defaultTtsProviderId: other.id };
  const patch = buildMimoTtsSyncPatch(settings, null, mimo);
  assert.equal(patch.ttsProviders.length, 2);
  assert.deepEqual(patch.ttsProviders[0], other);
  assert.equal(patch.ttsProviders[1].id, 'mimo-tts-2');
  assert.equal(patch.ttsProviders[1].apiKey, mimo.apiKey);
  assert.equal('defaultTtsProviderId' in patch, false);
});
