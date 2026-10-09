import { positionProviderMenuDesktop } from './model_provider_presets_desktop.js';
import { positionProviderMenuMobile } from './model_provider_presets_mobile.js';

export const CHAT_PROVIDER_PRESETS = [
  { key: 'deepseek', label: 'DeepSeek', id: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash', website: 'https://platform.deepseek.com/api_keys', icon: 'src/_logo/llms/deepseek.svg', hosts: ['api.deepseek.com'] },
  { key: 'mimo', label: 'MiMO', id: 'MiMO', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.6-flash', website: 'https://platform.xiaomimimo.com/console/api-keys', icon: 'src/_logo/llms/mimo.svg', hosts: ['api.xiaomimimo.com'] },
  { key: 'qwen', label: 'Qwen', id: 'Qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.8-flash', website: 'https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key', icon: 'src/_logo/llms/qwen.svg', hosts: ['dashscope.aliyuncs.com'] },
  { key: 'openai', label: 'OpenAI', id: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-6-luna', website: 'https://platform.openai.com/api-keys', icon: 'src/_logo/llms/openai.svg', hosts: ['api.openai.com'] },
  { key: 'glm', label: 'GLM', id: 'GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.3-flash', website: 'https://bigmodel.cn/apikey/platform', icon: 'src/_logo/llms/glm.svg', hosts: ['open.bigmodel.cn'] },
  { key: 'kimi', label: 'Kimi', id: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k3', website: 'https://platform.kimi.com/console/api-keys', icon: 'src/_logo/llms/kimi.svg', hosts: ['api.moonshot.cn', 'api.moonshot.ai', 'api.kimi.com', 'api.kimi.ai'] },
  { key: 'grok', label: 'Grok', id: 'Grok', baseUrl: 'https://api.x.ai/v1', model: 'grok-4.7', website: 'https://console.x.ai/', icon: 'src/_logo/llms/grok.svg', hosts: ['api.x.ai'] },
  { key: 'local', label: '本地模型', id: 'LM Studio', baseUrl: 'http://localhost:1234/v1', model: '', website: 'https://lmstudio.ai/', icon: 'src/_logo/llms/lm-studio.svg', hosts: ['localhost', '127.0.0.1', '[::1]'] },
  { key: 'custom', label: '自定义', id: 'custom', baseUrl: 'https://api.openai.com/v1', model: 'gpt-6-luna', website: '', icon: 'src/_logo/icons/settings.svg', hosts: [] }
];

export function getProviderPresetForUrl(value = '') {
  try {
    const url = new URL(String(value).trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return CHAT_PROVIDER_PRESETS.find(preset => preset.hosts.includes(url.hostname.toLowerCase())) || null;
  } catch { return null; }
}

// Copy on an explicit chat-key change, never bind the two settings together.
export function buildMimoTtsSyncPatch(settings, previous, provider) {
  const key = String(provider.apiKey || '').trim();
  if (getProviderPresetForUrl(provider.baseUrl)?.key !== 'mimo' || !key) return {};
  if (getProviderPresetForUrl(previous?.baseUrl)?.key === 'mimo' && key === previous?.apiKey) return {};
  const providers = settings.ttsProviders || [];
  const isMimo = item => getProviderPresetForUrl(item.baseUrl)?.key === 'mimo' && /^mimo-.*tts/i.test(item.model || '');
  const target = providers.find(item => item.id === settings.defaultTtsProviderId && isMimo(item)) || providers.find(isMimo);
  if (target) return { ttsProviders: providers.map(item => item.id === target.id ? { ...item, apiKey: key } : item) };
  let id = 'mimo-tts';
  for (let suffix = 2; providers.some(item => item.id === id); suffix++) id = `mimo-tts-${suffix}`;
  return { ttsProviders: [...providers, { id, apiKey: key, baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-tts-voiceclone', speed: 1 }] };
}

export function initChatProviderPresets({ onSelect, openExternalUrl }) {
  const menu = document.getElementById('chat-provider-preset-menu');
  const keyButton = document.getElementById('chat-provider-get-key');
  const urlInput = document.getElementById('chat-provider-base-url');
  const triggers = ['model-chat-add', 'model-chat-add-mobile'].map(id => document.getElementById(id)).filter(Boolean);
  if (!menu || !keyButton || !urlInput) return null;
  document.body.appendChild(menu);
  let anchor = null;
  function close({ focus = false } = {}) {
    const previous = anchor;
    anchor = null;
    menu.classList.add('hidden');
    triggers.forEach(button => button.setAttribute('aria-expanded', 'false'));
    if (focus) previous?.focus({ preventScroll: true });
  }
  function position() {
    if (!anchor) return;
    if (!anchor.getClientRects().length) { close(); return; }
    const place = window.matchMedia('(max-width: 760px)').matches ? positionProviderMenuMobile : positionProviderMenuDesktop;
    place(menu, anchor);
  }
  function updateKeyButton() {
    const preset = getProviderPresetForUrl(urlInput.value);
    keyButton.disabled = !preset?.website;
    keyButton.title = preset?.website ? `获取 ${preset.label === '本地模型' ? 'LM Studio' : preset.label}${preset.key === 'local' ? '' : ' API Key'}` : '此 API Base URL 未配置获取网站';
    keyButton.setAttribute('aria-label', keyButton.title);
  }
  menu.replaceChildren(...CHAT_PROVIDER_PRESETS.map(preset => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-provider-preset-option';
    button.dataset.providerPreset = preset.key;
    button.setAttribute('role', 'menuitem');
    const icon = document.createElement('img');
    icon.src = preset.icon; icon.alt = '';
    const label = document.createElement('span'); label.textContent = preset.label;
    button.append(icon, label);
    button.addEventListener('click', () => { close(); onSelect(preset); });
    return button;
  }));
  for (const button of triggers) {
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-controls', menu.id);
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => {
      if (anchor === button) { close(); return; }
      close();
      anchor = button;
      button.setAttribute('aria-expanded', 'true');
      menu.classList.remove('hidden');
      position();
      menu.firstElementChild?.focus({ preventScroll: true });
    });
  }
  menu.addEventListener('keydown', event => {
    const options = [...menu.children];
    const index = options.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    }
    if (event.key === 'Tab') close();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && anchor) { event.preventDefault(); close({ focus: true }); } });
  document.addEventListener('pointerdown', event => { if (anchor && !menu.contains(event.target) && !triggers.some(button => button.contains(event.target))) close(); });
  window.addEventListener('resize', position);
  window.visualViewport?.addEventListener('resize', position);
  document.addEventListener('scroll', event => { if (!menu.contains(event.target)) position(); }, true);
  urlInput.addEventListener('input', updateKeyButton);
  urlInput.addEventListener('change', updateKeyButton);
  keyButton.addEventListener('click', () => {
    const website = getProviderPresetForUrl(urlInput.value)?.website;
    updateKeyButton();
    if (website) openExternalUrl(website);
  });
  updateKeyButton();
  return { close, updateKeyButton };
}
