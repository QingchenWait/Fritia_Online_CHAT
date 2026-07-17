import { ensurePresetCharacters } from './characters.js';
import { initUi } from './ui.js';
import { migrateLegacyAppMediaToIndexedDb } from './storage.js';
import { migrateLegacyStickersToIndexedDb } from './stickers.js';
import { initRuntimeEnvironment } from './runtime_env.js';
import { initOnboarding } from './onboarding.js';

async function boot() {
  initRuntimeEnvironment();
  await migrateLegacyAppMediaToIndexedDb();
  await migrateLegacyStickersToIndexedDb();
  await ensurePresetCharacters();
  initUi();
  initOnboarding({ autoShow: true });
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
