import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { attachmentFixtures } from './attachment_fixtures.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.CHAT_TEST_URL || 'http://127.0.0.1:3036';
const screenshotDir = path.join(tmpdir(), 'fritia-grok-v110');
await mkdir(screenshotDir, { recursive: true });
const fixtures = { ...attachmentFixtures(), video: { type: 'video', name: 'fixture.webm', mime: 'video/webm',
  dataUrl: `data:video/webm;base64,${(await readFile(new URL('./fixtures/grok-video.webm', import.meta.url))).toString('base64')}` } };
let server, browser;
try {
  if (!process.env.CHAT_TEST_URL) {
    server = spawn(process.execPath, ['tools/static_server.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...process.env, PORT: '3036' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(new Error(`Server exited: ${code}`))); });
  }
  browser = await chromium.launch({ headless: true, ...(process.env.CHAT_TEST_BROWSER ? { executablePath: process.env.CHAT_TEST_BROWSER } : {}) });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [];
    let uiRequestCount = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('fritia_chat_onboarding_dismissed', '1');
      window.fixtureAlerts = []; window.alert = text => window.fixtureAlerts.push(text);
      window.fixtureOpened = []; window.open = url => { window.fixtureOpened.push(url); return null; };
    });
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.endsWith('/models')) return route.fulfill({ json: { data: [{ id: 'custom-object', capabilities: { vision: true, reasoning: true } }] } });
      if (url.endsWith('/chat/completions')) { uiRequestCount++; return route.fulfill({ json: { choices: [{ message: { content: '自定义模型正常回复' } }] } }); }
      return url.startsWith(origin) ? route.continue() : route.abort();
    });
    await page.goto(origin); await page.waitForFunction(() => document.querySelector('.conversation-item'));
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('fritia-ui-open-panel', { detail: { id: 'settings-panel', settingsSection: 'model', modelTab: 'chat' } })));
    const add = page.locator(viewport.width <= 760 ? '#model-chat-add-mobile' : '#model-chat-add');
    await add.click(); await page.click('[data-provider-preset="grok"]');
    assert.equal(await page.inputValue('#chat-provider-id'), 'Grok');
    assert.equal(await page.inputValue('#chat-provider-base-url'), 'https://api.x.ai/v1');
    assert.equal(await page.inputValue('#chat-provider-model'), 'grok-4.7');
    await page.click('#chat-provider-get-key');
    assert.deepEqual(await page.evaluate(() => window.fixtureOpened), ['https://console.x.ai/']);
    await add.click();
    await page.waitForFunction(() => [...document.querySelectorAll('#chat-provider-preset-menu img')].every(image => image.complete && image.naturalWidth > 0));
    const iconSizes = await page.locator('#chat-provider-preset-menu img').evaluateAll(images => images.map(image => ({ width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height })));
    assert.ok(iconSizes.every(size => size.width === iconSizes[0].width && size.height === iconSizes[0].height), 'Grok logo matches every preset icon size');
    await page.screenshot({ path: path.join(screenshotDir, `grok-settings-${viewport.width}.png`) });
    await page.keyboard.press('Escape');
    await page.evaluate(async () => {
      const settings = await import('/src/js/settings.js');
      const reasoning = await import('/src/js/model_reasoning.js');
      const provider = { id: 'custom-object', model: 'custom-object', baseUrl: 'https://metadata.fixture.test/v1', apiKey: 'fixture-only' };
      settings.saveSettings({ chatProviders: [provider], defaultChatProviderId: provider.id });
      await reasoning.loadModelReasoningProfile(provider);
      document.querySelector('[data-panel-close="settings-panel"]').click();
    });
    await page.locator('.conversation-item').first().click();
    await page.fill('#message-input', '自定义模型对象能力字段测试');
    await page.press('#message-input', 'Enter');
    await page.waitForFunction(() => [...document.querySelectorAll('.message-content')].some(node => node.textContent.includes('自定义模型正常回复')));
    assert.deepEqual(await page.evaluate(() => window.fixtureAlerts), [], 'screenshot metadata cannot trigger false persistence error');
    assert.ok(await page.evaluate(() => localStorage.getItem('fritia_next_chat_store').includes('自定义模型对象能力字段测试')));
    const beforeQuota = uiRequestCount;
    await page.evaluate(() => {
      window.fixtureSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'fritia_next_chat_store') throw new DOMException('fixture storage full', 'QuotaExceededError');
        return window.fixtureSetItem.call(this, key, value);
      };
    });
    await page.fill('#message-input', '真正持久化失败必须保留草稿');
    await page.press('#message-input', 'Enter');
    assert.equal(await page.inputValue('#message-input'), '真正持久化失败必须保留草稿');
    assert.equal(uiRequestCount, beforeQuota);
    assert.ok(await page.evaluate(() => window.fixtureAlerts[0].includes('本地持久化失败')));
    await page.evaluate(() => { Storage.prototype.setItem = window.fixtureSetItem; delete window.fixtureSetItem; window.fixtureAlerts = []; });
    await page.fill('#message-input', '');

    const result = await page.evaluate(async fixtures => {
      const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
      const checks = [], requests = [];
      const storage = await import('/src/js/storage.js'), settings = await import('/src/js/settings.js');
      const engine = await import('/src/js/chat_engine.js'), tools = await import('/src/js/tool_chat_engine.js');
      const groupEngine = await import('/src/js/roundtable.js'), mcp = await import('/src/js/mcp_tools.js');
      const memory = await import('/src/js/long_term_memory.js');
      const provider = { id: 'Grok', baseUrl: 'https://api.x.ai/v1', model: 'grok-4.7', apiKey: 'fixture-only' };
      const config = settings.normalizeSettings({ chatProviders: [provider], defaultChatProviderId: provider.id, defaultImageCaptionProviderId: provider.id });
      settings.saveSettings(config);
      let store = storage.loadAppStore();
      const character = store.characters[0], conversation = store.conversations.find(item => item.type === 'private' && item.memberIds[0] === character.id);
      const group = { ...conversation, id: 'grok-group-fixture', type: 'group', title: 'Grok 测试群', memberIds: [character.id], groupSettings: { autoBotChat: false, idleTalk: false, maxParticipants: 2, botChainLimit: 1 } };
      store.conversations.push(group); store.messages[group.id] = [];
      store = storage.saveAppStore(store);
      const originalFetch = window.fetch;
      let mode = 'success', mcpCalled = 0, mixedRequests = 0;
      window.fetch = async (url, options) => {
        if (String(url).endsWith('/stt')) return Response.json({ text: 'AUDIO_MARKER_1007', duration: 1 });
        if (String(url).includes('mcp.fixture.test')) {
          const request = JSON.parse(options.body || '{}');
          const result = request.method === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }
            : request.method === 'tools/list' ? { tools: [{ name: 'lookup', description: '查询', inputSchema: { type: 'object', properties: {} } }] }
              : request.method === 'tools/call' ? (++mcpCalled, { content: [{ type: 'text', text: 'TOOL_RESULT_42' }] }) : {};
          return Response.json({ jsonrpc: '2.0', id: request.id, result });
        }
        if (!String(url).endsWith('/chat/completions')) return originalFetch(url, options);
        const body = JSON.parse(options.body); requests.push(body);
        if (mode === 'network') throw new TypeError('fixture network failure');
        if (mode === 'http') return Response.json({ error: { message: 'invalid API key' } }, { status: 401 });
        if (mode === 'mixed-group' && ++mixedRequests === 2) return Response.json({ error: { message: 'second speaker failure' } }, { status: 503 });
        if (mode === 'error200') return Response.json({ error: { message: 'fixture API error', code: 400 } });
        if (mode === 'sse-error') return new Response('data: {"choices":[{"delta":{"content":"未完成回复"}}]}\n\ndata: {"error":{"message":"fixture streamed error","code":500}}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
        if (body.tools?.length && !body.messages.some(item => item.role === 'tool')) {
          return Response.json({ choices: [{ message: { content: '', reasoning_content: '工具前思考', tool_calls: [{ id: 'fixture-call', type: 'function', function: { name: body.tools[0].function.name, arguments: '{}' } }] } }] });
        }
        const isGroup = JSON.stringify(body).includes('圆桌密语');
        const content = mode === 'normal-json-example' ? '{"error":{"message":"file type is not supported VALID_JSON_SAMPLE"}}'
          : isGroup ? JSON.stringify({ text: '@分析员 TOOL_RESULT_42 正常回答', targetId: 'player', intent: 'answer', emotion: 'happy', wantsFollowUp: false }) : '讨论 error、API 请求失败，但这是正常的回复。';
        return Response.json({ choices: [{ message: { role: 'assistant', content, reasoning_content: 'Grok 真实协议思考字段' } }] });
      };
      const disk = () => JSON.parse(localStorage.getItem(storage.STORAGE_KEYS.app));
      const send = (text, attachments = [], target = conversation) => {
        const user = { id: crypto.randomUUID(), role: 'user', speakerId: 'player', speakerName: '分析员', text, attachments, createdAt: Date.now() };
        store = storage.appendMessage(store, target.id, user); return user;
      };
      const invoke = (user, effort = 'high', extra = {}) => engine.completePrivateMessageReply({ store, conversation, character, text: user.text, userMessage: user, chatSettings: config, reasoningEffort: effort, onStore: next => { store = next; }, ...extra });
      const legacy = { id: 'legacy-error-fixture', role: 'assistant', speakerId: character.id, text: '版本更新前的历史报错', status: 'error', createdAt: Date.now() };
      store = storage.appendMessage(store, conversation.id, legacy);
      for (const effort of ['low', 'medium', 'high', 'xhigh']) {
        const user = send(`正常消息 ${effort}`); await invoke(user, effort);
        check(requests.at(-1).reasoning_effort === effort, `private ${effort} request mapping`);
        check(disk().messages[conversation.id].some(item => item.id === user.id), `normal ${effort} persists`);
      }
      for (const [name, attachment, marker] of [['image', fixtures.image, 'image_url'], ['audio', fixtures.audio, 'AUDIO_MARKER_1007'], ['pdf', fixtures.pdf, 'PDF_MARKER_5772'], ['docx', fixtures.docx, 'DOCX_MARKER_2718']]) {
        const user = send(`正常附件 ${name}`, [attachment]); await invoke(user);
        check(JSON.stringify(requests.at(-1)).includes(marker), `private ${name} input`);
      }
      const videoAttachment = fixtures.video;
      await invoke(send('正常视频输入', [videoAttachment]));
      check(requests.at(-1).messages.some(item => Array.isArray(item.content) && item.content.some(part => part.type === 'image_url'))
        && JSON.stringify(requests.at(-1)).includes('均匀取样'), 'private video frame input');
      const voiceUser = send('语音失败仍保留正常文字');
      await invoke(voiceUser, 'high', { voiceReplyEnabled: true });
      check(disk().messages[conversation.id].some(item => item.id === voiceUser.id)
        && store.messages[conversation.id].at(-1).status === 'sent', 'TTS failure keeps successful LLM turn');
      for (const failure of ['http', 'network', 'error200', 'sse-error']) {
        const marker = `FAILED_TURN_${failure}_${crypto.randomUUID()}`;
        const attachment = { type: 'file', name: marker + '.txt', mime: 'text/plain', dataUrl: 'data:text/plain;base64,' + btoa(marker) };
        const user = send(marker, [attachment]);
        const beforeIds = memory.getLongTermMemoryStore().memories.map(item => item.id);
        mode = failure; await invoke(user); mode = 'success';
        check(store.messages[conversation.id].at(-1).status === 'error', `${failure} runtime bubble`);
        check(!disk().messages[conversation.id].some(item => item.id === user.id), `${failure} user absent from disk`);
        check(!disk().messages[conversation.id].some(item => item.id === store.messages[conversation.id].at(-1).id), `${failure} error absent from disk`);
        check(memory.getLongTermMemoryStore().memories.every(item => beforeIds.includes(item.id)), `${failure} no memory insertion`);
        await invoke(send('下一轮正常请求 ' + failure));
        check(!JSON.stringify(requests.at(-1)).includes(marker), `${failure} text and attachment excluded from next context`);
      }
      check(disk().messages[conversation.id].some(item => item.id === legacy.id), 'legacy error is never deleted');
      check(disk().messages[conversation.id].some(item => item.text.includes('讨论 error')), 'ordinary error discussion persists');
      mode = 'normal-json-example'; await invoke(send('正常的 JSON 错误示例讲解')); mode = 'success';
      await invoke(send('继续讨论正常示例'));
      check(JSON.stringify(requests.at(-1)).includes('VALID_JSON_SAMPLE'), 'normal JSON error example remains in context');

      const client = mcp.upsertMcpClient({ ...mcp.createDefaultMcpClient(), id: 'grok-mcp-fixture', name: 'fixture', permission: 'allow', config: { url: 'https://mcp.fixture.test/mcp', headers: {} }, configJson: '' });
      mcp.saveMcpConfig({ permissions: { ...mcp.getMcpConfig().permissions, level: 'allow', requireManualApproval: false } });
      const clientId = client.clients.find(item => item.id === 'grok-mcp-fixture').id;
      const toolUser = send('工具模式正常请求');
      await tools.completeToolPrivateMessageReply({ store, conversation, character, text: toolUser.text, userMessage: toolUser, selectedClientIds: [clientId], chatSettings: config, reasoningEffort: 'xhigh', onStore: next => { store = next; } });
      check(mcpCalled > 0 && store.messages[conversation.id].at(-1).status === 'sent', 'private MCP function loop');
      check(requests.at(-1).messages.some(item => item.role === 'tool' && item.content.includes('TOOL_RESULT_42')), 'private MCP result goes back to Grok');
      const failedToolUser = send('FAILED_TOOL_INPUT', [fixtures.image]); mode = 'http';
      await tools.completeToolPrivateMessageReply({ store, conversation, character, text: failedToolUser.text, userMessage: failedToolUser, selectedClientIds: [clientId], chatSettings: config, onStore: next => { store = next; } }); mode = 'success';
      check(!disk().messages[conversation.id].some(item => item.id === failedToolUser.id), 'failed tool user is transient');
      check(!store.messages[conversation.id].at(-1).meta.toolTrace.resumeState, 'failed tool snapshot cannot resume');
      const stoppedUser = send('手动停止保留正常输入'), controller = new AbortController(); controller.abort();
      await tools.completeToolPrivateMessageReply({ store, conversation, character, text: stoppedUser.text, userMessage: stoppedUser,
        chatSettings: config, signal: controller.signal, onStore: next => { store = next; } });
      check(disk().messages[conversation.id].some(item => item.id === stoppedUser.id), 'manual stop is not misclassified as LLM failure');

      const groupSend = async (user, effort = 'medium') => groupEngine.runRoundtableTurn({ store, conversation: group, characters: store.characters, triggerText: user.text, triggerAttachments: user.attachments, triggerMessageId: user.id, chatSettings: config, reasoningEffort: effort, onStore: next => { store = next; } });
      for (const [name, attachment, marker] of [['audio', fixtures.audio, 'AUDIO_MARKER_1007'], ['docx', fixtures.docx, 'DOCX_MARKER_2718'], ['video', videoAttachment, '均匀取样']]) {
        await groupSend(send(`@${character.name} 群聊 ${name}`, [attachment], group));
        check(JSON.stringify(requests.at(-1)).includes(marker), `group ${name} input`);
      }
      await groupSend(send(`@${character.name} 群聊图片`, [fixtures.image], group), 'xhigh');
      check(requests.at(-1).reasoning_effort === 'xhigh' && JSON.stringify(requests.at(-1)).includes('image_url'), 'group image and selected reasoning');
      const groupFailure = send(`@${character.name} FAILED_GROUP_INPUT`, [fixtures.docx], group); mode = 'http'; await groupSend(groupFailure); mode = 'success';
      check(!disk().messages[group.id].some(item => item.id === groupFailure.id), 'exact failed group trigger is transient');
      await groupSend(send(`@${character.name} 群聊继续`, [], group));
      check(!JSON.stringify(requests.at(-1)).includes('FAILED_GROUP_INPUT'), 'failed group text excluded from next context');
      mcp.setSelectedMcpClientIds(group.id, [clientId]);
      const callsBefore = mcpCalled;
      await groupSend(send(`@${character.name} 群聊工具调用`, [], group));
      check(mcpCalled > callsBefore && store.messages[group.id].at(-1).status === 'sent', 'group MCP loop and JSON final reply');
      check(store.messages[group.id].at(-1).meta.toolTrace.calls.length > 0, 'group preserves successful tool trace');
      check(store.messages[group.id].at(-1).meta.toolTrace.thoughts.every(item => item.status === 'done'), 'completed group trace shows done');
      const secondCharacter = store.characters.find(item => item.id !== character.id);
      const mixedGroup = { ...group, id: 'mixed-group-fixture', memberIds: [character.id, secondCharacter.id] };
      store.conversations.push(mixedGroup); store.messages[mixedGroup.id] = [];
      const mixedUser = send(`@${character.name} @${secondCharacter.name} 同一输入的正常回复不得误删`, [], mixedGroup);
      mode = 'mixed-group';
      await groupEngine.runRoundtableTurn({ store, conversation: mixedGroup, characters: store.characters, triggerText: mixedUser.text,
        triggerMessageId: mixedUser.id, chatSettings: config, onStore: next => { store = next; } });
      mode = 'success';
      check(disk().messages[mixedGroup.id].some(item => item.id === mixedUser.id), 'partially successful group retains proven normal input');
      check(disk().messages[mixedGroup.id].some(item => item.role === 'assistant' && item.status === 'sent')
        && !disk().messages[mixedGroup.id].some(item => item.status === 'error'), 'mixed group keeps normal reply and excludes only failed reply');
      store.activeConversationId = group.id; storage.saveAppStore(store);
      window.fetch = originalFetch;
      return { checks, failedMarkers: ['FAILED_TOOL_INPUT', 'FAILED_GROUP_INPUT'], groupId: group.id };
    }, fixtures);
    assert.ok(result.checks.length >= 35);
    assert.equal(await page.locator('#chat-model-control-btn').getAttribute('aria-disabled'), 'false');
    await page.click('#chat-model-control-btn');
    assert.equal(await page.locator('#chat-reasoning-options button').count(), 4);
    assert.ok(await page.locator('#chat-model-control-icon').getAttribute('src').then(src => src.endsWith('/grok.svg')));
    assert.ok(await page.locator('#external-tools-toggle-btn').isVisible());
    await page.screenshot({ path: path.join(screenshotDir, `grok-group-${viewport.width}.png`) });
    await page.reload(); await page.waitForFunction(() => document.querySelector('.conversation-item'));
    const persisted = await page.evaluate(() => localStorage.getItem('fritia_next_chat_store'));
    result.failedMarkers.forEach(marker => assert.ok(!persisted.includes(marker)));
    assert.ok(persisted.includes('legacy-error-fixture'));
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${viewport.width}×${viewport.height}: ${result.checks.length} runtime checks + exact preset/logo/key link, screenshot bug, group UI, reload isolation`);
  }
} finally {
  await browser?.close(); server?.kill();
}
