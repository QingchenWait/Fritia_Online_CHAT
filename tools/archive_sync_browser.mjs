import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const files = new Map(), calls = [];
let failPut = false, listingGate = null;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/dav/')) {
    const body = []; for await (const chunk of req) body.push(chunk);
    calls.push({ method: req.method, path: url.pathname, size: Buffer.concat(body).length });
    if (req.method === 'MKCOL') { res.writeHead(201); res.end(); return; }
    if (req.method === 'PROPFIND') {
      const names = [...files.keys()].filter(name => name.startsWith('/dav/chat/fritia-sync-v2/'));
      if (listingGate) await listingGate();
      res.writeHead(207, { 'Content-Type': 'application/xml' });
      res.end(`<d:multistatus xmlns:d="DAV:">${names.map(name => `<d:response><d:href>${name}</d:href></d:response>`).join('')}</d:multistatus>`); return;
    }
    if (req.method === 'PUT') {
      if (failPut) { res.writeHead(503); res.end(); return; }
      files.set(url.pathname, Buffer.concat(body)); res.writeHead(201); res.end(); return;
    }
    if (files.has(url.pathname)) { res.writeHead(200); res.end(files.get(url.pathname)); return; }
    res.writeHead(404); res.end(); return;
  }
  try {
    if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<title>Archive regression</title>'); return; }
    const body = await readFile(resolve('.' + url.pathname));
    res.writeHead(200, { 'Content-Type': extname(url.pathname) === '.js' ? 'text/javascript' : 'text/plain' }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.CHAT_TEST_BROWSER ? { executablePath: process.env.CHAT_TEST_BROWSER } : {}) });
try {
  const clients = [];
  for (const id of ['A', 'B']) {
    const context = await browser.newContext(); const page = await context.newPage(); await page.goto(origin);
    await page.evaluate(async ({ id, origin }) => {
      const { runIncrementalSync } = await import('/src/js/archive_sync_v2.js');
      const message = { id, text: `message-${id}`, createdAt: id === 'A' ? 1 : 2, role: 'user' };
      window.data = { version: 1, exportedAt: 1, localStorage: { fritia_next_chat_store: JSON.stringify({ version: 1, characters: [{ id: 'bot', name: 'bot' }], conversations: [{ id: 'chat', memberIds: ['bot'] }], messages: { chat: [message] } }) }, indexedDb: {} };
      window.edit = (id, text) => { const app = JSON.parse(data.localStorage.fritia_next_chat_store); const item = app.messages.chat.find(item => item.id === id); if (item) item.text = text; else app.messages.chat.push({ id, text, role: 'user', createdAt: Date.now() }); data.localStorage.fritia_next_chat_store = JSON.stringify(app); };
      window.sync = choices => runIncrementalSync({
        config: { url: origin + '/dav', path: '/chat', username: 'test' }, request: (config, url, init) => fetch(url, init),
        snapshot: async () => structuredClone(data), apply: async value => { window.data = value; }, status: () => {},
        conflict: value => { window.conflict = value; }, complete: async () => {}, ensureDirectory: async () => {}, readLegacy: async () => null
      }, choices);
    }, { id, origin });
    clients.push({ context, page });
  }
  const [a, b] = clients.map(item => item.page);
  const sync = page => page.evaluate(() => sync());
  const texts = page => page.evaluate(() => JSON.parse(data.localStorage.fritia_next_chat_store).messages.chat.map(item => item.text));
  await sync(a); await sync(b); await sync(a);
  assert.deepEqual(await texts(a), ['message-A', 'message-B']);
  assert.deepEqual(await texts(b), ['message-A', 'message-B']);
  const before = calls.length; await sync(a);
  assert.deepEqual(calls.slice(before).map(item => item.method), ['PROPFIND']);
  console.log('PASS two-device message union, unchanged sync = one request, no upload');
  await a.evaluate(() => edit('A', 'edit-A'));
  await b.evaluate(() => edit('A', 'edit-B'));
  await sync(a);
  const result = await sync(b); assert.equal(result.conflict, true);
  assert.ok(await b.evaluate(() => conflict.files.some(item => item.path.includes('messages/chat/A'))));
  const historyBefore = files.size;
  await b.evaluate(() => sync(Object.fromEntries(conflict.files.map(item => [item.choiceKey, 'remote']))));
  assert.deepEqual(await texts(b), ['edit-A', 'message-B']);
  assert.ok(files.size > historyBefore);
  const recoveries = await b.evaluate(async () => (await import('/src/js/archive_state.js')).archiveState('recoveries'));
  assert.ok(recoveries.length > 0);
  console.log('PASS concurrent text edit prompts, chosen value applied, losing version retained locally and in cloud history');
  await sync(a);
  await a.evaluate(() => edit('C', 'concurrent-C'));
  await b.evaluate(() => edit('D', 'concurrent-D'));
  let waiting = [], arrivals = 0;
  listingGate = () => new Promise(resolve => { waiting.push(resolve); if (++arrivals === 2) { listingGate = null; waiting.forEach(resolve => resolve()); } });
  await Promise.all([sync(a), sync(b)]);
  await sync(a); await sync(b);
  for (const page of [a,b]) assert.ok((await texts(page)).includes('concurrent-C') && (await texts(page)).includes('concurrent-D'));
  console.log('PASS simultaneous remote writers create independent commits and merge without overwrites');
  await a.evaluate(() => edit('E', 'keep-on-failure'));
  failPut = true;
  const failure = await a.evaluate(() => sync().then(() => '', error => error.message));
  assert.ok(failure.includes('503'));
  assert.ok((await texts(a)).includes('keep-on-failure'));
  failPut = false; await sync(a); await sync(b);
  assert.ok((await texts(b)).includes('keep-on-failure'));
  console.log('PASS failed upload preserves local history and retries successfully');
  // Corruption cannot reach the apply callback on a fresh device.
  const pack = [...files.keys()].find(key => key.endsWith('.gz') || key.includes('/pack-'));
  const bytes = files.get(pack); files.set(pack, Buffer.from('corrupted'));
  const context = await browser.newContext(); const page = await context.newPage(); await page.goto(origin);
  const corrupt = await page.evaluate(async origin => {
    const { runIncrementalSync } = await import('/src/js/archive_sync_v2.js'); let applied = false;
    try { await runIncrementalSync({ config: { url: origin + '/dav', path:'/chat', username:'test' }, request:(c,u,i)=>fetch(u,i), snapshot:async()=>({ localStorage:{}, indexedDb:{} }), apply:async()=>{applied=true;}, status:()=>{}, conflict:()=>{}, complete:()=>{}, readLegacy:async()=>null }); } catch(error) { return { error: error.message, applied }; }
  }, origin);
  assert.ok(corrupt.error); assert.equal(corrupt.applied, false); files.set(pack, bytes);
  console.log('PASS corrupted cloud data stops before applying local data');
  await context.close();
  for (const client of clients) await client.context.close();
  // Exercise the actual archive module (LocalStorage + IndexedDB + native-
  // compatible transport), not just the merge engine's context callbacks.
  files.clear(); calls.length = 0;
  const real = [];
  for (const id of ['one','two']) {
    const context = await browser.newContext(); const page = await context.newPage(); await page.goto(origin);
    await page.evaluate(async ({id,origin}) => {
      const archive = await import('/src/js/archive_sync.js');
      localStorage.setItem('fritia_next_chat_store',JSON.stringify({version:1,characters:[{id:'bot',name:'bot'}],conversations:[{id:'chat',memberIds:['bot']}],messages:{chat:[{id,role:'user',text:id,createdAt:id==='one'?1:2}]},activeConversationId:'chat'}));
      archive.saveWebDavConfig({url:origin+'/dav',path:'/chat',username:'test',password:'test-only',enabled:false});
      window.realSync = archive.syncWebDavNow;
    },{id,origin});
    real.push({context,page});
  }
  await real[0].page.evaluate(()=>realSync()); await real[1].page.evaluate(()=>realSync()); await real[0].page.evaluate(()=>realSync());
  for(const {page} of real) assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('fritia_next_chat_store')).messages.chat.map(item=>item.text)),['one','two']);
  const callCount = calls.length; await real[0].page.evaluate(()=>realSync());
  assert.deepEqual(calls.slice(callCount).map(item=>item.method),['PROPFIND']);
  console.log('PASS real archive LocalStorage/IndexedDB integration, persistent baselines and one-request no-op sync');
  for(const {context} of real) await context.close();
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
