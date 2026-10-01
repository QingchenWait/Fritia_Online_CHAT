import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const origin = 'https://heim.test';

function worker({ network = async () => new Response('fresh'), readFailure = false, writeFailure = false } = {}) {
  const handlers = {};
  const entries = new Map();
  const requests = [];
  const writes = [];
  const cache = {
    async match(request) {
      if (readFailure) throw new Error('Cache read unavailable');
      return entries.get(request.url)?.clone();
    },
    async put(request, response) {
      if (writeFailure) throw new Error('Cache storage full');
      writes.push(request.url);
      entries.set(request.url, response.clone());
    }
  };
  const fetch = async request => { requests.push(request); return network(request); };
  runInNewContext(source, {
    URL, Response, location: new URL(origin), fetch,
    self: { addEventListener: (name, handler) => { handlers[name] = handler; } },
    caches: { open: async () => cache }
  }, { filename: 'sw.js' });
  return {
    entries, requests, writes,
    async request(path, init = {}) {
      const request = new Request(new URL(path, origin), init);
      let handled = false;
      let responsePromise;
      const pending = [];
      handlers.fetch({
        request,
        respondWith(value) { handled = true; responsePromise = Promise.resolve(value); },
        waitUntil(value) { pending.push(value); }
      });
      const response = await (handled ? responsePromise : fetch(request));
      await Promise.all(pending);
      return { handled, response, lifetimeTasks: pending.length };
    }
  };
}

test('model catalog requests reach the provider for each account, without SW caching', async () => {
  const sw = worker({ network: async request => Response.json({ account: request.headers.get('Authorization') }) });
  for (const account of ['account-a', 'account-b']) {
    const result = await sw.request('https://api.provider.test/v1/models', { cache: 'no-store', headers: { Authorization: account } });
    assert.equal(result.handled, false);
    assert.deepEqual(await result.response.json(), { account });
  }
  assert.equal(sw.requests.length, 2);
  assert.equal(sw.writes.length, 0);
});

test('POST, cross-origin, same-origin credentials, no-store and local model requests bypass SW', async () => {
  const sw = worker();
  const cases = [
    ['/chat/completions', { method: 'POST', body: '{}' }],
    ['https://remote.test/catalog.json', {}],
    ['/v1/models', { headers: { Authorization: 'test' } }],
    ['/v1/models', { headers: { 'api-key': 'test' } }],
    ['/v1/models', { headers: { 'x-api-key': 'test' } }],
    ['/catalog.json', { cache: 'no-store' }],
    ['http://localhost:1234/v1/models', {}],
    ['http://127.0.0.1:1234/v1/models', {}]
  ];
  for (const [url, init] of cases) assert.equal((await sw.request(url, init)).handled, false, url);
  assert.equal(sw.writes.length, 0);
});

test('missing static resource plus failed network produces a genuine network-error response', async () => {
  const sw = worker({ network: async () => { throw new TypeError('Failed to fetch'); } });
  for (const url of ['/src/_logo/uncached.svg', '/src/js/uncached.js']) {
    const result = await sw.request(url);
    assert.equal(result.handled, true);
    assert.ok(result.response instanceof Response);
    assert.equal(result.response.type, 'error');
    assert.equal(result.response.status, 0);
  }
  assert.equal(sw.writes.length, 0);
});

test('cached images stay available without network; cached scripts survive network loss', async () => {
  const sw = worker({ network: async () => { throw new TypeError('Failed to fetch'); } });
  sw.entries.set(`${origin}/src/_logo/chat.svg`, new Response('image'));
  sw.entries.set(`${origin}/src/js/main.js`, new Response('script'));
  assert.equal(await (await sw.request('/src/_logo/chat.svg')).response.text(), 'image');
  assert.equal(sw.requests.length, 0);
  assert.equal(await (await sw.request('/src/js/main.js')).response.text(), 'script');
  assert.equal(sw.requests.length, 1);
});

test('successful static fetch populates cache within the SW event lifetime', async () => {
  const sw = worker();
  const result = await sw.request('/src/_logo/new.svg');
  assert.equal(await result.response.text(), 'fresh');
  assert.equal(result.lifetimeTasks, 1);
  assert.equal(await sw.entries.get(`${origin}/src/_logo/new.svg`).clone().text(), 'fresh');
  await sw.request('/src/_logo/new.svg');
  assert.equal(sw.requests.length, 1);
});

test('HTTP errors and partial responses never overwrite good cached content', async () => {
  for (const status of [404, 500, 206]) {
    const sw = worker({ network: async () => new Response('failed or partial', { status }) });
    sw.entries.set(`${origin}/src/js/main.js`, new Response('good script'));
    assert.equal((await sw.request('/src/js/main.js')).response.status, status);
    assert.equal(await sw.entries.get(`${origin}/src/js/main.js`).text(), 'good script');
    assert.equal(sw.writes.length, 0);
  }
});

test('cache read/write failures do not break a successful network response', async () => {
  for (const options of [{ readFailure: true }, { writeFailure: true }]) {
    const sw = worker(options);
    const result = await sw.request('/src/_logo/new.svg');
    assert.equal(await result.response.text(), 'fresh');
    assert.equal(sw.requests.length, 1);
  }
});
