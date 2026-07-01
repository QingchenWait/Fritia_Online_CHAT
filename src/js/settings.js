import { STORAGE_KEYS, loadJson, saveJson } from './storage.js';

export const DEFAULT_SETTINGS = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  temperature: 0.8,
  stream: true,
  localizationSensitivity: 0.5,
  deepseekIntimateMode: false,
  deepseekIntimateModeStartedAt: 0,
  deepseekIntimateModeDisabledAt: 0
};

export const DEFAULT_ADVANCED_SETTINGS = {
  kbChunkSize: 512,
  kbChunkOverlap: 50,
  kbCandidateLimit: 50,
  kbInjectLimit: 6,
  roundtableMaxParticipants: 6,
  roundtableFollowUpRate: 0.55,
  roundtableCallLimit: 15,
  roundtableTokenHardLimit: 300000,
  historyLimit: 24,
  memoryLimit: 5,
  edgeLimit: 8
};

export function getSettings() {
  return normalizeSettings(loadJson(STORAGE_KEYS.settings, DEFAULT_SETTINGS));
}

export function saveSettings(next) {
  const previous = getSettings();
  const settings = normalizeSettings({ ...previous, ...next });
  const wasIntimateActive = shouldUseDeepSeekIntimateMode(previous);
  const willBeIntimateActive = shouldUseDeepSeekIntimateMode(settings);
  const timestamp = Date.now();
  if (willBeIntimateActive && !wasIntimateActive) {
    settings.deepseekIntimateModeStartedAt = timestamp;
  } else if (willBeIntimateActive && !settings.deepseekIntimateModeStartedAt) {
    settings.deepseekIntimateModeStartedAt = timestamp;
  }
  if (!willBeIntimateActive && wasIntimateActive) {
    if (!settings.deepseekIntimateModeStartedAt) {
      settings.deepseekIntimateModeStartedAt = previous.deepseekIntimateModeDisabledAt || 1;
    }
    settings.deepseekIntimateModeDisabledAt = timestamp;
  }
  saveJson(STORAGE_KEYS.settings, settings);
  document.dispatchEvent(new CustomEvent('fritia-settings-updated', { detail: settings }));
  return settings;
}

export function normalizeSettings(raw = {}) {
  return {
    apiKey: String(raw.apiKey || '').trim(),
    baseUrl: String(raw.baseUrl || DEFAULT_SETTINGS.baseUrl).trim().replace(/\/+$/, ''),
    model: String(raw.model || DEFAULT_SETTINGS.model).trim(),
    temperature: clampNumber(raw.temperature, 0, 2, DEFAULT_SETTINGS.temperature),
    stream: raw.stream !== false,
    localizationSensitivity: clampLocalizationSensitivity(raw.localizationSensitivity),
    deepseekIntimateMode: Boolean(raw.deepseekIntimateMode),
    deepseekIntimateModeStartedAt: normalizeTimestamp(raw.deepseekIntimateModeStartedAt),
    deepseekIntimateModeDisabledAt: normalizeTimestamp(raw.deepseekIntimateModeDisabledAt)
  };
}

export function isDeepSeekIntimateModeAvailable(settings = getSettings()) {
  const model = String(settings?.model || '').toLowerCase();
  return model.includes('deepseek')
    && Math.abs(clampLocalizationSensitivity(settings?.localizationSensitivity) - 1) < 0.001;
}

export function shouldUseDeepSeekIntimateMode(settings = getSettings()) {
  return Boolean(settings?.deepseekIntimateMode) && isDeepSeekIntimateModeAvailable(settings);
}

export function getAdvancedSettings() {
  return normalizeAdvancedSettings(loadJson(STORAGE_KEYS.advanced, DEFAULT_ADVANCED_SETTINGS));
}

export function saveAdvancedSettings(next) {
  const settings = normalizeAdvancedSettings({ ...getAdvancedSettings(), ...next });
  saveJson(STORAGE_KEYS.advanced, settings);
  document.dispatchEvent(new CustomEvent('fritia-advanced-settings-updated', { detail: settings }));
  return settings;
}

export function normalizeAdvancedSettings(raw = {}) {
  return {
    kbChunkSize: clampNumber(raw.kbChunkSize, 200, 1600, DEFAULT_ADVANCED_SETTINGS.kbChunkSize),
    kbChunkOverlap: clampNumber(raw.kbChunkOverlap, 0, 400, DEFAULT_ADVANCED_SETTINGS.kbChunkOverlap),
    kbCandidateLimit: clampNumber(raw.kbCandidateLimit, 10, 200, DEFAULT_ADVANCED_SETTINGS.kbCandidateLimit),
    kbInjectLimit: clampNumber(raw.kbInjectLimit, 1, 12, DEFAULT_ADVANCED_SETTINGS.kbInjectLimit),
    roundtableMaxParticipants: clampNumber(raw.roundtableMaxParticipants, 2, 12, DEFAULT_ADVANCED_SETTINGS.roundtableMaxParticipants),
    roundtableFollowUpRate: clampNumber(raw.roundtableFollowUpRate, 0, 1, DEFAULT_ADVANCED_SETTINGS.roundtableFollowUpRate),
    roundtableCallLimit: Math.round(clampNumber(raw.roundtableCallLimit, 1, 60, DEFAULT_ADVANCED_SETTINGS.roundtableCallLimit)),
    roundtableTokenHardLimit: Math.round(clampNumber(raw.roundtableTokenHardLimit, 1000, 1000000, DEFAULT_ADVANCED_SETTINGS.roundtableTokenHardLimit)),
    historyLimit: clampNumber(raw.historyLimit, 4, 80, DEFAULT_ADVANCED_SETTINGS.historyLimit),
    memoryLimit: clampNumber(raw.memoryLimit, 1, 12, DEFAULT_ADVANCED_SETTINGS.memoryLimit),
    edgeLimit: clampNumber(raw.edgeLimit, 1, 20, DEFAULT_ADVANCED_SETTINGS.edgeLimit)
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function clampLocalizationSensitivity(value) {
  return clampNumber(value, 0.5, 2, DEFAULT_SETTINGS.localizationSensitivity);
}

function normalizeTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}
