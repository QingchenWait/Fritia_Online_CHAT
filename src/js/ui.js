import {
  appendMessage,
  createGroupConversation,
  createId,
  ensurePrivateConversation,
  formatTime,
  getConversationMessages,
  loadAppStore,
  normalizeCharacterRecord,
  readFileAsDataUrl,
  readFileAsText,
  saveAppStore,
  upsertCharacter
} from './storage.js';
import { characterAvatar, getCharacterById } from './characters.js';
import { getSettings, saveSettings, getAdvancedSettings, saveAdvancedSettings } from './settings.js';
import {
  createKnowledgeBase,
  ensurePreloadedKnowledgeBases,
  getActiveKnowledgeBaseIds,
  getKnowledgeBaseChunks,
  getKnowledgeBaseFiles,
  importFilesToKnowledgeBase,
  listKnowledgeBases,
  toggleActiveKnowledgeBaseId
} from './knowledge_base.js';
import {
  buildGraphData,
  deleteLongTermMemoryEdge,
  deleteLongTermMemoryMemory,
  getLongTermMemorySettings,
  getLongTermMemoryStore,
  getOrphanMemories,
  updateLongTermMemorySettings
} from './long_term_memory.js';
import { sendPrivateMessage } from './chat_engine.js';
import { runRoundtableTurn, sendGroupPlayerMessage } from './roundtable.js';

const state = {
  store: loadAppStore(),
  listTab: 'chats',
  selectedKbId: '',
  selectedAttachment: null,
  memoryGraph: {
    nodes: [],
    edges: [],
    selectedNodeId: '',
    animation: 0
  }
};

export function initUi() {
  bindGlobalEvents();
  syncSettingsToForm();
  renderAll();
  ensurePreloadedKnowledgeBases().then(() => {
    refreshKnowledgePanel();
    updateContextStatus();
  });
  refreshKnowledgePanel();
  renderMemoryNodePanel();
  updateContextStatus();
}

function bindGlobalEvents() {
  document.addEventListener('fritia-next-chat-store-updated', event => {
    state.store = event.detail || loadAppStore();
    renderAll();
  });
  document.addEventListener('fritia-knowledge-base-updated', () => {
    refreshKnowledgePanel();
    updateContextStatus();
  });
  document.addEventListener('fritia-long-term-memory-updated', () => {
    renderMemoryNodePanel();
    updateContextStatus();
  });
  document.addEventListener('fritia-settings-updated', () => {
    syncSettingsToForm();
    updateContextStatus();
  });

  document.querySelectorAll('[data-panel-open]').forEach(button => {
    button.addEventListener('click', () => {
      const section = button.dataset.settingsSectionJump;
      openPanel(button.dataset.panelOpen);
      if (section) showSettingsSection(section);
    });
  });
  document.querySelectorAll('[data-panel-close]').forEach(button => {
    button.addEventListener('click', () => closePanel(button.dataset.panelClose));
  });
  document.querySelectorAll('[data-view-btn]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-view-btn]').forEach(item => item.classList.toggle('is-active', item === button));
      if (button.dataset.viewBtn === 'contacts') {
        state.listTab = 'friends';
        setListTab('friends');
      } else {
        state.listTab = 'chats';
        setListTab('chats');
      }
    });
  });
  document.querySelectorAll('[data-list-tab]').forEach(button => {
    button.addEventListener('click', () => setListTab(button.dataset.listTab));
  });
  document.querySelectorAll('[data-settings-section]').forEach(button => {
    button.addEventListener('click', () => showSettingsSection(button.dataset.settingsSection));
  });

  document.getElementById('conversation-search')?.addEventListener('input', renderConversationList);
  document.getElementById('mobile-back-btn')?.addEventListener('click', () => {
    document.getElementById('app')?.classList.remove('is-chat-open');
  });
  document.getElementById('quick-new-group')?.addEventListener('click', () => openPanel('group-editor-panel'));

  bindComposer();
  bindCharacterForm();
  bindGroupEditor();
  bindSettings();
  bindKnowledge();
  bindMemoryPanel();
}

function bindComposer() {
  const input = document.getElementById('message-input');
  const send = document.getElementById('send-btn');
  const imageInput = document.getElementById('image-input');
  const fileInput = document.getElementById('file-input');
  send?.addEventListener('click', handleSend);
  input?.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  });
  input?.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 128)}px`;
  });
  imageInput?.addEventListener('change', async () => {
    const file = imageInput.files?.[0];
    if (!file) return;
    state.selectedAttachment = {
      id: createId('att'),
      type: 'image',
      name: file.name,
      mime: file.type,
      size: file.size,
      dataUrl: await readFileAsDataUrl(file)
    };
    renderAttachmentPreview();
    imageInput.value = '';
  });
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    state.selectedAttachment = {
      id: createId('att'),
      type: file.type.startsWith('audio/') ? 'audio' : 'file',
      name: file.name,
      mime: file.type,
      size: file.size,
      dataUrl: await readFileAsDataUrl(file)
    };
    renderAttachmentPreview();
    fileInput.value = '';
  });
}

async function handleSend() {
  const input = document.getElementById('message-input');
  const text = input?.value.trim() || '';
  const attachments = state.selectedAttachment ? [state.selectedAttachment] : [];
  if (!text && !attachments.length) return;
  const conversation = getActiveConversation();
  if (!conversation) return;
  input.value = '';
  input.style.height = 'auto';
  state.selectedAttachment = null;
  renderAttachmentPreview();
  if (conversation.type === 'group') {
    const sent = await sendGroupPlayerMessage({
      store: state.store,
      conversation,
      text,
      attachments,
      onStore: updateStore
    });
    await runRoundtableTurn({
      store: sent.store,
      conversation,
      characters: state.store.characters,
      triggerText: text,
      onStore: updateStore
    });
    return;
  }
  const character = getCharacterById(state.store.characters, conversation.memberIds[0]);
  await sendPrivateMessage({
    store: state.store,
    conversation,
    character,
    text,
    attachments,
    onStore: updateStore
  });
}

function bindCharacterForm() {
  document.getElementById('char-load-prompt-file')?.addEventListener('click', () => {
    document.getElementById('char-prompt-file')?.click();
  });
  document.getElementById('char-prompt-file')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    document.getElementById('char-prompt').value = await readFileAsText(file);
    event.target.value = '';
  });
  document.getElementById('character-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const avatarFile = document.getElementById('char-avatar-file').files?.[0];
    const voiceFile = document.getElementById('char-voice-file').files?.[0];
    const name = document.getElementById('char-name').value.trim();
    const character = normalizeCharacterRecord({
      id: `char_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now().toString(36)}`,
      name,
      description: document.getElementById('char-description').value.trim(),
      prompt: document.getElementById('char-prompt').value.trim(),
      examples: document.getElementById('char-examples').value.trim(),
      avatar: avatarFile ? await readFileAsDataUrl(avatarFile) : 'src/_logo/emoji/robot_3d.png',
      voiceSample: voiceFile ? await readFileAsDataUrl(voiceFile) : '',
      source: 'custom',
      tags: ['自定义'],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    const next = upsertCharacter(state.store, character);
    const latest = loadAppStore();
    ensurePrivateConversation(latest, character);
    updateStore(loadAppStore());
    event.target.reset();
    closePanel('character-import-panel');
    selectConversation(`private:${character.id}`);
  });
}

function bindGroupEditor() {
  document.getElementById('create-group-btn')?.addEventListener('click', () => {
    const title = document.getElementById('group-name').value.trim() || '圆桌密语';
    const memberIds = [...document.querySelectorAll('#group-member-list .member-item.is-selected')]
      .map(item => item.dataset.characterId);
    if (memberIds.length < 2) return;
    const conversation = createGroupConversation(state.store, title, memberIds, state.store.characters);
    updateStore(loadAppStore());
    closePanel('group-editor-panel');
    selectConversation(conversation.id);
  });
  document.getElementById('roundtable-autoplay-btn')?.addEventListener('click', async () => {
    const conversation = getActiveConversation();
    if (!conversation || conversation.type !== 'group') return;
    await runRoundtableTurn({
      store: state.store,
      conversation,
      characters: state.store.characters,
      triggerText: '',
      onStore: updateStore
    });
  });
}

function bindSettings() {
  document.getElementById('settings-save')?.addEventListener('click', () => {
    saveSettings({
      apiKey: document.getElementById('api-key').value,
      baseUrl: document.getElementById('base-url').value,
      model: document.getElementById('model-name').value
    });
  });
  document.getElementById('advanced-save')?.addEventListener('click', () => {
    saveAdvancedSettings({
      kbChunkSize: Number(document.getElementById('adv-kb-chunk-size').value),
      roundtableMaxParticipants: Number(document.getElementById('adv-roundtable-max').value),
      historyLimit: Number(document.getElementById('adv-history-limit').value)
    });
  });
  document.getElementById('memory-settings-save')?.addEventListener('click', () => {
    updateLongTermMemorySettings({
      enabled: document.getElementById('memory-enabled').checked,
      retentionDays: Number(document.getElementById('memory-retention').value),
      blockedKeywords: document.getElementById('memory-blocked').value.split(/[，,]/).map(item => item.trim()).filter(Boolean)
    });
  });
}

function bindKnowledge() {
  document.getElementById('kb-create-btn')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('kb-name-input');
    const kb = await createKnowledgeBase(nameInput.value.trim() || '新知识库');
    nameInput.value = '';
    state.selectedKbId = kb.id;
    refreshKnowledgePanel();
  });
  document.getElementById('kb-file-input')?.addEventListener('change', async event => {
    const files = [...(event.target.files || [])];
    if (!state.selectedKbId || !files.length) return;
    await importFilesToKnowledgeBase(state.selectedKbId, files);
    event.target.value = '';
    refreshKnowledgePanel();
  });
}

function bindMemoryPanel() {
  document.getElementById('memory-search-btn')?.addEventListener('click', () => renderMemorySearch());
  document.getElementById('memory-search-input')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') renderMemorySearch();
  });
  const canvas = document.getElementById('memory-graph-canvas');
  canvas?.addEventListener('click', event => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const node = state.memoryGraph.nodes.find(item => Math.hypot(item.x - x, item.y - y) < item.r + 4);
    state.memoryGraph.selectedNodeId = node?.id || '';
    renderMemoryNodeDetail();
  });
  window.addEventListener('resize', () => renderMemoryGraph());
}

function setListTab(tab) {
  state.listTab = tab;
  document.querySelectorAll('[data-list-tab]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.listTab === tab);
  });
  renderConversationList();
}

function renderAll() {
  renderConversationList();
  renderMessages();
  renderDetail();
  renderGroupMemberPicker();
  updateContextStatus();
}

function renderConversationList() {
  const container = document.getElementById('conversation-list');
  if (!container) return;
  const query = document.getElementById('conversation-search')?.value.trim().toLowerCase() || '';
  const items = getListItems(query);
  container.innerHTML = '';
  const template = document.getElementById('conversation-item-template');
  for (const item of items) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.classList.toggle('is-active', item.id === state.store.activeConversationId || item.conversationId === state.store.activeConversationId);
    node.querySelector('.conversation-item__avatar').src = item.avatar;
    node.querySelector('.conversation-item__avatar').alt = item.title;
    node.querySelector('.conversation-item__name').textContent = item.title;
    node.querySelector('.conversation-item__preview').textContent = item.preview;
    node.querySelector('.conversation-item__meta').textContent = item.meta || '';
    node.addEventListener('click', () => {
      if (item.kind === 'friend') {
        const character = getCharacterById(state.store.characters, item.id);
        ensurePrivateConversation(state.store, character);
        updateStore(loadAppStore());
        selectConversation(`private:${item.id}`);
      } else {
        selectConversation(item.id);
      }
    });
    container.appendChild(node);
  }
}

function getListItems(query) {
  const conversations = [...state.store.conversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (state.listTab === 'friends') {
    return state.store.characters
      .filter(item => matchQuery([item.name, item.description], query))
      .map(item => ({
        kind: 'friend',
        id: item.id,
        title: item.name,
        avatar: characterAvatar(item),
        preview: item.description || item.prompt.slice(0, 44),
        meta: item.source === 'preset' ? '预置' : '好友'
      }));
  }
  const filtered = conversations.filter(item => state.listTab === 'groups' ? item.type === 'group' : true);
  return filtered
    .filter(item => matchQuery([item.title, latestMessage(item.id)?.text], query))
    .map(item => {
      const last = latestMessage(item.id);
      return {
        kind: item.type,
        id: item.id,
        title: item.title || conversationTitle(item),
        avatar: item.avatar || conversationAvatar(item),
        preview: last ? `${last.speakerName || ''}${last.speakerName ? '：' : ''}${last.text || attachmentSummary(last.attachments)}` : '还没有消息',
        meta: last ? formatTime(last.createdAt) : ''
      };
    });
}

function renderMessages() {
  const container = document.getElementById('message-list');
  if (!container) return;
  const conversation = getActiveConversation();
  if (!conversation) {
    container.innerHTML = `<div class="empty-state"><img src="src/_logo/emoji/sparkles_3d.png" alt=""><h2>NEXT Chat</h2><p>选择好友或群聊开始。</p></div>`;
    return;
  }
  const messages = getConversationMessages(state.store, conversation.id);
  if (!messages.length) {
    container.innerHTML = `<div class="empty-state"><img src="src/_logo/emoji/speech_balloon_3d.png" alt=""><h2>${escapeHtml(conversation.title || conversationTitle(conversation))}</h2><p>发送第一条消息。</p></div>`;
    return;
  }
  container.innerHTML = '';
  for (const message of messages) {
    container.appendChild(createMessageNode(message));
  }
  container.scrollTop = container.scrollHeight;
}

function createMessageNode(message) {
  const row = document.createElement('article');
  row.className = `message-row${message.role === 'user' ? ' is-self' : ''}`;
  const avatar = document.createElement('img');
  avatar.className = 'message-avatar';
  avatar.alt = message.speakerName || '';
  avatar.src = message.role === 'user'
    ? 'src/_char/Profile_Adjutant.png'
    : characterAvatar(getCharacterById(state.store.characters, message.speakerId));
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  const name = document.createElement('div');
  name.className = 'message-name';
  name.textContent = message.speakerName || (message.role === 'user' ? '分析员' : '角色');
  const content = document.createElement('div');
  content.className = 'message-content';
  if (message.status === 'typing') {
    content.innerHTML = '<span class="typing-indicator"><span></span><span></span><span></span></span>';
  } else {
    content.textContent = message.text || '';
    for (const attachment of message.attachments || []) {
      if (attachment.type === 'image' && attachment.dataUrl) {
        const image = document.createElement('img');
        image.className = 'message-image';
        image.src = attachment.dataUrl;
        image.alt = attachment.name || '图片';
        content.appendChild(document.createElement('br'));
        content.appendChild(image);
      } else {
        const line = document.createElement('div');
        line.textContent = `[附件] ${attachment.name || attachment.mime || '未命名'}`;
        content.appendChild(line);
      }
    }
  }
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent = `${formatTime(message.createdAt)}${message.status === 'error' ? ' · 失败' : ''}`;
  bubble.append(name, content, meta);
  if (message.role === 'user') row.append(bubble, avatar);
  else row.append(avatar, bubble);
  return row;
}

function renderDetail() {
  const conversation = getActiveConversation();
  const avatar = document.getElementById('detail-avatar');
  const name = document.getElementById('detail-name');
  const description = document.getElementById('detail-description');
  const tags = document.getElementById('detail-tags');
  const headAvatar = document.getElementById('chat-avatar');
  const headTitle = document.getElementById('chat-title');
  const headSubtitle = document.getElementById('chat-subtitle');
  if (!conversation) return;
  const title = conversation.title || conversationTitle(conversation);
  const icon = conversation.avatar || conversationAvatar(conversation);
  avatar.src = icon;
  headAvatar.src = icon;
  name.textContent = title;
  headTitle.textContent = title;
  if (conversation.type === 'private') {
    const character = getCharacterById(state.store.characters, conversation.memberIds[0]);
    description.textContent = character?.description || '角色私聊';
    headSubtitle.textContent = character?.description || '私聊';
    tags.innerHTML = (character?.tags || []).map(item => `<span class="tag">${escapeHtml(item)}</span>`).join('');
  } else {
    description.textContent = `${conversation.memberIds.length} 位角色 · 圆桌密语群聊`;
    headSubtitle.textContent = conversation.memberIds
      .map(id => getCharacterById(state.store.characters, id)?.name)
      .filter(Boolean)
      .join('、');
    tags.innerHTML = '<span class="tag">群聊</span><span class="tag">圆桌密语</span>';
  }
}

function renderAttachmentPreview() {
  const preview = document.getElementById('attachment-preview');
  if (!preview) return;
  if (!state.selectedAttachment) {
    preview.classList.add('hidden');
    preview.innerHTML = '';
    return;
  }
  preview.classList.remove('hidden');
  const att = state.selectedAttachment;
  preview.innerHTML = '';
  const chip = document.createElement('div');
  chip.className = 'attachment-chip';
  if (att.type === 'image') {
    const image = document.createElement('img');
    image.src = att.dataUrl;
    image.alt = att.name;
    chip.appendChild(image);
  }
  const text = document.createElement('span');
  text.textContent = att.name || att.mime || '附件';
  const close = document.createElement('button');
  close.className = 'icon-btn';
  close.type = 'button';
  close.innerHTML = '<img src="src/_logo/icons/x.svg" alt="">';
  close.addEventListener('click', () => {
    state.selectedAttachment = null;
    renderAttachmentPreview();
  });
  chip.append(text, close);
  preview.appendChild(chip);
}

function renderGroupMemberPicker() {
  const container = document.getElementById('group-member-list');
  if (!container) return;
  const active = getActiveConversation();
  const selected = new Set(active?.type === 'group' ? active.memberIds : state.store.characters.slice(0, 3).map(item => item.id));
  container.innerHTML = '';
  for (const character of state.store.characters) {
    const item = document.createElement('button');
    item.className = `member-item${selected.has(character.id) ? ' is-selected' : ''}`;
    item.type = 'button';
    item.dataset.characterId = character.id;
    item.innerHTML = `
      <img src="${escapeHtml(characterAvatar(character))}" alt="">
      <span><strong>${escapeHtml(character.name)}</strong><small>${escapeHtml(character.description || character.source)}</small></span>
    `;
    item.addEventListener('click', () => item.classList.toggle('is-selected'));
    container.appendChild(item);
  }
}

async function refreshKnowledgePanel() {
  const list = document.getElementById('kb-list');
  if (!list) return;
  const kbs = await listKnowledgeBases().catch(() => []);
  const activeIds = new Set(getActiveKnowledgeBaseIds());
  if (!state.selectedKbId && kbs.length) state.selectedKbId = kbs[0].id;
  list.innerHTML = '';
  for (const kb of kbs) {
    const item = document.createElement('button');
    item.className = `kb-item${state.selectedKbId === kb.id ? ' is-active' : ''}`;
    item.type = 'button';
    item.innerHTML = `
      <strong>${escapeHtml(kb.name)}</strong>
      <small>${kb.fileCount || 0} 文件 · ${kb.chunkCount || 0} 分块 · ${activeIds.has(kb.id) ? '已启用' : '未启用'}</small>
    `;
    item.addEventListener('click', event => {
      state.selectedKbId = kb.id;
      if (event.altKey) toggleActiveKnowledgeBaseId(kb.id);
      refreshKnowledgePanel();
    });
    item.addEventListener('dblclick', () => {
      toggleActiveKnowledgeBaseId(kb.id);
      refreshKnowledgePanel();
    });
    list.appendChild(item);
  }
  await renderKnowledgeDetail();
}

async function renderKnowledgeDetail() {
  const head = document.getElementById('kb-detail-head');
  const fileList = document.getElementById('kb-file-list');
  const chunkPreview = document.getElementById('kb-chunk-preview');
  if (!head || !fileList || !chunkPreview) return;
  if (!state.selectedKbId) {
    head.textContent = '选择一个知识库查看文件与分块。';
    fileList.innerHTML = '';
    chunkPreview.innerHTML = '';
    return;
  }
  const files = await getKnowledgeBaseFiles(state.selectedKbId);
  const chunks = await getKnowledgeBaseChunks(state.selectedKbId);
  head.textContent = `当前知识库：${state.selectedKbId}。双击左侧知识库可切换启用状态。`;
  fileList.innerHTML = files.map(file => `
    <div class="file-row">
      <strong>${escapeHtml(file.name)}</strong>
      <small>${file.charCount || 0} 字 · ${file.chunkCount || 0} 分块</small>
    </div>
  `).join('') || '<div class="file-row"><small>暂无文件。</small></div>';
  chunkPreview.innerHTML = chunks.slice(0, 60).map(chunk => `
    <div class="chunk-row">
      <strong>#${chunk.index + 1} ${escapeHtml(chunk.title || '片段')}</strong>
      <small>${escapeHtml((chunk.text || '').slice(0, 220))}</small>
    </div>
  `).join('') || '<div class="chunk-row"><small>暂无分块。</small></div>';
}

function renderMemoryNodePanel() {
  const store = getLongTermMemoryStore();
  const stats = document.getElementById('memory-node-stats');
  if (stats) stats.textContent = `${store.memories.length} 条记忆 · ${store.edges.length} 条关系`;
  renderMemoryArchive();
  renderMemoryGraph();
}

function renderMemoryArchive() {
  const list = document.getElementById('memory-archive-list');
  if (!list) return;
  const memories = getOrphanMemories(getLongTermMemoryStore()).slice(0, 50);
  list.innerHTML = memories.map(memory => `
    <button class="memory-archive-item" type="button" data-memory-id="${escapeHtml(memory.id)}">
      <strong>${escapeHtml(memory.text)}</strong>
      <small>${escapeHtml(memory.source)} · ${escapeHtml(memory.characterName || memory.characterId || '公共')}</small>
    </button>
  `).join('') || '<div class="memory-archive-item"><small>暂无未入图谱记忆。</small></div>';
  list.querySelectorAll('[data-memory-id]').forEach(button => {
    button.addEventListener('dblclick', () => {
      deleteLongTermMemoryMemory(button.dataset.memoryId);
      renderMemoryNodePanel();
    });
  });
}

function renderMemorySearch() {
  const query = document.getElementById('memory-search-input')?.value.trim() || '';
  const list = document.getElementById('memory-result-list');
  const store = getLongTermMemoryStore();
  if (!list) return;
  const results = store.edges.filter(edge => {
    if (!query) return true;
    return `${edge.head} ${edge.relation} ${edge.tail}`.includes(query);
  }).slice(0, 60);
  list.innerHTML = results.map(edge => `
    <button class="memory-result-item" type="button" data-edge-id="${escapeHtml(edge.id)}">
      <strong>${escapeHtml(edge.head)} ${escapeHtml(edge.relation)} ${escapeHtml(edge.tail)}</strong>
      <small>${edge.scope === 'public:roundtable' ? '公共记忆' : '私有记忆'} · 来源 ${(edge.sourceMemoryIds || []).length} 条 · 双击删除</small>
    </button>
  `).join('') || '<div class="memory-result-item"><small>没有匹配的关系。</small></div>';
  list.querySelectorAll('[data-edge-id]').forEach(button => {
    button.addEventListener('click', () => {
      const graph = state.memoryGraph;
      const edge = graph.edges.find(item => item.id === button.dataset.edgeId);
      graph.selectedNodeId = edge?.from || '';
      renderMemoryNodeDetail();
    });
    button.addEventListener('dblclick', () => {
      deleteLongTermMemoryEdge(button.dataset.edgeId);
      renderMemoryNodePanel();
    });
  });
}

function renderMemoryGraph() {
  const canvas = document.getElementById('memory-graph-canvas');
  if (!canvas) return;
  const graph = buildGraphData();
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = rect.width || 800;
  const height = rect.height || 500;
  const centerX = width / 2;
  const centerY = height / 2;
  const nodes = graph.nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, graph.nodes.length);
    const radius = Math.max(90, Math.min(width, height) * 0.34);
    return {
      ...node,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      r: node.kind === 'player' ? 24 : node.kind === 'public' ? 21 : 18
    };
  });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edges = graph.edges;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#d7e1ea';
  ctx.lineWidth = 1;
  ctx.font = '12px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  for (const edge of edges) {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = edge.scope === 'public:roundtable' ? 'rgba(0,168,132,0.34)' : 'rgba(22,119,255,0.28)';
    ctx.lineWidth = Math.min(3, 0.8 + (edge.weight || 1) * 0.12);
    ctx.stroke();
    ctx.fillStyle = '#6b7280';
    ctx.fillText(edge.relation, (a.x + b.x) / 2, (a.y + b.y) / 2 - 4);
  }
  for (const node of nodes) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
    ctx.fillStyle = node.kind === 'player' ? '#1677ff' : node.kind === 'public' ? '#00a884' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = node.id === state.memoryGraph.selectedNodeId ? '#111827' : '#b8c4d0';
    ctx.lineWidth = node.id === state.memoryGraph.selectedNodeId ? 3 : 1.5;
    ctx.stroke();
    ctx.fillStyle = node.kind === 'character' ? '#111827' : '#ffffff';
    ctx.font = '600 12px "Segoe UI", sans-serif';
    ctx.fillText(compactLabel(node.label), node.x, node.y + 4);
  }
  state.memoryGraph.nodes = nodes;
  state.memoryGraph.edges = edges;
  renderMemoryNodeDetail();
}

function renderMemoryNodeDetail() {
  const detail = document.getElementById('memory-node-detail');
  if (!detail) return;
  const node = state.memoryGraph.nodes.find(item => item.id === state.memoryGraph.selectedNodeId);
  if (!node) {
    detail.textContent = '点击节点查看关系。';
    return;
  }
  const edges = state.memoryGraph.edges.filter(edge => edge.from === node.id || edge.to === node.id);
  detail.innerHTML = `<strong>${escapeHtml(node.label)}</strong>` + edges.slice(0, 18).map(edge => `
    <div class="memory-edge-row">
      <span>${escapeHtml(edge.head)} ${escapeHtml(edge.relation)} ${escapeHtml(edge.tail)}</span>
      <button class="btn btn-danger" type="button" data-delete-detail-edge="${escapeHtml(edge.id)}">删除</button>
    </div>
  `).join('');
  detail.querySelectorAll('[data-delete-detail-edge]').forEach(button => {
    button.addEventListener('click', () => {
      deleteLongTermMemoryEdge(button.dataset.deleteDetailEdge);
      renderMemoryNodePanel();
    });
  });
}

function syncSettingsToForm() {
  const settings = getSettings();
  const advanced = getAdvancedSettings();
  const memory = getLongTermMemorySettings();
  setValue('api-key', settings.apiKey);
  setValue('base-url', settings.baseUrl);
  setValue('model-name', settings.model);
  setValue('adv-kb-chunk-size', advanced.kbChunkSize);
  setValue('adv-roundtable-max', advanced.roundtableMaxParticipants);
  setValue('adv-history-limit', advanced.historyLimit);
  const enabled = document.getElementById('memory-enabled');
  if (enabled) enabled.checked = memory.enabled;
  setValue('memory-retention', memory.retentionDays);
  setValue('memory-blocked', memory.blockedKeywords.join(', '));
}

function updateContextStatus() {
  const activeKb = getActiveKnowledgeBaseIds();
  const memory = getLongTermMemorySettings();
  const settings = getSettings();
  setText('rag-status', activeKb.length ? `${activeKb.length} 个已启用` : '未启用');
  setText('ltm-status', memory.enabled ? '启用' : '关闭');
  setText('model-status', settings.apiKey ? settings.model : '未配置');
}

function openPanel(id) {
  document.getElementById(id)?.classList.remove('hidden');
  if (id === 'group-editor-panel') renderGroupMemberPicker();
  if (id === 'memory-node-panel') renderMemoryNodePanel();
}

function closePanel(id) {
  document.getElementById(id)?.classList.add('hidden');
}

function showSettingsSection(section) {
  document.querySelectorAll('[data-settings-section]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.settingsSection === section);
  });
  document.querySelectorAll('[data-settings-view]').forEach(view => {
    view.classList.toggle('is-active', view.dataset.settingsView === section);
  });
}

function selectConversation(id) {
  const next = saveAppStore({ ...state.store, activeConversationId: id });
  updateStore(next);
  document.getElementById('app')?.classList.add('is-chat-open');
}

function updateStore(store) {
  state.store = store || loadAppStore();
  renderAll();
}

function getActiveConversation() {
  return state.store.conversations.find(item => item.id === state.store.activeConversationId) || state.store.conversations[0] || null;
}

function latestMessage(conversationId) {
  const list = getConversationMessages(state.store, conversationId);
  return list[list.length - 1] || null;
}

function conversationTitle(conversation) {
  if (!conversation) return 'NEXT Chat';
  if (conversation.type === 'private') {
    return getCharacterById(state.store.characters, conversation.memberIds[0])?.name || conversation.title || '私聊';
  }
  return conversation.title || '圆桌密语';
}

function conversationAvatar(conversation) {
  if (!conversation) return 'src/_logo/emoji/robot_3d.png';
  if (conversation.type === 'private') {
    return characterAvatar(getCharacterById(state.store.characters, conversation.memberIds[0]));
  }
  return conversation.avatar || 'src/_logo/emoji/speech_balloon_3d.png';
}

function attachmentSummary(attachments = []) {
  if (!attachments.length) return '';
  return attachments.map(item => item.type === 'image' ? '[图片]' : `[附件]${item.name || ''}`).join(' ');
}

function matchQuery(values, query) {
  if (!query) return true;
  return values.some(value => String(value || '').toLowerCase().includes(query));
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value ?? '';
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value ?? '';
}

function compactLabel(label, max = 7) {
  const chars = [...String(label || '')];
  return chars.length > max ? `${chars.slice(0, max).join('')}...` : label;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
