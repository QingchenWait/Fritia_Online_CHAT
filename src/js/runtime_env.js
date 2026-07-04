export const RUNTIME_ENV_TYPES = Object.freeze({
  WEB: 'web',
  LOCALHOST: 'localhost',
  FILE: 'file',
  TAURI: 'tauri',
  ELECTRON: 'electron',
  WEBVIEW: 'webview',
  UNKNOWN: 'unknown'
});

let cachedRuntimeEnvironment = null;

export function initRuntimeEnvironment() {
  cachedRuntimeEnvironment = detectRuntimeEnvironment();
  document.documentElement.dataset.runtimeEnv = cachedRuntimeEnvironment.type;
  document.dispatchEvent(new CustomEvent('fritia-runtime-environment-ready', {
    detail: cachedRuntimeEnvironment
  }));
  return cachedRuntimeEnvironment;
}

export function getRuntimeEnvironment() {
  if (!cachedRuntimeEnvironment) return initRuntimeEnvironment();
  return cachedRuntimeEnvironment;
}

export function getRuntimeEnvironmentType() {
  return getRuntimeEnvironment().type;
}

export function isBrowserFrontendRuntime(environment = getRuntimeEnvironment()) {
  return environment.isPureFrontend === true;
}

export function detectRuntimeEnvironment() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return createRuntimeEnvironment(RUNTIME_ENV_TYPES.UNKNOWN, 'unknown');
  }
  const userAgent = String(navigator.userAgent || '').toLowerCase();
  const locationInfo = readLocationInfo();
  if (window.__TAURI__ || window.__TAURI_INTERNALS__ || userAgent.includes(' tauri/')) {
    return createRuntimeEnvironment(RUNTIME_ENV_TYPES.TAURI, 'packaged', locationInfo);
  }
  if (window.electronAPI || window.process?.versions?.electron || userAgent.includes(' electron/')) {
    return createRuntimeEnvironment(RUNTIME_ENV_TYPES.ELECTRON, 'packaged', locationInfo);
  }
  if (window.ReactNativeWebView || userAgent.includes('; wv') || userAgent.includes('version/4.0 chrome')) {
    return createRuntimeEnvironment(RUNTIME_ENV_TYPES.WEBVIEW, 'packaged', locationInfo);
  }
  if (locationInfo.protocol === 'file:') {
    return createRuntimeEnvironment(RUNTIME_ENV_TYPES.FILE, 'browser', locationInfo);
  }
  if (isLocalHost(locationInfo.hostname)) {
    return createRuntimeEnvironment(RUNTIME_ENV_TYPES.LOCALHOST, 'browser', locationInfo);
  }
  if (locationInfo.protocol === 'http:' || locationInfo.protocol === 'https:') {
    return createRuntimeEnvironment(RUNTIME_ENV_TYPES.WEB, 'browser', locationInfo);
  }
  return createRuntimeEnvironment(RUNTIME_ENV_TYPES.UNKNOWN, 'unknown', locationInfo);
}

function createRuntimeEnvironment(type, category, locationInfo = readLocationInfo()) {
  return {
    type,
    category,
    isPackaged: category === 'packaged',
    isPureFrontend: category === 'browser',
    protocol: locationInfo.protocol,
    hostname: locationInfo.hostname,
    origin: locationInfo.origin,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent || ''
  };
}

function readLocationInfo() {
  if (typeof location === 'undefined') {
    return { protocol: '', hostname: '', origin: '' };
  }
  return {
    protocol: location.protocol || '',
    hostname: location.hostname || '',
    origin: location.origin || ''
  };
}

function isLocalHost(hostname) {
  return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(String(hostname || '').toLowerCase());
}
