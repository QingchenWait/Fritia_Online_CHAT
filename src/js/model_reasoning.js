const LABELS = {
  default: '普通',
  disabled: '普通',
  none: '普通',
  minimal: '极简',
  low: '轻度',
  medium: '标准',
  high: '深度',
  xhigh: '超深度',
  max: '极限'
};

export function getModelReasoningProfile(provider = {}) {
  const model = String(provider?.model || '').trim().toLowerCase();
  const baseUrl = String(provider?.baseUrl || '').trim().toLowerCase();

  if (/deepseek-v4/.test(model)) {
    return createProfile('deepseek-v4', ['disabled', 'high', 'max'], 'disabled', 'deepseek');
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
  return createProfile('default', ['default'], 'default', 'default');
}

export function normalizeModelReasoningEffort(provider, effort) {
  const profile = getModelReasoningProfile(provider);
  return profile.options.some(option => option.value === effort)
    ? effort
    : profile.defaultValue;
}

export function buildModelReasoningBody(provider, effort) {
  const profile = getModelReasoningProfile(provider);
  const value = normalizeModelReasoningEffort(provider, effort);
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
