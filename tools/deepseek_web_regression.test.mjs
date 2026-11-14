import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDeepSeekWebReference, isDeepSeekWebAvailable } from '../src/js/deepseek_web.js';
import { normalizeSettings } from '../src/js/settings.js';
import { requestLlmCompletion } from '../src/js/llm_request.js';

const provider = { id: 'deepseek-web-fixture', apiKey: 'fixture-only', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash' };
function settings(flags = {}, selected = provider) {
  return { ...selected, chatProviders: [selected], defaultChatProviderId: selected.id,
    defaultImageCaptionProviderId: selected.id, temperature: 0.67,
    deepseekWebSearch: false, deepseekReadUrl: false, ...flags };
}

async function withApi(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), body: options.body ? JSON.parse(options.body) : null, options };
    calls.push(call);
    return handler(call, calls);
  };
  try { return await run(calls); }
  finally { globalThis.fetch = original; }
}

function fixtureApi(plan = { queries: ['DeepSeek 最新动态'], urls: ['https://example.com/article'] }) {
  return call => {
    if (call.url.endsWith('/chat/completions')) return Response.json({ choices: [{ message: { content: JSON.stringify(plan) } }] });
    if (call.url.endsWith('/tools/search')) return Response.json({ results: [{ title: '搜索来源', url: 'https://example.org/result',
      summary: 'SEARCH_SUMMARY', content: 'SEARCH_FULL_CONTENT' }] });
    if (call.url.endsWith('/tools/fetch')) return Response.json({ title: '用户网页', content: 'FETCH_FULL_CONTENT' });
    throw new Error(`Unexpected fixture request: ${call.url}`);
  };
}

test('only the configured exact deepseek-flash model exposes web extensions', () => {
  assert.equal(isDeepSeekWebAvailable(provider), true);
  assert.equal(isDeepSeekWebAvailable({ ...provider, baseUrl: 'http://localhost:8080/api/v1' }), true);
  for (const model of ['deepseek-v4-pro', 'deepseek-pro', 'deepseek-v4-flash', 'deepseek-flash-preview', 'other/deepseek-flash', 'gpt-6-luna']) {
    assert.equal(isDeepSeekWebAvailable({ ...provider, model }), false, model);
  }
  for (const patch of [{ apiKey: '' }, { baseUrl: '' }, { baseUrl: 'not-a-url' }, { baseUrl: 'file:///tmp/api' }]) {
    assert.equal(isDeepSeekWebAvailable({ ...provider, ...patch }), false);
  }
});

test('new switches normalize to off and preserve independent enabled states', () => {
  const original = normalizeSettings(settings());
  assert.equal(original.deepseekWebSearch, false); assert.equal(original.deepseekReadUrl, false);
  for (const deepseekWebSearch of [false, true]) for (const deepseekReadUrl of [false, true]) {
    const normalized = normalizeSettings(settings({ deepseekWebSearch, deepseekReadUrl }));
    assert.equal(normalized.deepseekWebSearch, deepseekWebSearch);
    assert.equal(normalized.deepseekReadUrl, deepseekReadUrl);
  }
});

test('disabled switches and unsupported models make no planner or tool requests', async () => {
  await withApi(() => { throw new Error('A disabled extension made a network request'); }, async calls => {
    assert.equal(await buildDeepSeekWebReference({ settings: settings(), userText: '搜索新闻 https://example.com/article' }), null);
    assert.equal(await buildDeepSeekWebReference({ settings: settings({ deepseekWebSearch: true, deepseekReadUrl: true }, { ...provider, model: 'deepseek-v4-pro' }), userText: '搜索新闻' }), null);
    assert.equal(calls.length, 0);
  });
});

test('the four switch combinations independently control raw Search and Fetch', async () => {
  for (const deepseekWebSearch of [false, true]) for (const deepseekReadUrl of [false, true]) {
    await withApi(fixtureApi(), async calls => {
      const reference = await buildDeepSeekWebReference({ settings: settings({ deepseekWebSearch, deepseekReadUrl }),
        userText: '查一下 DeepSeek 的新功能，并阅读 https://example.com/article' });
      assert.equal(calls.some(call => call.url.endsWith('/tools/search')), deepseekWebSearch);
      assert.equal(calls.some(call => call.url.endsWith('/tools/fetch')), deepseekReadUrl);
      if (!deepseekWebSearch && !deepseekReadUrl) { assert.equal(reference, null); return; }
      assert.equal(reference.role, 'system');
      assert.equal(typeof reference.content, 'string');
      if (deepseekWebSearch) assert.ok(reference.content.includes('SEARCH_FULL_CONTENT'));
      if (deepseekReadUrl) assert.ok(reference.content.includes('FETCH_FULL_CONTENT'));
    });
  }
});

test('configured API credentials and base paths are reused without native tool declarations', async () => {
  for (const baseUrl of ['https://api.deepseek.com', 'https://api.deepseek.com/v1/', 'https://gateway.example.test/deepseek/v1']) {
    const selected = { ...provider, baseUrl };
    await withApi(fixtureApi(), async calls => {
      await buildDeepSeekWebReference({ settings: settings({ deepseekWebSearch: true, deepseekReadUrl: true }, selected),
        userText: '阅读 https://example.com/article 并搜索最新资料' });
      const rawBase = baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
      assert.ok(calls.some(call => call.url === `${rawBase}/v1/tools/search`));
      assert.ok(calls.some(call => call.url === `${rawBase}/v1/tools/fetch`));
      for (const call of calls) {
        assert.equal(new Headers(call.options.headers).get('Authorization'), `Bearer ${selected.apiKey}`);
        assert.equal(new Headers(call.options.headers).get('Content-Type'), 'application/json');
        assert.equal(call.body.tools, undefined);
      }
      for (const call of calls.filter(call => call.url.endsWith('/tools/search'))) {
        assert.equal(call.body.count, 5); assert.equal(call.body.need_content, true);
      }
      const planner = calls.find(call => call.url.endsWith('/chat/completions'));
      assert.ok(planner);
      assert.equal(planner.body.model, 'deepseek-flash');
      assert.equal(planner.body.stream, false);
      assert.deepEqual(planner.body.thinking, { type: 'disabled' });
      assert.deepEqual(planner.body.response_format, { type: 'json_object' });
      assert.equal(planner.body.max_tokens, undefined);
      assert.equal(planner.body.max_completion_tokens, undefined);
    });
  }
});

test('reading accepts user links from this turn and history while rejecting invented links', async () => {
  await withApi(fixtureApi({ queries: ['should never search'], urls: ['https://example.com/article', 'https://history.example.org/page',
    'https://invented.example.net/never', 'javascript:alert(1)', 'https://name:password@example.com/private'] }), async calls => {
    const reference = await buildDeepSeekWebReference({ settings: settings({ deepseekReadUrl: true }),
      userText: '也读一下 https://example.com/article',
      history: [{ role: 'user', text: '先前的链接 https://history.example.org/page' },
        { role: 'assistant', text: 'https://invented.example.net/never' }] });
    const urls = calls.filter(call => call.url.endsWith('/tools/fetch')).map(call => call.body.url);
    assert.ok(urls.includes('https://example.com/article'));
    assert.ok(urls.includes('https://history.example.org/page'));
    assert.equal(urls.includes('https://invented.example.net/never'), false);
    assert.ok(urls.every(url => /^https?:\/\//.test(url) && !url.includes('password')));
    assert.equal(calls.some(call => call.url.endsWith('/tools/search')), false);
    assert.ok(reference.content.includes('FETCH_FULL_CONTENT'));
  });
});

test('planner failure falls back to a valid Unicode search and the current explicit URL', async () => {
  const query = '😀'.repeat(150) + ' 最新资料 https://example.com/article';
  const api = fixtureApi();
  await withApi(call => call.url.endsWith('/chat/completions') ? Response.json({ error: { message: 'planner unavailable' } }, { status: 503 }) : api(call), async calls => {
    const reference = await buildDeepSeekWebReference({ settings: settings({ deepseekWebSearch: true, deepseekReadUrl: true }), userText: query });
    const searches = calls.filter(call => call.url.endsWith('/tools/search'));
    assert.ok(searches.length > 0);
    for (const { body } of searches) {
      assert.ok(Array.from(body.query).length >= 1 && Array.from(body.query).length <= 128);
      assert.equal(body.query.includes('\uFFFD'), false);
      assert.equal(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(body.query), false);
    }
    assert.ok(calls.some(call => call.url.endsWith('/tools/fetch') && call.body.url === 'https://example.com/article'));
    assert.ok(reference.content.includes('FETCH_FULL_CONTENT'));
  });
});

test('a planner can skip small talk, and link-only mode needs a user-provided candidate', async () => {
  await withApi(fixtureApi({ queries: [], urls: [] }), async calls => {
    assert.equal(await buildDeepSeekWebReference({ settings: settings({ deepseekWebSearch: true }), userText: '你好，今天一起散步吧' }), null);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.endsWith('/chat/completions'), true);
  });
  await withApi(() => { throw new Error('Link-only mode should not request without a user URL'); }, async calls => {
    assert.equal(await buildDeepSeekWebReference({ settings: settings({ deepseekReadUrl: true }), userText: '读读刚才的网站',
      history: [{ role: 'assistant', text: 'https://invented.example.net/page' }] }), null);
    assert.equal(calls.length, 0);
  });
});

test('invalid planner JSON safely falls back and planned queries remain within the API Unicode limit', async () => {
  const api = fixtureApi();
  await withApi(call => call.url.endsWith('/chat/completions')
    ? Response.json({ choices: [{ message: { content: '{"queries":[' } }] }) : api(call), async calls => {
    const reference = await buildDeepSeekWebReference({ settings: settings({ deepseekWebSearch: true }), userText: 'DeepSeek 最近发布了什么' });
    assert.ok(reference.content.includes('SEARCH_FULL_CONTENT'));
    assert.equal(calls.find(call => call.url.endsWith('/tools/search')).body.query, 'DeepSeek 最近发布了什么');
  });
  await withApi(fixtureApi({ queries: ['😀'.repeat(200), '   ', '😀'.repeat(200)], urls: [] }), async calls => {
    await buildDeepSeekWebReference({ settings: settings({ deepseekWebSearch: true }), userText: '查一下相关资料' });
    const searches = calls.filter(call => call.url.endsWith('/tools/search'));
    assert.equal(searches.length, 1);
    assert.equal(searches[0].body.query, '😀'.repeat(128));
  });
});

test('failed raw tools report unavailable evidence without fabricating content or throwing', async () => {
  const api = fixtureApi();
  await withApi(call => call.url.endsWith('/chat/completions') ? api(call) : Response.json({ error: { message: 'fixture tool unavailable' } }, { status: 401 }), async calls => {
    const reference = await buildDeepSeekWebReference({ settings: settings({ deepseekWebSearch: true, deepseekReadUrl: true }),
      userText: '查资料并阅读 https://example.com/article' });
    assert.equal(reference.role, 'system');
    assert.ok(/失败|不可用|未能|无法/.test(reference.content));
    assert.equal(reference.content.includes('FETCH_FULL_CONTENT'), false);
    assert.equal(reference.content.includes('SEARCH_FULL_CONTENT'), false);
    assert.equal(calls.filter(call => call.url.endsWith('/tools/search')).length, 1);
    assert.equal(calls.filter(call => call.url.endsWith('/tools/fetch')).length, 1);
  });
});

test('HTTP 200 API errors and empty results stay explicit and do not block the normal completion', async () => {
  const selected = settings({ deepseekWebSearch: true, deepseekReadUrl: true });
  let finalRequest = false;
  const api = fixtureApi();
  await withApi(call => {
    if (call.url.endsWith('/tools/search')) return Response.json({ results: [] });
    if (call.url.endsWith('/tools/fetch')) return Response.json({ error: { message: 'fixture not readable' } });
    if (finalRequest) return Response.json({ choices: [{ message: { content: '仍然正常回复' } }] });
    return api(call);
  }, async () => {
    const reference = await buildDeepSeekWebReference({ settings: selected, userText: '查一下并阅读 https://example.com/article' });
    assert.ok(reference.content.includes('"results":[]'));
    assert.ok(reference.content.includes('"error"'));
    assert.equal(reference.content.includes('fixture-only'), false);
    finalRequest = true;
    assert.equal(await requestLlmCompletion({ settings: selected, messages: [reference, { role: 'user', content: '请继续回复' }] }), '仍然正常回复');
  });
});

test('an explicit cancellation stops retrieval instead of falling back to more network work', async () => {
  const controller = new AbortController();
  const cancelled = new DOMException('fixture cancelled', 'AbortError');
  controller.abort(cancelled);
  await withApi(() => { throw new Error('A cancelled request reached the network'); }, async calls => {
    await assert.rejects(buildDeepSeekWebReference({ settings: settings({ deepseekWebSearch: true }), userText: '查资料', signal: controller.signal }), error => error.name === 'AbortError');
    assert.equal(calls.length, 0);
  });
  const activeController = new AbortController();
  await withApi(() => { activeController.abort(cancelled); throw cancelled; }, async calls => {
    await assert.rejects(buildDeepSeekWebReference({ settings: settings({ deepseekWebSearch: true }), userText: '查资料', signal: activeController.signal }), error => error.name === 'AbortError');
    assert.equal(calls.length, 1);
  });
});

test('retrieval never writes archives or mutates settings/history', async () => {
  const originalStorage = globalThis.localStorage;
  const selected = settings({ deepseekWebSearch: true, deepseekReadUrl: true });
  const history = [{ role: 'user', text: 'https://example.com/article' }];
  const before = structuredClone({ selected, history });
  globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error('retrieval wrote persisted state'); }, removeItem: () => { throw new Error('retrieval removed persisted state'); } };
  try {
    await withApi(fixtureApi(), async () => {
      assert.ok(await buildDeepSeekWebReference({ settings: selected, history, userText: '查最新资料' }));
    });
    assert.deepEqual({ selected, history }, before);
  } finally { globalThis.localStorage = originalStorage; }
});

test('the main completion keeps its JSON, sampling, thinking and existing function-tool contract', async () => {
  const selected = settings({ deepseekWebSearch: true, deepseekReadUrl: true });
  const tools = [{ type: 'function', function: { name: 'existing_mcp_tool', parameters: { type: 'object' } } }];
  const body = { stream: false, temperature: 0.42, top_p: 0.83, response_format: { type: 'json_object' }, tools, tool_choice: 'none' };
  await withApi(() => Response.json({ choices: [{ message: { content: '{"text":"原回复"}' } }] }), async calls => {
    assert.equal(await requestLlmCompletion({ settings: selected, messages: [{ role: 'user', content: '群聊 JSON 请求' }], body, reasoningEffort: 'high' }), '{"text":"原回复"}');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${provider.baseUrl}/chat/completions`);
    assert.deepEqual(calls[0].body.tools, tools);
    assert.deepEqual(calls[0].body.response_format, body.response_format);
    assert.equal(calls[0].body.tool_choice, 'none');
    assert.equal(calls[0].body.temperature, 0.42); assert.equal(calls[0].body.top_p, 0.83);
    assert.equal(calls[0].body.reasoning_effort, 'high');
    assert.deepEqual(calls[0].body.thinking, { type: 'enabled' });
  });
});
