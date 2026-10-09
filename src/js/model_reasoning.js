import { applyDeepSeekMaxReplyBoundary } from './deepseek_reply.js';

const LABELS = {
  default: '默认',
  enabled: '思考',
  disabled: '普通',
  none: '普通',
  minimal: '极简',
  low: '轻度',
  medium: '标准',
  high: '深度',
  xhigh: '超深度',
  max: '极限'
};

const MODEL_CATALOGS = new Map();
const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];

// /models is optional on compatible endpoints. Never infer a switch from the
// mere presence of reasoning output: some models cannot turn reasoning off.
export async function loadModelReasoningProfile(provider = {}) {
  if (!provider.baseUrl || !provider.model || !provider.apiKey) return getModelReasoningProfile(provider);
  const key = catalogKey(provider);
  let entry = MODEL_CATALOGS.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    entry = { models: entry?.models || [], expiresAt: Infinity, pending: null };
    MODEL_CATALOGS.set(key, entry);
    entry.pending = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const headers = { Authorization: `Bearer ${provider.apiKey}` };
        if (/xiaomimimo\.com$/i.test(new URL(provider.baseUrl).hostname)) headers['api-key'] = provider.apiKey;
        const response = await fetch(modelCatalogUrl(provider), {
          headers, signal: controller.signal, cache: 'no-store'
        });
        if (!response.ok) throw new Error('Model metadata unavailable');
        const catalog = await response.json();
        const models = Array.isArray(catalog.data) ? catalog.data : catalog.output?.models;
        if (!Array.isArray(models)) throw new Error('Invalid model catalog');
        entry.models = models.filter(model => model && typeof model === 'object');
        entry.expiresAt = Date.now() + 5 * 60 * 1000;
      } catch {
        entry.expiresAt = Date.now() + 30 * 1000;
      } finally {
        clearTimeout(timeout);
      }
    })();
  }
  await entry.pending;
  return getModelReasoningProfile(provider);
}

function catalogKey(provider) {
  return JSON.stringify([modelCatalogUrl(provider), provider.apiKey || '']);
}

function providerHost(provider) {
  try { return new URL(provider.baseUrl).hostname.toLowerCase(); } catch { return ''; }
}

function isBailianProvider(provider) {
  return /(?:^|\.)(?:dashscope(?:-intl|-us)?|maas)\.aliyuncs\.com$/.test(providerHost(provider));
}

function modelCatalogUrl(provider) {
  const base = String(provider.baseUrl || '').replace(/\/+$/, '');
  const host = providerHost(provider);
  // Use the configured region/workspace only; never send a key elsewhere.
  if (isBailianProvider(provider) && (host.includes('.maas.') || ['dashscope-intl.aliyuncs.com', 'cn-hongkong.dashscope.aliyuncs.com'].includes(host))) {
    return `${new URL(base).origin}/api/v1/models?model=${encodeURIComponent(provider.model)}&page_size=100`;
  }
  return `${base}/models`;
}

function catalogModel(provider) {
  return MODEL_CATALOGS.get(catalogKey(provider))?.models.find(item => (item.id || item.model) === provider.model);
}

function getCatalogProfile(provider) {
  const model = catalogModel(provider);
  if (Array.isArray(model?.effort?.supported_levels)) {
    const levels = [...new Set(model.effort.supported_levels.filter(value => typeof value === 'string' && value && value !== 'none' && value !== 'disabled'))];
    if (levels.length) return createProfile('deepseek-catalog', ['disabled', ...levels], 'disabled', 'deepseek');
  }
  if (model?.supports_reasoning === false) return createProfile('catalog-no-reasoning', ['default'], 'default', 'default');
  const reasoning = model?.reasoning;
  // This metadata and request schema are published by OpenRouter. Other
  // compatible endpoints may expose the same explicit schema.
  if (!reasoning || typeof reasoning !== 'object') return null;
  const efforts = reasoning.supported_efforts;
  if (Array.isArray(efforts) || efforts === null) {
    let values = efforts === null ? [...EFFORT_ORDER.filter(value => value !== 'ultra')] : [...new Set(efforts.filter(value => typeof value === 'string' && value))];
    if (reasoning.mandatory === true) values = values.filter(value => value !== 'none');
    else if (reasoning.mandatory === false && !values.includes('none')) values.unshift('none');
    values.sort((a, b) => (EFFORT_ORDER.indexOf(a) + 1 || 99) - (EFFORT_ORDER.indexOf(b) + 1 || 99));
    if (values.length) return createProfile('catalog-effort', values, values[0], 'reasoning');
  }
  if (reasoning.mandatory === false) return createProfile('catalog-thinking', ['disabled', 'enabled'], 'disabled', 'reasoning-enabled');
  if (reasoning.mandatory === true) return createProfile('catalog-mandatory', ['enabled'], 'enabled', 'reasoning-enabled');
  return null;
}

export function getModelReasoningProfile(provider = {}) {
  const catalogProfile = getCatalogProfile(provider);
  if (catalogProfile) return catalogProfile;
  const model = String(provider?.model || '').trim().toLowerCase();
  const baseUrl = String(provider?.baseUrl || '').trim().toLowerCase();
  const bailian = isBailianProvider(provider);
  const toggleMode = bailian ? 'enable-thinking' : 'thinking';
  const effortMode = bailian ? 'enable-thinking-effort' : 'deepseek';

  if (/(?:^|\/)grok-4\.[67](?:$|[-_])/.test(model)) {
    return createProfile('grok-4.7', ['low', 'medium', 'high', 'xhigh'], 'high');
  }
  if (/(?:^|\/)grok-4\.5(?:$|[-_])/.test(model)) {
    return createProfile('grok-4.5', ['low', 'medium', 'high'], 'high');
  }
  if (/(?:^|\/)grok-3-mini(?:$|[-_])/.test(model)) {
    return createProfile('grok-3-mini', ['low', 'high'], 'low');
  }
  if (/(?:^|\/)grok-4(?:$|[-_.])/.test(model)) {
    return createProfile('grok-mandatory', ['enabled'], 'enabled', 'default');
  }

  // Provider protocols differ even for the same hosted model ID. These are
  // documented fallbacks; exact API metadata above always wins.
  if (/glm-5\.3(?:$|[-_])/.test(model)) {
    return createProfile('glm-5.3', ['low', 'high', 'max'], 'low', effortMode);
  }
  if (/glm-5\.2(?:$|[-_])/.test(model) || (bailian && /glm-5(?:\.1)?(?:$|[-_])/.test(model))) {
    return createProfile('glm-5.2', ['disabled', 'high', 'max'], 'disabled', effortMode);
  }
  if (/glm-(?:4\.[567]|5(?:\.1)?)(?:v)?(?:$|[-_])/.test(model)) {
    return createProfile('glm-thinking', ['disabled', 'enabled'], 'disabled', toggleMode);
  }
  if (/kimi-k3(?:$|[-_])/.test(model)) {
    if (bailian) {
      const values = /^kimi\//.test(model) ? ['max'] : ['disabled', 'low', 'high', 'max'];
      return createProfile('bailian-kimi-k3', values, values[0], 'enable-thinking-effort');
    }
    return createProfile('kimi-k3', ['low', 'high', 'max'], 'low');
  }
  if (/kimi-k2\.7-code(?:$|[-_])|kimi-k2-thinking(?:$|[-_])/.test(model)) {
    return createProfile('kimi-mandatory', ['enabled'], 'enabled', 'default');
  }
  if (/kimi-k2\.[56](?:$|[-_])/.test(model)) {
    return createProfile('kimi-thinking', ['disabled', 'enabled'], 'disabled', toggleMode);
  }
  if (bailian && /(?:^|\/)qwen3\.8-(?:max|flash|2\.4t-a95b|27b)(?:$|[-_])/.test(model)) {
    return createProfile('qwen-effort', ['disabled', 'low', 'medium', 'xhigh'], 'disabled', 'enable-thinking-effort');
  }
  if (bailian && /(?:^|\/)(?:qwen3(?:\.[5-8])?[-_]|qwen-(?:plus|flash|turbo)(?:$|[-_])|qwq(?:$|[-_]))/.test(model)) {
    if (/thinking|qwq/.test(model)) return createProfile('qwen-mandatory', ['enabled'], 'enabled', 'default');
    if (!/instruct|coder|omni|captioner|tts|asr/.test(model)) {
      return createProfile('qwen-thinking', ['disabled', 'enabled'], 'disabled', 'enable-thinking');
    }
  }

  if (/deepseek-(?:v4|flash|pro)/.test(model)) {
    const values = bailian && !/v4\.1|0731|0813/.test(model) ? ['disabled', 'high', 'max'] : ['disabled', 'low', 'high', 'max'];
    return createProfile('deepseek-v4', values, 'disabled', effortMode);
  }
  if (/mimo-v2\.[56](?:-|$)/.test(model) && !/tts/.test(model)) {
    return createProfile('mimo-thinking', ['disabled', 'enabled'], 'disabled', toggleMode);
  }
  if (/gpt-6(?:\.1)?-(?:astra|sol|luna)(?:$|[-_.])/.test(model)) {
    const values = /gpt-6-(?:sol|luna)(?:$|[-_.])/.test(model)
      ? ['none', 'low', 'medium', 'high', 'xhigh', 'max']
      : ['low', 'medium', 'high', 'xhigh', 'max'];
    return createProfile('openai-gpt-6', values, values[0]);
  }
  if (/deepseek-(?:reasoner|r1)|(?:^|[\/:_-])r1(?:$|[\/:_.-])/.test(model)) {
    return createProfile('deepseek-reasoner', ['high'], 'high', 'default');
  }
  if (/gpt-5\.6/.test(model)) {
    return createProfile('openai-gpt-5.6', ['none', 'low', 'medium', 'high', 'xhigh', 'max'], 'none');
  }
  if (/gpt-5\.(?:[2-5])[^\s]*-pro/.test(model)) {
    return createProfile('openai-gpt-5-pro-new', ['medium', 'high', 'xhigh'], 'medium');
  }
  if (/gpt-5\.(?:[2-5])/.test(model)) {
    return createProfile('openai-gpt-5-new', ['none', 'low', 'medium', 'high', 'xhigh'], 'none');
  }
  if (/gpt-5\.1/.test(model)) {
    return createProfile('openai-gpt-5.1', ['none', 'low', 'medium', 'high'], 'none');
  }
  if (/gpt-5-pro(?:$|[-_.])/.test(model)) {
    return createProfile('openai-gpt-5-pro', ['high'], 'high');
  }
  if (/gpt-5(?:$|[-_.])/.test(model)) {
    return createProfile('openai-gpt-5', ['minimal', 'low', 'medium', 'high'], 'minimal');
  }
  if (/^(?:o[134](?:-mini|-pro)?|o3-deep-research)(?:$|[-_.])/.test(model)) {
    const values = /-pro(?:$|[-_.])/.test(model) ? ['high'] : ['low', 'medium', 'high'];
    return createProfile('openai-o-series', values, values[0]);
  }
  if (/gpt-oss-(?:20b|120b)/.test(model)) {
    return createProfile('openai-oss', ['low', 'medium', 'high'], 'low');
  }
  if (/gemini-3\.5-flash/.test(model) || /gemini-3(?:-|\.)flash/.test(model)) {
    return createProfile('gemini-flash', ['minimal', 'low', 'medium', 'high'], 'minimal');
  }
  if (/gemini-3\.1-pro/.test(model)) {
    return createProfile('gemini-3.1-pro', ['low', 'medium', 'high'], 'low');
  }
  if (/gemini-3\.1-flash-lite/.test(model)) {
    return createProfile('gemini-3.1-flash-lite', ['minimal', 'high'], 'minimal');
  }
  if (/gemini-3(?:-|\.)pro/.test(model)) {
    return createProfile('gemini-3-pro', ['low', 'high'], 'low');
  }
  if (/gemini-2\.5-pro/.test(model)) {
    return createProfile('gemini-2.5-pro', ['low', 'medium', 'high'], 'low');
  }
  if (/gemini-2\.5/.test(model)) {
    return createProfile('gemini-2.5', ['none', 'low', 'medium', 'high'], 'none');
  }
  if (/claude-(?:opus|sonnet)-(?:4\.[6-9]|5)/.test(model) && !/anthropic\.com/.test(baseUrl)) {
    const values = /(?:opus-(?:4\.[7-9]|5)|sonnet-5)/.test(model)
      ? ['low', 'medium', 'high', 'xhigh', 'max']
      : ['low', 'medium', 'high', 'max'];
    return createProfile('claude-gateway-effort', values, 'low');
  }
  const metadata = catalogModel(provider);
  const profile = createProfile('default', ['default'], 'default', 'default');
  if (metadata?.supports_reasoning === true || hasReasoningCapability(metadata?.capabilities)) {
    profile.options[0].label = '思考（API 默认）';
  }
  return profile;
}

export function normalizeModelReasoningEffort(provider, effort) {
  const profile = getModelReasoningProfile(provider);
  return profile.options.some(option => option.value === effort)
    ? effort
    : profile.defaultValue;
}

function hasReasoningCapability(capabilities) {
  if (Array.isArray(capabilities)) return capabilities.some(value => typeof value === 'string' && /^reasoning$/i.test(value));
  if (typeof capabilities === 'string') return /(?:^|[\s,;])reasoning(?:$|[\s,;])/i.test(capabilities);
  if (capabilities && typeof capabilities === 'object') {
    return capabilities.reasoning === true || capabilities.Reasoning === true || capabilities.reasoning?.supported === true;
  }
  return false;
}

export function buildModelReasoningBody(provider, effort) {
  const profile = getModelReasoningProfile(provider);
  const value = normalizeModelReasoningEffort(provider, effort);
  if (profile.requestMode === 'enable-thinking') return { enable_thinking: value === 'enabled' };
  if (profile.requestMode === 'enable-thinking-effort') {
    return value === 'disabled' ? { enable_thinking: false } : { enable_thinking: true, reasoning_effort: value };
  }
  if (profile.requestMode === 'reasoning') return { reasoning: { effort: value } };
  if (profile.requestMode === 'reasoning-enabled') return { reasoning: { enabled: value === 'enabled' } };
  if (profile.requestMode === 'thinking') return { thinking: { type: value } };
  if (profile.requestMode === 'deepseek') {
    if (value === 'disabled') return { thinking: { type: 'disabled' } };
    return {
      thinking: { type: 'enabled' },
      reasoning_effort: value
    };
  }
  if (profile.requestMode === 'default' || value === 'default') return {};
  return { reasoning_effort: value };
}

export function applyModelReasoningBody(provider, effort, body) {
  const next = { ...body, ...buildModelReasoningBody(provider, effort) };
  if (/(?:^|\/)grok-4(?:$|[-_.])/i.test(provider?.model || '')) {
    for (const key of ['presence_penalty', 'frequency_penalty', 'stop']) delete next[key];
  }
  // Some Bailian reasoning models require streaming; the caller still
  // collects the entire answer, with no change to display or token limits.
  if (next.enable_thinking === true || getModelReasoningProfile(provider).id === 'qwen-mandatory') next.stream = true;
  // GPT-6 reasoning does not accept sampling controls. Limit this to the
  // documented family; other providers retain their existing parameters.
  if (/gpt-6(?:\.1)?-(?:astra|sol|luna)(?:$|[-_.])/i.test(provider?.model || '')
    && normalizeModelReasoningEffort(provider, effort) !== 'none') {
    delete next.temperature;
    delete next.top_p;
    delete next.logprobs;
    delete next.top_logprobs;
  }
  if (/(?:^|\.)(?:moonshot\.(?:cn|ai)|kimi\.(?:com|ai))$/.test(providerHost(provider))
    && /kimi-k(?:3|2\.[567])(?:$|[-_])/i.test(provider?.model || '')) {
    delete next.temperature;
    delete next.top_p;
  }
  return applyDeepSeekMaxReplyBoundary(provider, next);
}

function createProfile(id, values, defaultValue, requestMode = 'reasoning-effort') {
  return {
    id,
    defaultValue,
    requestMode,
    options: values.map((value, index) => ({
      value,
      label: LABELS[value] || value,
      level: index + 1
    }))
  };
}

// Protocol state, kept separate from visible reply text and never truncated.
export function getReasoningFields(message = {}) {
  const fields = {};
  for (const key of ['reasoning_content', 'reasoning']) {
    if (typeof message[key] === 'string') fields[key] = message[key];
  }
  if (Array.isArray(message.reasoning_details)) fields.reasoning_details = structuredClone(message.reasoning_details);
  if (Array.isArray(message.responses_output)) fields.responses_output = structuredClone(message.responses_output);
  return fields;
}

export function mergeReasoningDelta(target, delta = {}) {
  for (const key of ['reasoning_content', 'reasoning']) {
    if (typeof delta[key] === 'string') target[key] = (target[key] || '') + delta[key];
  }
  for (const part of delta.reasoning_details || []) {
    target.reasoning_details ||= [];
    const existing = target.reasoning_details.find(item => part.index != null
      ? item.index === part.index
      : part.id && item.id === part.id);
    if (!existing) {
      target.reasoning_details.push({ ...part });
      continue;
    }
    for (const [key, value] of Object.entries(part)) {
      if (['text', 'summary', 'data'].includes(key) && typeof value === 'string') existing[key] = (existing[key] || '') + value;
      else existing[key] = value;
    }
  }
}

export function reasoningProviderKey(provider = {}) {
  return JSON.stringify([String(provider.baseUrl || '').replace(/\/+$/, ''), provider.model || '']);
}
