import { STORAGE_KEYS, loadJson, saveJson } from './storage.js';

export const DEFAULT_SETTINGS = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  temperature: 0.8,
  stream: true
};

export const DEFAULT_ADVANCED_SETTINGS = {
  kbChunkSize: 512,
  kbChunkOverlap: 50,
  kbCandidateLimit: 50,
  kbInjectLimit: 6,
  roundtableMaxParticipants: 6,
  roundtableFollowUpRate: 0.55,
  roundtableTokenHardLimit: 9000,
  historyLimit: 24,
  memoryLimit: 5,
  edgeLimit: 8
};

export function getSettings() {
  return normalizeSettings(loadJson(STORAGE_KEYS.settings, DEFAULT_SETTINGS));
}

export function saveSettings(next) {
  const settings = normalizeSettings({ ...getSettings(), ...next });
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
    stream: raw.stream !== false
  };
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
    roundtableTokenHardLimit: clampNumber(raw.roundtableTokenHardLimit, 2000, 32000, DEFAULT_ADVANCED_SETTINGS.roundtableTokenHardLimit),
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
