import { ensurePresetCharacters } from './characters.js';
import { initUi } from './ui.js';

async function boot() {
  await ensurePresetCharacters();
  initUi();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('[pwa] service worker registration failed', err);
    });
  }
}

boot().catch(err => {
  console.error('[boot] failed', err);
  document.body.innerHTML = `<pre style="padding:16px;white-space:pre-wrap;">启动失败：${err?.message || err}</pre>`;
});
