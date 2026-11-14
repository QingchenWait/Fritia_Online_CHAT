import { getSettings, saveSettings } from './settings.js';
import { isDeepSeekWebAvailable } from './deepseek_web.js';
import { positionDeepSeekWebDesktop } from './deepseek_web_desktop.js';
import { positionDeepSeekWebMobile } from './deepseek_web_mobile.js';

const CONTROLS = [
  ['deepseek-web-search-btn', 'deepseekWebSearch'],
  ['deepseek-read-url-btn', 'deepseekReadUrl']
];

export function bindDeepSeekWebControls({ getRuntime }) {
  for (const [id, key] of CONTROLS) {
    document.getElementById(id)?.addEventListener('click', event => {
      event.stopPropagation();
      const runtime = getRuntime();
      if (!isDeepSeekWebAvailable(runtime?.provider)) return;
      saveSettings({ [key]: !getSettings()[key] });
    });
  }
  window.visualViewport?.addEventListener('resize', syncDeepSeekWebLayout);
  window.visualViewport?.addEventListener('scroll', syncDeepSeekWebLayout);
}

export function renderDeepSeekWebControls(runtime) {
  const container = document.getElementById('deepseek-web-controls');
  if (!container) return;
  container.classList.toggle('hidden', !isDeepSeekWebAvailable(runtime?.provider));
  for (const [id, key] of CONTROLS) {
    document.getElementById(id)?.setAttribute('aria-checked', String(runtime?.settings?.[key] === true));
  }
}

export function syncDeepSeekWebLayout() {
  const popover = document.getElementById('chat-model-popover');
  if (!popover || popover.classList.contains('hidden')) return;
  if (window.matchMedia('(max-width: 760px), (orientation: portrait)').matches) {
    positionDeepSeekWebMobile(popover);
  } else {
    positionDeepSeekWebDesktop(popover);
  }
}
