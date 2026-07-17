import { getSettings, saveSettings } from './settings.js';
import { getRuntimeEnvironment } from './runtime_env.js';
import { initOnboardingDesktopLayout } from './onboarding_desktop.js';
import { initOnboardingMobileLayout } from './onboarding_mobile.js';

const ONBOARDING_DISMISSED_KEY = 'fritia_chat_onboarding_dismissed';
const CHECK_TIMEOUT_MS = 30000;

const PROVIDERS = Object.freeze({
  deepseek: {
    id: 'deepseek',
    displayName: 'DeepSeek',
    kicker: 'DEEPSEEK QUICK SETUP',
    icon: 'src/_logo/icons/message-circle.svg',
    apiKeysUrl: 'https://platform.deepseek.com/api_keys',
    topUpUrl: 'https://platform.deepseek.com/top_up',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    chatProviderId: 'DeepSeek_Import',
    defaultsLabel: '默认对话模型',
    instructions: [
      '注册或登录 DeepSeek 开放平台。',
      '在 [充值] 页面充值 5-10 元，即可满足长时间游玩需求。',
      '在 [API Keys] 页面点击“创建 API Key”，名称随意填写，创建后复制密钥。'
    ],
    officialNote: '账号、充值和密钥均在 DeepSeek 官方页面完成。',
    buildHeaders(apiKey) {
      return {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey
      };
    },
    buildCheckBody() {
      return {
        model: 'deepseek-v4-flash',
        messages: [{ role: 'user', content: '只回复 OK' }],
        stream: false,
        max_tokens: 8,
        thinking: { type: 'disabled' }
      };
    }
  },
  mimo: {
    id: 'mimo',
    displayName: 'MiMo',
    kicker: 'MIMO QUICK SETUP',
    icon: 'src/_logo/icons/bot.svg',
    apiKeysUrl: 'https://platform.xiaomimimo.com/console/api-keys',
    topUpUrl: 'https://platform.xiaomimimo.com/console/recharge',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.5',
    chatProviderId: 'MiMo_Import',
    ttsProviderId: 'MiMoTTS_Import',
    ttsModel: 'mimo-v2.5-tts-voiceclone',
    defaultsLabel: '对话、图像转述、文字转语音',
    instructions: [
      '注册或登录 Xiaomi MiMo 开放平台。',
      '在 [账户余额] 页面充值 5-10 元，即可满足长时间游玩需求。',
      '在 [API Keys] 页面点击“新建 API Key”，名称随意填写，创建后复制密钥。'
    ],
    officialNote: '登录、充值和密钥均在 Xiaomi MiMo 官方页面完成。',
    buildHeaders(apiKey) {
      return {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
        'api-key': apiKey
      };
    },
    buildCheckBody() {
      return {
        model: 'mimo-v2.5',
        messages: [{ role: 'user', content: '只回复 OK' }],
        stream: false,
        max_completion_tokens: 8,
        thinking: { type: 'disabled' }
      };
    }
  }
});

export function buildImportedSettings(providerKey, apiKey, settings = getSettings()) {
  const config = PROVIDERS[providerKey];
  const cleanKey = normalizeKey(apiKey);
  if (!config) throw new Error('未知的快速配置提供商。');
  if (!cleanKey) throw new Error('API Key 不能为空。');

  const chatProvider = {
    id: config.chatProviderId,
    apiKey: cleanKey,
    baseUrl: config.baseUrl,
    model: config.model
  };
  const patch = {
    chatProviders: upsertProvider(settings.chatProviders, chatProvider),
    defaultChatProviderId: config.chatProviderId
  };

  if (providerKey === 'mimo') {
    const existingTts = findProvider(settings.ttsProviders, config.ttsProviderId);
    const ttsProvider = {
      id: config.ttsProviderId,
      apiKey: cleanKey,
      baseUrl: config.baseUrl,
      model: config.ttsModel,
      speed: Number(existingTts?.speed || 1)
    };
    patch.ttsProviders = upsertProvider(settings.ttsProviders, ttsProvider);
    patch.defaultImageCaptionProviderId = config.chatProviderId;
    patch.defaultTtsProviderId = config.ttsProviderId;
  }

  return patch;
}

export function initOnboarding(options = {}) {
  const welcomePanel = document.getElementById('onboarding-welcome-panel');
  const setupPanel = document.getElementById('quick-setup-panel');
  if (!welcomePanel || !setupPanel) return createEmptyController();

  const elements = {
    welcomePanel,
    welcomeShell: welcomePanel.querySelector('.onboarding-welcome-shell'),
    dismissToggle: document.getElementById('onboarding-dismiss-toggle'),
    deepseekButton: document.getElementById('onboarding-deepseek'),
    mimoButton: document.getElementById('onboarding-mimo'),
    helpButton: document.getElementById('onboarding-help'),
    welcomeCloseButton: document.getElementById('onboarding-close'),
    setupPanel,
    setupShell: setupPanel.querySelector('.quick-setup-shell'),
    setupCloseButton: document.getElementById('quick-setup-close'),
    providerIcon: document.getElementById('quick-setup-provider-icon'),
    kicker: document.getElementById('quick-setup-kicker'),
    title: document.getElementById('quick-setup-title'),
    subtitle: document.getElementById('quick-setup-subtitle'),
    stepOneTitle: document.getElementById('quick-setup-step-one-title'),
    instructions: document.getElementById('quick-setup-instructions'),
    officialNote: document.getElementById('quick-setup-official-note'),
    steps: [...setupPanel.querySelectorAll('[data-quick-setup-step]')],
    progress: [...setupPanel.querySelectorAll('[data-quick-setup-progress]')],
    actionGroups: [...setupPanel.querySelectorAll('[data-quick-setup-actions]')],
    openOfficialButton: document.getElementById('quick-setup-open-official'),
    toImportButton: document.getElementById('quick-setup-to-import'),
    readClipboardButton: document.getElementById('quick-setup-read-clipboard'),
    manualEntryButton: document.getElementById('quick-setup-manual-entry'),
    manualWrap: document.getElementById('quick-setup-manual-wrap'),
    keyInput: document.getElementById('quick-setup-key-input'),
    useKeyButton: document.getElementById('quick-setup-use-key'),
    keySummary: document.getElementById('quick-setup-key-summary'),
    providerId: document.getElementById('quick-setup-provider-id'),
    model: document.getElementById('quick-setup-model'),
    defaults: document.getElementById('quick-setup-defaults'),
    result: document.getElementById('quick-setup-result'),
    resultIcon: document.querySelector('#quick-setup-result .quick-setup-result__icon img'),
    resultTitle: document.getElementById('quick-setup-result-title'),
    resultCopy: document.getElementById('quick-setup-result-copy'),
    status: document.getElementById('quick-setup-status'),
    checkButton: document.getElementById('quick-setup-check'),
    topUpButton: document.getElementById('quick-setup-top-up'),
    retryButton: document.getElementById('quick-setup-retry'),
    finishButton: document.getElementById('quick-setup-finish'),
    viewSettingsButton: document.getElementById('quick-setup-view-settings'),
    resetButton: document.getElementById('quick-setup-reset')
  };

  const desktopLayout = initOnboardingDesktopLayout({ welcomePanel, setupPanel });
  const mobileLayout = initOnboardingMobileLayout({ welcomePanel, setupPanel });
  const listeners = [];
  let activeProviderKey = 'deepseek';
  let currentStep = 1;
  let draftKey = '';
  let requestController = null;
  let requestTimedOut = false;
  let setupSucceeded = false;
  let officialVisitPending = false;
  let officialWindowBlurred = false;
  let destroyed = false;

  function listen(target, type, handler, listenerOptions) {
    if (!target) return;
    target.addEventListener(type, handler, listenerOptions);
    listeners.push(() => target.removeEventListener(type, handler, listenerOptions));
  }

  function activeConfig() {
    return PROVIDERS[activeProviderKey] || PROVIDERS.deepseek;
  }

  function setVisible(element, visible) {
    if (!element) return;
    element.classList.toggle('hidden', !visible);
    element.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function setButtonVisible(button, visible) {
    button?.classList.toggle('hidden', !visible);
  }

  function setText(idElement, value) {
    if (idElement) idElement.textContent = value;
  }

  function isDismissed() {
    try {
      return localStorage.getItem(ONBOARDING_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  }

  function setDismissed(dismissed) {
    try {
      if (dismissed) localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
      else localStorage.removeItem(ONBOARDING_DISMISSED_KEY);
    } catch {}
    syncDismissToggle(dismissed);
  }

  function syncDismissToggle(dismissed = isDismissed()) {
    if (!elements.dismissToggle) return;
    elements.dismissToggle.checked = dismissed;
    elements.dismissToggle.setAttribute('aria-checked', dismissed ? 'true' : 'false');
  }

  function showStep(step) {
    currentStep = Math.max(1, Math.min(3, Number(step) || 1));
    elements.steps.forEach(section => {
      setVisible(section, Number(section.dataset.quickSetupStep) === currentStep);
    });
    elements.progress.forEach(item => {
      const itemStep = Number(item.dataset.quickSetupProgress);
      item.classList.toggle('is-active', itemStep === currentStep);
      item.classList.toggle('is-complete', itemStep < currentStep);
      if (itemStep === currentStep) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    elements.actionGroups.forEach(group => {
      setVisible(group, Number(group.dataset.quickSetupActions) === currentStep);
    });
    setupPanel.dataset.currentStep = String(currentStep);
    document.dispatchEvent(new CustomEvent('fritia-onboarding-step-changed', {
      detail: { step: currentStep, provider: activeProviderKey }
    }));
  }

  function setStatus(message, state = 'info') {
    if (!elements.status) return;
    elements.status.textContent = message || '';
    elements.status.dataset.state = state;
    elements.status.classList.toggle('hidden', !message);
  }

  function setCheckResult(state, title, copy) {
    if (elements.result) elements.result.dataset.state = state;
    setText(elements.resultTitle, title);
    setText(elements.resultCopy, copy);
    const iconByState = {
      checking: 'refresh-cw.svg',
      success: 'save-config.svg',
      error: 'circle-alert.svg',
      balance: 'circle-alert.svg'
    };
    if (elements.resultIcon) {
      elements.resultIcon.src = 'src/_logo/icons/' + (iconByState[state] || iconByState.checking);
    }
  }

  function renderProvider() {
    const config = activeConfig();
    if (elements.providerIcon) elements.providerIcon.src = config.icon;
    setText(elements.kicker, config.kicker);
    setText(elements.title, '快速配置 ' + config.displayName + ' API');
    setText(elements.subtitle, '只需复制一次 API Key，其余配置由 APP 完成。');
    setText(elements.stepOneTitle, '在 ' + config.displayName + ' 官网创建密钥');
    setText(elements.officialNote, config.officialNote);
    setText(elements.providerId, config.chatProviderId + (config.ttsProviderId ? ' / ' + config.ttsProviderId : ''));
    setText(elements.model, config.model + (config.ttsModel ? ' / ' + config.ttsModel : ''));
    setText(elements.defaults, config.defaultsLabel);
    const openButtonText = elements.openOfficialButton?.querySelector('span');
    setText(openButtonText, '打开 ' + config.displayName + ' 并创建 Key');
    if (elements.keyInput) elements.keyInput.placeholder = '粘贴 ' + config.displayName + ' API Key';
    if (elements.instructions) {
      elements.instructions.replaceChildren();
      config.instructions.forEach((instruction, index) => {
        const item = document.createElement('li');
        const marker = document.createElement('span');
        const copy = document.createElement('p');
        marker.textContent = String(index + 1);
        copy.textContent = instruction;
        item.append(marker, copy);
        elements.instructions.appendChild(item);
      });
    }
  }

  function summarizeKey(apiKey, saved = false) {
    const suffix = normalizeKey(apiKey).slice(-4);
    if (!suffix) return '';
    return (saved ? '配置已保存' : '已读取密钥') + ' ····' + suffix;
  }

  function updateKeySummary(saved = false, key = draftKey) {
    if (!elements.keySummary) return;
    const summary = summarizeKey(key, saved);
    elements.keySummary.textContent = summary;
    elements.keySummary.classList.toggle('hidden', !summary);
  }

  function showManualInput() {
    setVisible(elements.manualWrap, true);
    if (elements.keyInput) {
      elements.keyInput.value = draftKey;
      requestAnimationFrame(() => elements.keyInput?.focus());
    }
  }

  function hideManualInput() {
    setVisible(elements.manualWrap, false);
    if (elements.keyInput) elements.keyInput.value = '';
  }

  function abortCheck() {
    if (!requestController) return;
    requestController.abort();
    requestController = null;
    requestTimedOut = false;
    setBusy(false);
  }

  function setBusy(busy) {
    [elements.checkButton, elements.retryButton, elements.resetButton, elements.setupCloseButton]
      .forEach(button => {
        if (button) button.disabled = busy;
      });
    setupPanel.classList.toggle('is-busy', busy);
  }

  function resetTransientState() {
    abortCheck();
    draftKey = '';
    setupSucceeded = false;
    officialVisitPending = false;
    officialWindowBlurred = false;
    hideManualInput();
    updateKeySummary();
    setButtonVisible(elements.checkButton, true);
    setButtonVisible(elements.topUpButton, false);
    setButtonVisible(elements.retryButton, false);
    setButtonVisible(elements.finishButton, false);
    setButtonVisible(elements.viewSettingsButton, false);
    setButtonVisible(elements.resetButton, true);
    setCheckResult('checking', '等待检查', '检查通过后会自动写入模型设置。');
  }

  function findExistingConnection() {
    const settings = getSettings();
    const config = activeConfig();
    return findProvider(settings.chatProviders, config.chatProviderId);
  }

  function prepareSetup(providerKey) {
    activeProviderKey = PROVIDERS[providerKey] ? providerKey : 'deepseek';
    resetTransientState();
    renderProvider();
    const existing = findExistingConnection();
    if (existing?.apiKey) {
      draftKey = normalizeKey(existing.apiKey);
      updateKeySummary();
      showStep(3);
      setStatus('检测到已有 ' + activeConfig().displayName + ' 导入配置，可以直接检查。', 'info');
      setCheckResult('checking', '已有配置', '点击“检查并保存”可更新官方模型参数。');
      return;
    }
    showStep(1);
    setStatus('只需在官方页面复制一次密钥。', 'info');
  }

  function showWelcome() {
    if (destroyed || isDismissed()) return false;
    syncDismissToggle();
    setVisible(welcomePanel, true);
    requestAnimationFrame(() => elements.welcomeShell?.focus());
    return true;
  }

  function closeWelcome() {
    setVisible(welcomePanel, false);
    document.dispatchEvent(new CustomEvent('fritia-onboarding-closed', {
      detail: { id: 'onboarding-welcome-panel' }
    }));
  }

  function openSetup(providerKey) {
    if (destroyed) return;
    prepareSetup(providerKey);
    setVisible(welcomePanel, false);
    setVisible(setupPanel, true);
    requestAnimationFrame(() => elements.setupShell?.focus());
  }

  function closeSetup() {
    abortCheck();
    setVisible(setupPanel, false);
    draftKey = '';
    hideManualInput();
    document.dispatchEvent(new CustomEvent('fritia-onboarding-closed', {
      detail: { id: 'quick-setup-panel' }
    }));
  }

  function openHelp() {
    closeWelcome();
    document.dispatchEvent(new CustomEvent('fritia-ui-open-panel', {
      detail: { id: 'app-help-panel' }
    }));
  }

  function openImportedSettings() {
    const config = activeConfig();
    closeSetup();
    document.dispatchEvent(new CustomEvent('fritia-ui-open-panel', {
      detail: {
        id: 'settings-panel',
        settingsSection: 'model',
        modelTab: 'chat',
        chatProviderId: config.chatProviderId,
        ttsProviderId: config.ttsProviderId || ''
      }
    }));
  }

  function moveToImport(message = '请读取刚复制的 API Key。') {
    showStep(2);
    setStatus(message, 'info');
  }

  function acceptDraftKey(value) {
    const nextKey = normalizeKey(value);
    if (!nextKey) {
      setStatus('没有读取到密钥，请重试或手动粘贴。', 'error');
      showManualInput();
      return false;
    }
    if (/\s/.test(nextKey)) {
      setStatus('密钥中包含空格，请重新复制完整密钥。', 'error');
      showManualInput();
      return false;
    }
    draftKey = nextKey;
    if (elements.keyInput) elements.keyInput.value = '';
    hideManualInput();
    updateKeySummary();
    showStep(3);
    setStatus(summarizeKey(nextKey) + '。检查通过后才会保存。', 'info');
    setCheckResult('checking', '密钥已导入', '点击“检查并保存”验证官方 API。');
    return true;
  }

  async function readClipboardKey() {
    if (!navigator.clipboard?.readText) {
      setStatus('当前环境不能读取剪贴板，请手动粘贴。', 'error');
      showManualInput();
      return;
    }
    try {
      acceptDraftKey(await navigator.clipboard.readText());
    } catch {
      setStatus('浏览器未允许读取剪贴板，请手动粘贴。', 'error');
      showManualInput();
    }
  }

  function mapResponseError(statusCode) {
    if (statusCode === 401) return { message: 'Key 无效，请重新复制后再试。' };
    if (statusCode === 402) return { message: '账户余额不足，请先在官网充值。', showTopUp: true, state: 'balance' };
    if (statusCode === 403) return { message: '当前 Key 没有调用权限，请重新创建。' };
    if (statusCode === 429) return { message: '请求过于频繁，请稍后再试。' };
    if (statusCode >= 500) return { message: '官方服务暂时异常，请稍后重试。' };
    return { message: '检查失败（HTTP ' + statusCode + '），请稍后重试。' };
  }

  function showCheckError(message, options = {}) {
    const state = options.state || 'error';
    setStatus(message, state);
    setCheckResult(state, state === 'balance' ? '余额不足' : '检查失败', message);
    setButtonVisible(elements.checkButton, false);
    setButtonVisible(elements.topUpButton, Boolean(options.showTopUp));
    setButtonVisible(elements.retryButton, true);
    setButtonVisible(elements.finishButton, false);
    setButtonVisible(elements.viewSettingsButton, false);
  }

  async function checkAndSave() {
    if (requestController || destroyed) return;
    if (!draftKey) {
      moveToImport('请先读取或粘贴 API Key。');
      showManualInput();
      return;
    }
    const config = activeConfig();
    showStep(3);
    setButtonVisible(elements.checkButton, false);
    setButtonVisible(elements.topUpButton, false);
    setButtonVisible(elements.retryButton, false);
    setBusy(true);
    setStatus('正在检查 ' + config.displayName + ' 配置…', 'busy');
    setCheckResult('checking', '正在连接', '正在调用官方 API 验证密钥。');

    const controller = new AbortController();
    requestController = controller;
    requestTimedOut = false;
    const timeoutId = window.setTimeout(() => {
      requestTimedOut = true;
      controller.abort();
    }, CHECK_TIMEOUT_MS);

    try {
      const response = await fetch(config.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: config.buildHeaders(draftKey),
        body: JSON.stringify(config.buildCheckBody()),
        signal: controller.signal
      });
      if (!response.ok) {
        const mapped = mapResponseError(response.status);
        showCheckError(mapped.message, mapped);
        return;
      }
      const payload = await response.json().catch(() => null);
      const message = payload?.choices?.[0]?.message;
      if (!message || typeof message !== 'object' || typeof message.content !== 'string' || !message.content.trim()) {
        showCheckError('官方 API 返回内容不完整，请稍后重试。');
        return;
      }

      const savedKey = draftKey;
      saveSettings(buildImportedSettings(activeProviderKey, savedKey, getSettings()));
      setupSucceeded = true;
      updateKeySummary(true, savedKey);
      draftKey = '';
      setStatus('配置成功，已自动写入模型设置。', 'success');
      setCheckResult('success', '配置成功', config.defaultsLabel + '已更新。');
      setButtonVisible(elements.checkButton, false);
      setButtonVisible(elements.topUpButton, false);
      setButtonVisible(elements.retryButton, false);
      setButtonVisible(elements.resetButton, false);
      setButtonVisible(elements.finishButton, true);
      setButtonVisible(elements.viewSettingsButton, true);
    } catch (error) {
      if (error?.name === 'AbortError') {
        if (requestTimedOut) showCheckError('连接超时，请检查网络后重试。');
        return;
      }
      showCheckError('无法连接官方 API，请检查网络或浏览器跨域限制。');
    } finally {
      window.clearTimeout(timeoutId);
      if (requestController === controller) requestController = null;
      requestTimedOut = false;
      setBusy(false);
    }
  }

  async function openOfficialUrl(url, message) {
    officialVisitPending = true;
    officialWindowBlurred = false;
    if (!await openExternalUrl(url)) {
      officialVisitPending = false;
      setStatus('未能打开官网，请允许弹出窗口后重试。', 'error');
      return;
    }
    setStatus(message, 'info');
  }

  function onWindowBlur() {
    if (officialVisitPending) officialWindowBlurred = true;
  }

  function onWindowFocus() {
    if (!officialVisitPending || !officialWindowBlurred) return;
    officialVisitPending = false;
    officialWindowBlurred = false;
    const target = currentStep === 1
      ? elements.toImportButton
      : (currentStep === 2 ? elements.readClipboardButton : elements.retryButton);
    target?.focus();
    target?.classList.add('is-highlighted');
    window.setTimeout(() => target?.classList.remove('is-highlighted'), 2200);
    if (currentStep === 1) setStatus('欢迎回来。复制好密钥后，点击“我已复制，下一步”。', 'info');
    else if (currentStep === 2) setStatus('欢迎回来。请读取刚复制的密钥。', 'info');
    else setStatus('充值完成后，请重新检查配置。', 'info');
  }

  function resetSetup() {
    prepareSetup(activeProviderKey);
  }

  function onEscape(event) {
    if (event.key !== 'Escape') return;
    if (!setupPanel.classList.contains('hidden')) {
      event.preventDefault();
      closeSetup();
      return;
    }
    if (!welcomePanel.classList.contains('hidden')) {
      event.preventDefault();
      closeWelcome();
    }
  }

  listen(elements.dismissToggle, 'change', () => setDismissed(Boolean(elements.dismissToggle.checked)));
  listen(elements.deepseekButton, 'click', () => openSetup('deepseek'));
  listen(elements.mimoButton, 'click', () => openSetup('mimo'));
  listen(elements.helpButton, 'click', openHelp);
  listen(elements.welcomeCloseButton, 'click', closeWelcome);
  listen(elements.setupCloseButton, 'click', closeSetup);
  listen(elements.openOfficialButton, 'click', () => {
    const config = activeConfig();
    void openOfficialUrl(config.apiKeysUrl, '创建并复制密钥后，回到这里进入下一步。');
  });
  listen(elements.toImportButton, 'click', () => moveToImport());
  listen(elements.readClipboardButton, 'click', () => void readClipboardKey());
  listen(elements.manualEntryButton, 'click', showManualInput);
  listen(elements.useKeyButton, 'click', () => acceptDraftKey(elements.keyInput?.value || ''));
  listen(elements.keyInput, 'paste', () => window.setTimeout(() => {
    acceptDraftKey(elements.keyInput?.value || '');
  }, 0));
  listen(elements.keyInput, 'keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    acceptDraftKey(elements.keyInput?.value || '');
  });
  listen(elements.checkButton, 'click', () => void checkAndSave());
  listen(elements.retryButton, 'click', () => void checkAndSave());
  listen(elements.topUpButton, 'click', () => {
    void openOfficialUrl(activeConfig().topUpUrl, '充值完成后，请返回并重新检查配置。');
  });
  listen(elements.finishButton, 'click', () => {
    if (setupSucceeded) closeSetup();
  });
  listen(elements.viewSettingsButton, 'click', () => {
    if (setupSucceeded) openImportedSettings();
  });
  listen(elements.resetButton, 'click', resetSetup);
  listen(window, 'blur', onWindowBlur);
  listen(window, 'focus', onWindowFocus);
  listen(document, 'keydown', onEscape);

  syncDismissToggle();
  setVisible(welcomePanel, false);
  setVisible(setupPanel, false);
  const welcomeShown = options.autoShow === true ? showWelcome() : false;

  return {
    welcomeShown,
    openWelcome: showWelcome,
    openSetup,
    closeWelcome,
    closeSetup,
    destroy() {
      destroyed = true;
      abortCheck();
      listeners.splice(0).forEach(remove => remove());
      desktopLayout.destroy();
      mobileLayout.destroy();
    }
  };
}

function normalizeKey(value) {
  return String(value || '').trim();
}

function findProvider(providers, id) {
  return (Array.isArray(providers) ? providers : []).find(provider => provider?.id === id) || null;
}

function upsertProvider(providers, provider) {
  const next = (Array.isArray(providers) ? providers : []).map(item => ({ ...item }));
  const index = next.findIndex(item => item.id === provider.id);
  if (index >= 0) next[index] = { ...next[index], ...provider };
  else next.push(provider);
  return next;
}

async function openExternalUrl(url) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke || null;
  if (invoke) {
    try {
      await invoke('open_external_url', { url });
      return true;
    } catch (error) {
      console.warn('[onboarding] failed to open external URL via desktop shell', error);
    }
  }
  const opened = window.open(url, '_blank', 'noopener');
  return Boolean(opened) || getRuntimeEnvironment().isPackaged;
}

function createEmptyController() {
  return {
    welcomeShown: false,
    openWelcome() {},
    openSetup() {},
    closeWelcome() {},
    closeSetup() {},
    destroy() {}
  };
}
