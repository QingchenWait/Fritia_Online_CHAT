const CACHE_NAME = 'fritia-next-chat-v23';
const CORE_ASSETS = [
  './',
  './index.html',
  './src/styles/app.css',
  './src/js/main.js',
  './src/js/runtime_env.js',
  './src/js/storage.js',
  './src/js/characters.js',
  './src/js/settings.js',
  './src/js/knowledge_base.js',
  './src/js/long_term_memory.js',
  './src/js/llm_request.js',
  './src/js/chat_engine.js',
  './src/js/roundtable.js',
  './src/js/archive_sync.js',
  './src/js/mcp_tools.js',
  './src/js/plugin_store.js',
  './src/js/tool_chat_engine.js',
  './src/js/ui.js',
  './src/docs/mcp_help.md',
  './src/_logo/icons/ai-agent.svg',
  './src/_logo/icons/chevron-down.svg',
  './src/_logo/icons/circle-alert.svg',
  './src/_logo/icons/menu.svg',
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
  './src/_logo/icons/x.svg',
  './src/_logo/emoji/speech_balloon_3d.png',
  './src/_logo/emoji/robot_3d.png',
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
  const networkFirst = url.origin === location.origin
    && (url.pathname.endsWith('/')
      || url.pathname.endsWith('.html')
      || url.pathname.endsWith('.js')
      || url.pathname.endsWith('.css')
      || url.pathname.endsWith('.json'));
  const fetchAndCache = () => fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
    return response;
  });
  event.respondWith(
    networkFirst
      ? fetchAndCache().catch(() => caches.match(event.request))
      : caches.match(event.request).then(cached => cached || fetchAndCache())
  );
});
