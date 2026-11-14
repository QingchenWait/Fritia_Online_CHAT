import assert from 'node:assert/strict';

// Node-side UI test. The caller supplies a fresh, isolated APP page with the
// real preset corpus already loaded; only the model endpoint is intercepted.
export async function knowledgeBaseUiCases(page, viewport) {
  const name = `用户知识库 UI 验证 ${viewport.width}`;
  const source = 'LDFTEP 是制造索法抑制剂的核心材料之一。索法抑制剂通常被认为是昂贵的巴德尔抑制剂的廉价替代品，由恒沙调用自身的庞大算力推演得到，其成本仅需巴德尔抑制剂的十分之一左右。LDFTEP 在其中起到关键作用，其来源是分析员精子中的活性物质，吉诺拉生物通过研究获得了这种物质的量产手段。';
  const endpoint = 'https://kb-ui-fixture.invalid/v1';
  const requests = [];
  let requestFailure = null;
  await page.route(`${endpoint}/models`, route => route.fulfill({ json: { data: [{ id: 'fixture-model' }] } }));
  await page.route(`${endpoint}/chat/completions`, async route => {
    try {
      const body = route.request().postDataJSON();
      const question = JSON.stringify(body.messages.filter(message => message.role === 'user').at(-1)?.content);
      const references = body.messages.filter(message => typeof message.content === 'string'
        && message.content.startsWith('以下是当前对话可参考的知识库片段'));
      assert.equal(references.length, 1, 'the actual UI model request must contain one RAG reference message');
      const rag = references[0].content;
      let content;
      if (question.includes('看知识库，介绍一下 LDFTEP')) {
        assert.ok(rag.includes(`知识库《${name}》`) && rag.includes('LDFTEP.txt'), 'user source and filename must reach the actual UI request');
        assert.ok(rag.includes(source), 'the exact user-provided paragraph must reach the actual model input');
        content = `RAG_UI_LDFTEP_${viewport.width}：已从 LDFTEP.txt 读取资料。`;
      } else {
        assert.ok(question.includes('胧嫣的生日是几号'), `unexpected model request: ${question}`);
        assert.ok(rag.includes('尘白人物设定 (260622)') && rag.includes('角色简介-胧嫣.txt') && rag.includes('2月1日'),
          'the builtin birthday source must remain retrievable after the user-KB question');
        content = `RAG_UI_BIRTHDAY_${viewport.width}：胧嫣的生日是2月1日。`;
      }
      requests.push({ question, rag, content });
      await route.fulfill({ json: { choices: [{ message: { role: 'assistant', content } }] } });
    } catch (error) {
      requestFailure = error;
      await route.fulfill({ status: 500, json: { error: { message: `RAG fixture assertion: ${error.message}` } } });
    }
  });

  // Exercise the actual settings controls rather than manufacturing KB rows or
  // changing the active IDs in a data-layer fixture. Keep the preset switched on.
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('fritia-ui-open-panel', {
    detail: { id: 'settings-panel', settingsSection: 'knowledge' }
  })));
  await page.fill('#kb-name-input', name);
  await page.click('#kb-create-btn');
  await page.waitForFunction(name => document.getElementById('kb-current-title').textContent === name, name);
  await page.setInputFiles('#kb-file-input', { name: 'LDFTEP.txt', mimeType: 'text/plain', buffer: Buffer.from(source) });
  await page.waitForFunction(async name => {
    const kb = await import('/src/js/knowledge_base.js');
    const archive = await kb.exportKnowledgeBaseArchive();
    const created = archive.knowledgeBases.find(item => item.name === name);
    return created?.fileCount === 1 && archive.indexes.some(item => item.kbId === created.id && item.docs?.length === created.chunkCount);
  }, name);
  await page.click('#kb-enable-toggle');
  await page.waitForFunction(() => document.getElementById('kb-active-status').textContent.includes('未启用'));
  await page.click('#kb-enable-toggle');
  await page.waitForFunction(() => document.getElementById('kb-active-status').textContent.includes('正在参与'));
  const enabled = await page.evaluate(async name => {
    const kb = await import('/src/js/knowledge_base.js');
    const active = new Set(kb.getActiveKnowledgeBaseIds());
    return (await kb.listKnowledgeBases()).filter(item => active.has(item.id)).map(item => item.name);
  }, name);
  assert.ok(enabled.includes(name) && enabled.includes('尘白人物设定 (260622)'), 'both the builtin and user KB must stay enabled');
  await page.click('#settings-panel [data-panel-close="settings-panel"]');

  await page.evaluate(async endpoint => {
    const storage = await import('/src/js/storage.js');
    const settings = await import('/src/js/settings.js');
    const provider = { id: 'kb-ui-fixture', apiKey: 'fixture-only', baseUrl: endpoint, model: 'fixture-model' };
    settings.saveSettings({ chatProviders: [provider], defaultChatProviderId: provider.id,
      defaultImageCaptionProviderId: provider.id, stream: false, deepseekWebSearch: false, deepseekReadUrl: false });
    const memories = (await import('/src/js/long_term_memory.js')).getLongTermMemoryStore();
    memories.settings.enabled = false;
    localStorage.setItem(storage.STORAGE_KEYS.longTermMemory, JSON.stringify(memories));
    const app = storage.loadAppStore();
    const texts = [
      '芙提雅，你在海姆达尔当研究员的时候有什么故事？',
      '分析员，小老师是海姆达尔部队的研究员，擅长火种技术。我的外骨骼和武器都经过认真的设计，基地里每位战友都很喜欢小老师的发明。',
      '芬妮和里芙呢？你们经常一起出任务吗？',
      '芬妮是海姆达尔部队的黄金狮子，武器和外骨骼独特，性格很可爱；里芙是可靠的队员。分析员在海姆达尔基地和大家一起执行任务。'
    ];
    app.messages['private:fritia'] = texts.map((text, index) => storage.normalizeMessage({
      id: `kb-ui-history-${index}`, text, role: index % 2 ? 'assistant' : 'user',
      speakerId: index % 2 ? 'fritia' : 'player', speakerName: index % 2 ? '芙提雅' : '分析员', createdAt: Date.now() - 10000 + index
    }));
    app.activeConversationId = 'private:fritia';
    storage.saveAppStore(app);
  }, endpoint);
  await page.locator('.conversation-item').filter({ hasText: '芙提雅' }).first().click();

  for (const [index, question] of ['看知识库，介绍一下 LDFTEP', '胧嫣的生日是几号'].entries()) {
    await page.fill('#message-input', question);
    await page.click('#send-btn');
    await page.waitForFunction(() => {
      const messages = JSON.parse(localStorage.getItem('fritia_next_chat_store')).messages['private:fritia'];
      return messages.at(-1)?.role === 'assistant' && ['sent', 'error'].includes(messages.at(-1)?.status);
    });
    if (requestFailure) throw requestFailure;
    assert.equal(requests.length, index + 1, 'one UI send must produce one model reply request');
    await page.locator('#message-list').getByText(requests[index].content, { exact: true }).waitFor({ state: 'visible' });
  }
  return [`${viewport.width}×${viewport.height}: real UI creates/uploads/enables LDFTEP.txt alongside builtin corpus, then sends both exact user questions with role-chat history; correct source reaches the model and reply renders`];
}
