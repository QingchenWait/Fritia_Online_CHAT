import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchApprovedCharacterCards, fetchCurrentCharacterCard, parseCharacterIssue, isApprovedCharacterIssue, downloadCharacterAttachment, isThirdPartyCardInstalled } from '../src/js/third_party_cards_data.js';
import { normalizeCharacterRecord } from '../src/js/storage.js';
import { chooseFileDestination } from '../src/js/archive_io.js';
import { issue, png, prompt, wav, detailedDescription } from './third_party_cards_fixtures.mjs';

test('only open issues with both labels and template fields enter the catalog', () => {
  const card = parseCharacterIssue(issue());
  assert.equal(card.issueId, 8001); assert.equal(card.name, '图书管理员 1');
  assert.equal(card.url, 'https://github.com/QingchenWait/Fritia_Online_CHAT_plugins/issues/1');
  assert.equal(card.author, 'author1'); assert.ok(card.avatar.url.endsWith('avatar-1'));
  assert.ok(card.prompt.url.endsWith('prompt.txt')); assert.ok(card.voice.url.endsWith('voice.wav'));
  for (const invalid of [issue(1, { state: 'closed' }), issue(1, { labels: [{ name: '角色卡' }] }), issue(1, { labels: ['初审通过'] }), issue(1, { pull_request: {} }), issue(1, { body: '普通问题' })]) assert.equal(parseCharacterIssue(invalid), null);
  assert.equal(isApprovedCharacterIssue(issue(1, { labels: ['角色卡', '初审通过'] })), true);
  const missing = parseCharacterIssue(issue(1, { body: issue().body.replace('[voice.wav](https://github.com/user-attachments/files/111/voice.wav)', '_No response_') }));
  assert.equal(missing.voice, null);
  const html = parseCharacterIssue(issue(1, { body: issue().body.replace('![avatar.png](https://github.com/user-attachments/assets/avatar-1)', '<img src="https://github.com/user-attachments/assets/opaque-id">').replace('[voice.wav](https://github.com/user-attachments/files/111/voice.wav)', '<video src="https://github.com/user-attachments/assets/voice-id" controls></video>') }));
  assert.ok(html.avatar); assert.ok(html.voice);
});

test('all API pages are fetched afresh and locally filtered without catalog persistence', async () => {
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window;
  globalThis.window = {};
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: new URL(url), init });
    return Response.json(new URL(url).searchParams.get('page') === '1'
      ? Array.from({ length: 100 }, (_, index) => issue(index + 1))
      : [issue(101), issue(102, { state: 'closed' }), issue(103, { labels: ['角色卡'] })]);
  };
  try {
    const cards = await fetchApprovedCharacterCards(); assert.equal(cards.length, 101);
    await fetchApprovedCharacterCards(); assert.equal(requests.length, 4);
    for (const request of requests) {
      assert.equal(request.url.pathname, '/repos/QingchenWait/Fritia_Online_CHAT_plugins/issues');
      assert.equal(request.init.cache, 'no-store'); assert.equal(request.init.credentials, 'omit');
      assert.equal(request.url.searchParams.get('state'), 'open'); assert.equal(request.url.searchParams.get('labels'), '角色卡,初审通过');
    }
    assert.notEqual(requests[0].url.href, requests[2].url.href);
  } finally { globalThis.fetch = previousFetch; globalThis.window = previousWindow; }
});

test('optional detailed description preserves Markdown headings and code fences without consuming attachment fields', () => {
  const raw = issue(1);
  const card = parseCharacterIssue(raw);
  assert.equal(card.detailedDescription, detailedDescription);
  assert.ok(card.avatar.url.endsWith('/avatar-1'));
  assert.ok(card.prompt.url.endsWith('/prompt.txt'));
  assert.ok(card.voice.url.endsWith('/voice.wav'));
  assert.equal(parseCharacterIssue(issue(2)).detailedDescription, '');
  const section = `### 详细描述\n\n${detailedDescription}\n\n`;
  for (const replacement of ['', '### 详细描述\n\n   \n\n', '### 详细描述\n\n_No response_\n\n']) {
    assert.equal(parseCharacterIssue({ ...raw, body: raw.body.replace(section, replacement) }).detailedDescription, '');
  }
  const tildeMarkdown = detailedDescription.replaceAll('```', '~~~');
  assert.equal(parseCharacterIssue({ ...raw, body: raw.body.replace(detailedDescription, tildeMarkdown) }).detailedDescription, tildeMarkdown);
});

test('issue details and identity come directly from the new publishing repository', async () => {
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window;
  globalThis.window = {};
  const published = issue(3, { id: 5842434714, number: 42 });
  let requested;
  globalThis.fetch = async url => { requested = new URL(url); return Response.json(published); };
  try {
    const card = await fetchCurrentCharacterCard({ issueId: published.id, issueNumber: published.number });
    assert.equal(requested.pathname, '/repos/QingchenWait/Fritia_Online_CHAT_plugins/issues/42');
    assert.equal(card.issueId, published.id); assert.equal(card.issueNumber, 42);
    assert.equal(card.url, 'https://github.com/QingchenWait/Fritia_Online_CHAT_plugins/issues/42');
    assert.ok(isThirdPartyCardInstalled(card, { characters: [{ thirdPartyIssueId: published.id }] }));
    assert.equal(card.prompt.url, 'https://github.com/user-attachments/files/111/prompt.txt');
  } finally { globalThis.fetch = previousFetch; globalThis.window = previousWindow; }
});

test('attachments retain exact bytes and reject empty/wrong files', async () => {
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window;
  globalThis.window = {};
  try {
    for (const [kind, bytes, mime] of [['avatar', png, 'image/png'], ['prompt', Buffer.from(prompt), 'text/plain'], ['voice', wav, 'audio/wav']]) {
      globalThis.fetch = async () => new Response(bytes);
      const result = await downloadCharacterAttachment({ url: 'https://github.com/user-attachments/files/1/file', name: 'file' }, kind);
      assert.equal(result.mime, mime); assert.deepEqual(Buffer.from(await result.blob.arrayBuffer()), bytes);
      if (kind === 'prompt') assert.equal(result.text, prompt);
    }
    globalThis.fetch = async () => new Response('<!doctype html><html>attachment unavailable</html>');
    for (const kind of ['avatar', 'prompt', 'voice']) await assert.rejects(downloadCharacterAttachment({ url: 'https://github.com/user-attachments/files/1/file' }, kind));
    globalThis.fetch = async () => new Response('');
    await assert.rejects(downloadCharacterAttachment({ url: 'https://github.com/user-attachments/files/1/file' }, 'prompt'), /为空/);
  } finally { globalThis.fetch = previousFetch; globalThis.window = previousWindow; }
});

test('third-party identity survives normalization without changing other character records', () => {
  for (const source of ['builtin', 'preset', 'custom']) {
    const original = normalizeCharacterRecord({ id: source, name: '同名角色', source });
    assert.equal(Object.hasOwn(original, 'thirdPartyIssueId'), false);
    assert.equal(isThirdPartyCardInstalled({ issueId: 8001 }, { characters: [original] }), false);
  }
  const imported = normalizeCharacterRecord({ id: 'imported', name: '同名角色', source: 'custom', thirdPartyIssueId: 8001, thirdPartyIssueNumber: 1 });
  assert.equal(normalizeCharacterRecord(imported).thirdPartyIssueId, 8001);
  assert.equal(isThirdPartyCardInstalled({ issueId: 8001 }, { characters: [imported] }), true);
});

test('Windows and Android third-party downloads use the generic native proxy and preserve binary bytes', async () => {
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window;
  globalThis.fetch = async () => { throw new Error('Browser fetch must not be used in a native client'); };
  try {
    for (const platform of ['windows', 'windows-internals', 'android']) {
      const requests = [];
      let bytes;
      const invoke = async (command, { request }) => {
        requests.push({ command, request });
        return { status: 200, headers: [{ name: 'content-type', value: 'application/octet-stream' }],
          ...(platform === 'windows-internals' ? { body_base64: bytes.toString('base64') } : { bodyBase64: bytes.toString('base64') }) };
      };
      globalThis.window = platform === 'android'
        ? { FritiaAndroid: {}, FritiaArchive: { request() { throw new Error('WebDAV must not handle GitHub downloads'); } }, __FRITIA_ANDROID_SHELL__: { invoke } }
        : platform === 'windows-internals' ? { __TAURI_INTERNALS__: { invoke } } : { __TAURI__: { core: { invoke } } };
      for (const [kind, content] of [['avatar', png], ['prompt', Buffer.from(prompt)], ['voice', wav]]) {
        bytes = content;
        const resource = await downloadCharacterAttachment({ url: 'https://github.com/user-attachments/files/1/file', name: 'file' }, kind);
        assert.deepEqual(Buffer.from(await resource.blob.arrayBuffer()), content);
        const { command, request } = requests.at(-1);
        assert.equal(command, 'proxy_fetch'); assert.equal(request.method, 'GET'); assert.equal(request.bodyBase64, null);
        assert.ok(new URL(request.url).searchParams.has('_fritia')); assert.deepEqual(request.headers, [{ name: 'accept', value: '*/*' }]);
      }
      assert.equal(requests.length, 3);
    }
  } finally { globalThis.fetch = previousFetch; globalThis.window = previousWindow; }
});

test('native HTTP and transport failures are reported without falling back to browser fetch', async () => {
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window;
  let browserRequests = 0;
  globalThis.fetch = async () => { browserRequests += 1; return new Response('unexpected'); };
  try {
    const attachment = { url: 'https://github.com/user-attachments/files/1/file', name: 'file' };
    globalThis.window = { __TAURI__: { core: { invoke: async () => ({ status: 404, bodyBase64: '' }) } } };
    await assert.rejects(downloadCharacterAttachment(attachment, 'avatar'), /HTTP 404/);
    window.__TAURI__.core.invoke = async () => { throw new Error('native transport unavailable'); };
    await assert.rejects(downloadCharacterAttachment(attachment, 'avatar'), /native transport unavailable/);
    assert.equal(browserRequests, 0);
  } finally { globalThis.fetch = previousFetch; globalThis.window = previousWindow; }
});

test('resource picker preserves existing ZIP/PNG support and supplies every new MIME type', async () => {
  const previous = globalThis.window;
  const requests = [], writes = [];
  globalThis.window = { showSaveFilePicker: async options => {
    requests.push(options); return { createWritable: async () => ({ write: async blob => writes.push(blob.size), close: async () => {}, abort: async () => {} }) };
  } };
  try {
    for (const [name, mime] of [['save.zip', 'application/zip'], ['image.png', 'image/png'], ['avatar.jpg', 'image/jpeg'], ['avatar.webp', 'image/webp'], ['prompt.txt', 'text/plain'], ['voice.mp3', 'audio/mpeg'], ['voice.wav', 'audio/wav']]) {
      const save = await chooseFileDestination(name, mime); await save(new Blob(['content']));
      assert.equal(requests.at(-1).suggestedName, name); assert.ok(requests.at(-1).types[0].accept[mime]);
    }
    assert.equal(writes.length, 7);
  } finally { globalThis.window = previous; }
});
