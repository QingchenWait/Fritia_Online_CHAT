const CACHE_NAME = 'fritia-next-chat-v42';
const CORE_ASSETS = [
  './',
  './index.html',
  './src/styles/app.css',
  './src/styles/chat-scroll-desktop.css',
  './src/styles/chat-scroll-mobile.css',
  './src/styles/onboarding.css',
  './src/styles/onboarding-desktop.css',
  './src/styles/onboarding-mobile.css',
  './src/styles/role-migration-desktop.css',
  './src/styles/role-migration-mobile.css',
  './src/styles/chat-model-picker-desktop.css',
  './src/styles/chat-model-picker-mobile.css',
  './src/styles/model-provider-presets-desktop.css',
  './src/styles/model-provider-presets-mobile.css',
  './src/js/main.js',
  './src/js/onboarding.js',
  './src/js/onboarding_desktop.js',
  './src/js/onboarding_mobile.js',
  './src/js/runtime_env.js',
  './src/js/storage.js',
  './src/js/characters.js',
  './src/js/settings.js',
  './src/js/model_reasoning.js',
  './src/js/model_provider_presets.js',
  './src/js/model_provider_presets_desktop.js',
  './src/js/model_provider_presets_mobile.js',
  './src/js/openai_responses.js',
  './src/js/chat_scroll.js',
  './src/js/chat_scroll_desktop.js',
  './src/js/chat_scroll_mobile.js',
  './src/js/knowledge_base.js',
  './src/js/long_term_memory.js',
  './src/js/llm_request.js',
  './src/js/lm_studio.js',
  './src/js/chat_engine.js',
  './src/js/roundtable.js',
  './src/js/archive_sync.js',
  './src/js/archive_legacy.js',
  './src/js/external_links.js',
  './src/js/archive_sync_v2.js',
  './src/js/archive_merge.js',
  './src/js/archive_state.js',
  './src/js/archive_io.js',
  './src/js/settings_notice.js',
  './src/styles/archive-sync-desktop.css',
  './src/styles/archive-sync-mobile.css',
  './src/_logo/icons/clipboard-paste.svg',
  './src/js/mcp_tools.js',
  './src/js/plugin_store.js',
  './src/js/tool_chat_engine.js',
  './src/js/role_migration.js',
  './src/js/ui.js',
  './src/docs/mcp_help.md',
  './src/docs/imgs/lm_config_heimchat.png',
  './src/docs/imgs/lm_connect.png',
  './src/docs/imgs/lm_download.png',
  './src/docs/imgs/lm_local_server.png',
  './src/docs/imgs/lm_model.png',
  './src/_logo/icons/ai-agent.svg',
  './src/_logo/icons/bot.svg',
  './src/_logo/icons/brain.svg',
  './src/_logo/llms/mimo.svg',
  './src/_logo/llms/qwen.svg',
  './src/_logo/llms/deepseek.svg',
  './src/_logo/llms/kimi.svg',
  './src/_logo/llms/glm.svg',
  './src/_logo/llms/openai.svg',
  './src/_logo/llms/lm-studio.svg',
  './src/_logo/icons/chevron-down.svg',
  './src/_logo/icons/circle-alert.svg',
  './src/_logo/icons/download.svg',
  './src/_logo/icons/girl.svg',
  './src/_logo/icons/help-circle.svg',
  './src/_logo/icons/menu.svg',
  './src/_logo/icons/mic.svg',
  './src/_logo/icons/refresh-cw.svg',
  './src/_logo/icons/role-card.svg',
  './src/_logo/icons/save-config.svg',
  './src/_logo/icons/search.svg',
  './src/_logo/icons/tool-help.svg',
  './src/_logo/icons/monitor-up.svg',
  './src/_logo/icons/network.svg',
  './src/_logo/icons/plus.svg',
  './src/_logo/icons/wrench.svg',
  './src/_logo/icons/users.svg',
  './src/_logo/icons/tool-server.svg',
  './src/_logo/icons/tool-skills.svg',
  './src/_logo/icons/tool-streamable-http.svg',
  './src/_logo/icons/tool-stdio.svg',
  './src/_logo/icons/trash-2.svg',
  './src/_logo/icons/x.svg',
  './src/_logo/emoji/speech_balloon_3d.png',
  './src/_logo/emoji/chat.svg',
  './src/_logo/emoji/sparkles_3d.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key !== CACHE_NAME)
      .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Never proxy loopback model requests through the app's Service Worker.
  // Browsers must own this fetch so Local Network Access / localhost
  // permission checks happen in the page context instead of inside SW.
  if (isLoopbackModelRequest(url)) return;
  // Runtime APIs (including model capability discovery) own their caching
  // and failure handling. CacheStorage does not honor fetch's no-store flag.
  if (url.origin !== location.origin
    || event.request.cache === 'no-store'
    || ['authorization', 'api-key', 'x-api-key'].some(name => event.request.headers.has(name))) return;
  let pathname = url.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // Keep the encoded path if the URL contains invalid escape sequences.
  }
  if (url.origin === location.origin && /\/src\/docs\/doc_[^/]+\.md$/i.test(pathname)) {
    event.respondWith(fetch(event.request));
    return;
  }
  const networkFirst = url.origin === location.origin
    && (url.pathname.endsWith('/')
      || url.pathname.endsWith('.html')
      || url.pathname.endsWith('.js')
      || url.pathname.endsWith('.css')
      || url.pathname.endsWith('.json'));
  const fetchAndCache = () => fetch(event.request).then(response => {
    if (response.ok && response.status !== 206) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {}));
    }
    return response;
  });
  const readCached = () => caches.open(CACHE_NAME)
    .then(cache => cache.match(event.request)).catch(() => undefined);
  event.respondWith(
    (networkFirst
      ? fetchAndCache().catch(readCached)
      : readCached().then(cached => cached || fetchAndCache()))
      // Preserve a genuine network failure for the caller. Never return
      // undefined, fake success, or leave a rejected SW response promise.
      .then(response => response || Response.error(), () => Response.error())
  );
});

function isLoopbackModelRequest(url) {
  const hostname = String(url?.hostname || '').toLowerCase();
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]'
    || hostname === '::1';
}
