import {
  appendMessage,
  createGroupConversation,
  createId,
  ensurePrivateConversation,
  formatTime,
  getConversationMessages,
  loadAppStore,
  normalizeGroupSettings,
  normalizeCharacterRecord,
  readFileAsDataUrl,
  readFileAsText,
  saveAppStore,
  upsertCharacter,
  updateGroupConversation
} from './storage.js';
import { characterAvatar, getCharacterById } from './characters.js';
import { getSettings, saveSettings, getAdvancedSettings, saveAdvancedSettings, isDeepSeekIntimateModeAvailable } from './settings.js';
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  deleteKnowledgeBaseFile,
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
  initLongTermMemoryPanel,
  openMemoryNodePanel,
  closeMemoryNodePanel,
  updateLongTermMemorySettings
} from './long_term_memory.js';
import { addStickerFiles, deleteSticker, isWideSticker, listStickers, stickerToAttachment } from './stickers.js';
import { sendPrivateMessage } from './chat_engine.js';
import { getRoundtableError, runRoundtableTurn, sendGroupPlayerMessage } from './roundtable.js';

const MAX_KB_PREVIEW_CHUNKS = 80;
const MAX_KB_PREVIEW_CHARS = 360;
const ROUNDTABLE_IDLE_DELAY_MS = 45000;

let roundtableIdleTimer = 0;

const state = {
  store: loadAppStore(),
  listTab: 'chats',
  selectedKbId: '',
  selectedKbFileId: '',
  selectedAttachment: null,
  groupMemberSelection: new Set(),
  groupMemberSearch: '',
  groupEditorMode: 'create',
  groupInfoEditing: false,
  groupInfoMemberSearch: '',
  roundtableErrorPopoverOpen: false,
  stickerPopoverOpen: false,
  mention: {
    active: false,
    start: -1,
    query: '',
    selectedIndex: 0,
    candidates: []
  },
  memoryGraph: {
    nodes: [],
    edges: [],
    selectedNodeId: '',
    archiveFilter: 'orphan',
    transform: { x: 0, y: 0, scale: 1 },
    positions: {},
    drag: null,
    suppressClick: false,
    animation: 0
  }
};

export function initUi() {
  state.store = loadAppStore();
  bindGlobalEvents();
  syncSettingsToForm();
  renderAll();
  ensurePreloadedKnowledgeBases().then(() => {
    refreshKnowledgePanel();
    updateContextStatus();
  });
  refreshKnowledgePanel();
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
    updateContextStatus();
  });
  document.addEventListener('fritia-settings-updated', () => {
    syncSettingsToForm();
    updateContextStatus();
  });
  document.addEventListener('fritia-advanced-settings-updated', () => {
    syncSettingsToForm();
  });
  document.addEventListener('fritia-roundtable-error-updated', () => {
    renderRoundtableErrorIndicator();
  });
  document.addEventListener('fritia-stickers-updated', () => {
    renderStickerPopover();
    renderStickerManager();
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
  document.querySelectorAll('[data-sticker-section]').forEach(button => {
    button.addEventListener('click', () => showStickerManagerSection(button.dataset.stickerSection));
  });

  document.getElementById('conversation-search')?.addEventListener('input', renderConversationList);
  document.querySelector('[data-chat-info-toggle]')?.addEventListener('click', handleChatInfoToggle);
  document.getElementById('roundtable-error-btn')?.addEventListener('click', event => {
    event.stopPropagation();
    state.roundtableErrorPopoverOpen = !state.roundtableErrorPopoverOpen;
    renderRoundtableErrorIndicator();
  });
  document.getElementById('roundtable-error-close')?.addEventListener('click', event => {
    event.stopPropagation();
    state.roundtableErrorPopoverOpen = false;
    renderRoundtableErrorIndicator();
  });
  document.getElementById('detail-close-btn')?.addEventListener('click', () => {
    document.getElementById('app')?.classList.remove('is-detail-open');
  });
  document.getElementById('mobile-back-btn')?.addEventListener('click', () => {
    document.getElementById('app')?.classList.remove('is-chat-open');
  });
  document.getElementById('quick-new-group')?.addEventListener('click', () => openPanel('group-editor-panel', { fresh: true }));
  document.addEventListener('click', event => {
    if (!state.roundtableErrorPopoverOpen) return;
    const popover = document.getElementById('roundtable-error-popover');
    const button = document.getElementById('roundtable-error-btn');
    if (popover?.contains(event.target) || button?.contains(event.target)) return;
    state.roundtableErrorPopoverOpen = false;
    renderRoundtableErrorIndicator();
  });
  document.addEventListener('click', event => {
    if (!state.stickerPopoverOpen) return;
    const popover = document.getElementById('sticker-popover');
    const button = document.getElementById('sticker-toggle-btn');
    if (popover?.contains(event.target) || button?.contains(event.target)) return;
    closeStickerPopover();
  });

  bindComposer();
  bindStickers();
  bindCharacterForm();
  bindGroupEditor();
  bindGroupInfoPanel();
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
    if (handleMentionKeydown(event)) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  });
  input?.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 128)}px`;
    updateMentionPicker();
  });
  input?.addEventListener('click', updateMentionPicker);
  input?.addEventListener('keyup', event => {
    if (!['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key)) updateMentionPicker();
  });
  document.addEventListener('click', event => {
    const picker = document.getElementById('mention-popover');
    if (!picker || picker.classList.contains('hidden')) return;
    if (picker.contains(event.target) || input?.contains(event.target)) return;
    closeMentionPicker();
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
  const sent = await sendMessageToActiveConversation(text, attachments);
  if (!sent) return;
  input.value = '';
  input.style.height = 'auto';
  state.selectedAttachment = null;
  renderAttachmentPreview();
  closeMentionPicker();
}

async function sendMessageToActiveConversation(text, attachments = []) {
  const conversation = getActiveConversation();
  if (!conversation) return null;
  if (conversation.type === 'group') {
    const sent = await sendGroupPlayerMessage({
      store: state.store,
      conversation,
      text,
      attachments,
      onStore: updateStore
    });
    const latestConversation = sent.store.conversations.find(item => item.id === conversation.id) || conversation;
    await runRoundtableTurn({
      store: sent.store,
      conversation: latestConversation,
      characters: sent.store.characters,
      triggerText: text,
      onStore: updateStore
    });
    return sent;
  }
  const character = getCharacterById(state.store.characters, conversation.memberIds[0]);
  if (!character) return null;
  return sendPrivateMessage({
    store: state.store,
    conversation,
    character,
    text,
    attachments,
    onStore: updateStore
  });
}

function bindStickers() {
  document.getElementById('sticker-toggle-btn')?.addEventListener('click', event => {
    event.stopPropagation();
    state.stickerPopoverOpen = !state.stickerPopoverOpen;
    renderStickerPopover();
  });
  document.getElementById('sticker-upload-input')?.addEventListener('change', async event => {
    const files = [...(event.target.files || [])];
    if (files.length) await addStickerFiles(files);
    event.target.value = '';
  });
  document.getElementById('sticker-manager-add')?.addEventListener('click', () => {
    document.getElementById('sticker-upload-input')?.click();
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
    ensurePrivateConversation(next, character);
    updateStore(loadAppStore());
    event.target.reset();
    closePanel('character-import-panel');
    selectConversation(`private:${character.id}`);
  });
}

function bindGroupEditor() {
  document.getElementById('group-member-search')?.addEventListener('input', event => {
    state.groupMemberSearch = event.target.value.trim().toLowerCase();
    renderGroupMemberPicker();
  });
  document.getElementById('create-group-btn')?.addEventListener('click', () => {
    const memberIds = [...state.groupMemberSelection];
    if (memberIds.length < 2) return;
    const active = getActiveConversation();
    const title = state.groupEditorMode === 'edit' && active?.type === 'group'
      ? active.title || buildGroupTitle(memberIds)
      : buildGroupTitle(memberIds);
    let conversation;
    if (state.groupEditorMode === 'edit' && active?.type === 'group') {
      const next = updateGroupConversation(state.store, active.id, { memberIds, title });
      updateStore(next);
      conversation = next.conversations.find(item => item.id === active.id);
    } else {
      conversation = createGroupConversation(state.store, title, memberIds, state.store.characters);
      updateStore(loadAppStore());
    }
    closePanel('group-editor-panel');
    selectConversation(conversation.id);
  });
}

function bindGroupInfoPanel() {
  document.getElementById('group-info-close')?.addEventListener('click', closeGroupInfoPanel);
  document.getElementById('group-info-backdrop')?.addEventListener('click', closeGroupInfoPanel);
  document.querySelectorAll('[data-group-info-open]').forEach(button => {
    button.addEventListener('click', openGroupInfoPanel);
  });
  document.getElementById('group-info-invite-btn')?.addEventListener('click', () => openGroupInfoEditor());
  document.getElementById('group-info-remove-btn')?.addEventListener('click', () => openGroupInfoEditor());
  document.getElementById('group-info-cancel-members')?.addEventListener('click', () => {
    state.groupInfoEditing = false;
    renderGroupInfoPanel();
  });
  document.getElementById('group-info-save-members')?.addEventListener('click', () => {
    const conversation = getActiveConversation();
    if (!conversation || conversation.type !== 'group') return;
    const memberIds = [...state.groupMemberSelection];
    if (memberIds.length < 2) return;
    const settings = normalizeGroupSettings(conversation.groupSettings);
    const next = updateGroupConversation(state.store, conversation.id, {
      memberIds,
      groupSettings: { maxParticipants: Math.max(settings.maxParticipants, memberIds.length) }
    });
    state.groupInfoEditing = false;
    updateStore(next);
  });
  document.getElementById('group-info-member-search')?.addEventListener('input', event => {
    state.groupInfoMemberSearch = event.target.value.trim().toLowerCase();
    renderGroupInfoMemberEditor();
  });
  bindGroupSettingToggle('group-setting-auto-talk', 'autoBotChat');
  bindGroupSettingToggle('group-setting-idle-talk', 'idleTalk');
  bindGroupSettingToggle('group-setting-bot-at', 'botAtMentionTriggersReply');
  document.getElementById('group-setting-chain-limit')?.addEventListener('input', event => {
    const conversation = getActiveConversation();
    if (!conversation || conversation.type !== 'group') return;
    const botChainLimit = Math.max(1, Math.min(6, Math.round(Number(event.target.value) || 3)));
    setText('group-info-chain-label', `${botChainLimit} 次`);
    updateStore(updateGroupConversation(state.store, conversation.id, {
      groupSettings: { botChainLimit }
    }));
  });
  document.getElementById('group-setting-max-members')?.addEventListener('change', event => {
    const conversation = getActiveConversation();
    if (!conversation || conversation.type !== 'group') return;
    const currentCount = Math.max(2, conversation.memberIds.length);
    const maxParticipants = Math.max(currentCount, Math.min(20, Math.round(Number(event.target.value) || currentCount)));
    event.target.value = String(maxParticipants);
    updateStore(updateGroupConversation(state.store, conversation.id, {
      groupSettings: { maxParticipants }
    }));
  });
  document.getElementById('group-info-more-settings')?.addEventListener('click', () => {
    closeGroupInfoPanel();
    openPanel('settings-panel');
    showSettingsSection('advanced');
  });
  document.getElementById('group-info-leave')?.addEventListener('click', closeGroupInfoPanel);
}

function bindGroupSettingToggle(id, key) {
  document.getElementById(id)?.addEventListener('change', event => {
    const conversation = getActiveConversation();
    if (!conversation || conversation.type !== 'group') return;
    updateStore(updateGroupConversation(state.store, conversation.id, {
      groupSettings: { [key]: event.target.checked }
    }));
  });
}

function bindSettings() {
  document.getElementById('settings-save')?.addEventListener('click', () => {
    saveSettings({
      apiKey: document.getElementById('api-key').value,
      baseUrl: document.getElementById('base-url').value,
      model: document.getElementById('model-name').value
    });
    updateDeepSeekIntimateVisibility();
    closePanel('settings-panel');
  });
  document.getElementById('advanced-save')?.addEventListener('click', () => {
    const localizationSensitivity = Number(document.getElementById('localization-sensitivity').value);
    const deepseekIntimateMode = Boolean(document.getElementById('deepseek-intimate-mode')?.checked);
    saveAdvancedSettings({
      kbChunkSize: Number(document.getElementById('adv-kb-chunk-size').value),
      kbChunkOverlap: Number(document.getElementById('adv-kb-overlap').value),
      kbCandidateLimit: Number(document.getElementById('adv-kb-candidate-limit').value),
      kbInjectLimit: Number(document.getElementById('adv-kb-inject-limit').value),
      roundtableMaxParticipants: Number(document.getElementById('adv-roundtable-max').value),
      roundtableTokenHardLimit: Number(document.getElementById('adv-roundtable-token-limit').value),
      roundtableCallLimit: Number(document.getElementById('adv-roundtable-call-limit').value),
      roundtableFollowUpRate: Number(document.getElementById('adv-roundtable-follow-up-rate').value),
      historyLimit: Number(document.getElementById('adv-history-limit').value),
      memoryLimit: Number(document.getElementById('adv-memory-limit').value),
      edgeLimit: Number(document.getElementById('adv-edge-limit').value)
    });
    saveSettings({
      localizationSensitivity,
      deepseekIntimateMode
    });
    closePanel('settings-panel');
  });
  [
    'adv-kb-chunk-size',
    'adv-kb-overlap',
    'adv-kb-candidate-limit',
    'adv-kb-inject-limit',
    'adv-history-limit',
    'adv-memory-limit',
    'adv-edge-limit',
    'adv-roundtable-max',
    'adv-roundtable-token-limit',
    'adv-roundtable-call-limit',
    'adv-roundtable-follow-up-rate',
    'localization-sensitivity'
  ].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      refreshAdvancedValueLabels();
      if (id === 'localization-sensitivity') updateDeepSeekIntimateVisibility();
    });
  });
  document.getElementById('model-name')?.addEventListener('input', updateDeepSeekIntimateVisibility);
  document.getElementById('deepseek-intimate-mode')?.addEventListener('change', refreshAdvancedValueLabels);
  document.getElementById('memory-settings-save')?.addEventListener('click', () => {
    updateLongTermMemorySettings({
      enabled: document.getElementById('memory-enabled').checked,
      retentionDays: Number(document.getElementById('memory-retention').value),
      blockedKeywords: document.getElementById('memory-blocked').value.split(/[，,]/).map(item => item.trim()).filter(Boolean)
    });
    closePanel('settings-panel');
  });
}

function bindKnowledge() {
  const create = async () => {
    const nameInput = document.getElementById('kb-name-input');
    const kb = await createKnowledgeBase(nameInput.value.trim() || '新知识库');
    nameInput.value = '';
    state.selectedKbId = kb.id;
    state.selectedKbFileId = '';
    refreshKnowledgePanel();
  };
  document.getElementById('kb-create-btn')?.addEventListener('click', () => {
    create().catch(err => setKbStatus(err?.message || '创建知识库失败。', 'warn'));
  });
  document.getElementById('kb-name-input')?.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    create().catch(err => setKbStatus(err?.message || '创建知识库失败。', 'warn'));
  });
  document.getElementById('kb-upload-btn')?.addEventListener('click', () => {
    document.getElementById('kb-file-input')?.click();
  });
  document.getElementById('kb-file-input')?.addEventListener('change', async event => {
    const files = [...(event.target.files || [])];
    if (!state.selectedKbId || !files.length) return;
    try {
      setKbStatus(`正在导入 ${files.length} 个文件...`, 'info');
      await importFilesToKnowledgeBase(state.selectedKbId, files);
      event.target.value = '';
      state.selectedKbFileId = '';
      setKbStatus('文档已导入，索引已重建。', 'ok');
      refreshKnowledgePanel();
    } catch (err) {
      setKbStatus(err?.message || '上传失败。', 'warn');
    }
  });
  document.getElementById('kb-enable-toggle')?.addEventListener('click', () => {
    if (!state.selectedKbId) return;
    toggleActiveKnowledgeBaseId(state.selectedKbId);
    refreshKnowledgePanel();
  });
  document.getElementById('kb-delete-btn')?.addEventListener('click', async () => {
    if (!state.selectedKbId) return;
    const title = document.getElementById('kb-current-title')?.textContent || '当前知识库';
    if (!confirm(`确认删除「${title}」及其全部文件与索引？此操作不可撤销。`)) return;
    try {
      await deleteKnowledgeBase(state.selectedKbId);
      state.selectedKbId = '';
      state.selectedKbFileId = '';
      setKbStatus('知识库已删除。', 'ok');
      refreshKnowledgePanel();
    } catch (err) {
      setKbStatus(err?.message || '删除失败。', 'warn');
    }
  });
}

function bindMemoryPanel() {
  initLongTermMemoryPanel();
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
  renderGroupInfoPanel();
  renderMentionPicker();
  renderStickerPopover();
  renderStickerManager();
  updateContextStatus();
  renderRoundtableErrorIndicator();
  scheduleRoundtableIdle();
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
        avatar: conversationAvatar(item),
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
  if (message.role !== 'user' && message.speakerName) {
    avatar.classList.add('message-avatar--mentionable');
    avatar.title = `@${message.speakerName}`;
    avatar.addEventListener('click', () => insertMentionText(message.speakerName));
  }
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
    const text = message.text || '';
    const attachments = message.attachments || [];
    const stickerOnly = isStickerOnlyMessage(text, attachments);
    if (stickerOnly) content.classList.add('message-content--sticker-only');
    if (text.trim()) renderMessageText(content, text);
    for (const attachment of attachments) {
      if (attachment.type === 'image' && attachment.dataUrl) {
        const image = document.createElement('img');
        const stickerMeta = resolveStickerAttachmentMeta(attachment);
        image.className = `message-image${stickerMeta ? ` message-image-sticker ${getStickerAttachmentOrientation(stickerMeta)}` : ''}`;
        image.src = attachment.dataUrl;
        image.alt = attachment.name || '图片';
        if (content.childNodes.length) content.appendChild(document.createElement('br'));
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
  updateConversationChrome(conversation);
  const avatar = document.getElementById('detail-avatar');
  const name = document.getElementById('detail-name');
  const description = document.getElementById('detail-description');
  const tags = document.getElementById('detail-tags');
  const headAvatar = document.getElementById('chat-avatar');
  const headTitle = document.getElementById('chat-title');
  const headSubtitle = document.getElementById('chat-subtitle');
  if (!conversation) return;
  const title = conversation.title || conversationTitle(conversation);
  const icon = conversationAvatar(conversation);
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

function renderRoundtableErrorIndicator() {
  const button = document.getElementById('roundtable-error-btn');
  const popover = document.getElementById('roundtable-error-popover');
  const title = document.getElementById('roundtable-error-title');
  const detail = document.getElementById('roundtable-error-detail');
  if (!button || !popover) return;
  const conversation = getActiveConversation();
  const error = getRoundtableError();
  const visible = Boolean(
    conversation?.type === 'group'
    && error
    && (!error.conversationId || error.conversationId === conversation.id)
  );
  if (!visible) state.roundtableErrorPopoverOpen = false;
  button.classList.toggle('hidden', !visible);
  popover.classList.toggle('hidden', !visible || !state.roundtableErrorPopoverOpen);
  if (title) title.textContent = error?.title || '圆桌密语异常';
  if (detail) {
    const time = error?.createdAt ? `发生时间：${formatTime(error.createdAt)}` : '';
    detail.textContent = [time, error?.detail || ''].filter(Boolean).join('\n\n');
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

function renderStickerPopover() {
  const popover = document.getElementById('sticker-popover');
  const grid = document.getElementById('sticker-popover-grid');
  if (!popover || !grid) return;
  popover.classList.toggle('hidden', !state.stickerPopoverOpen);
  grid.innerHTML = '';
  grid.appendChild(createStickerActionTile('plus', '添加表情包', () => {
    document.getElementById('sticker-upload-input')?.click();
  }));
  grid.appendChild(createStickerActionTile('smile', '表情包管理', () => {
    closeStickerPopover();
    openPanel('sticker-manager-panel');
    showStickerManagerSection('manage');
    renderStickerManager();
  }));
  const stickers = listStickers();
  if (!stickers.length) {
    const empty = document.createElement('div');
    empty.className = 'sticker-popover-empty';
    empty.textContent = '添加图片后即可作为表情发送。';
    grid.appendChild(empty);
    return;
  }
  for (const sticker of stickers) {
    grid.appendChild(createStickerTile(sticker, {
      className: 'sticker-tile',
      onClick: () => sendSticker(sticker)
    }));
  }
}

function renderStickerManager() {
  const grid = document.getElementById('sticker-manager-grid');
  const count = document.getElementById('sticker-manager-count');
  if (!grid) return;
  const stickers = listStickers();
  setText('sticker-manager-count', `${stickers.length} 个表情`);
  if (count) count.textContent = `${stickers.length} 个表情`;
  grid.innerHTML = '';
  const addTile = createStickerActionTile('plus', '添加表情包', () => {
    document.getElementById('sticker-upload-input')?.click();
  });
  addTile.classList.add('sticker-manager-add-tile');
  grid.appendChild(addTile);
  if (!stickers.length) {
    const empty = document.createElement('div');
    empty.className = 'sticker-empty-panel';
    empty.textContent = '还没有表情包。点击左侧按钮上传图片。';
    grid.appendChild(empty);
    return;
  }
  for (const sticker of stickers) {
    const item = document.createElement('article');
    item.className = 'sticker-manager-item';
    const preview = createStickerTile(sticker, { className: 'sticker-preview-tile' });
    const name = document.createElement('strong');
    name.textContent = sticker.name || '表情包';
    const meta = document.createElement('small');
    meta.textContent = `${sticker.width || 0} x ${sticker.height || 0} · ${formatBytes(sticker.size)}`;
    const deleteButton = document.createElement('button');
    deleteButton.className = 'icon-btn memory-danger-icon';
    deleteButton.type = 'button';
    deleteButton.title = '删除表情包';
    deleteButton.setAttribute('aria-label', '删除表情包');
    deleteButton.innerHTML = '<img src="src/_logo/icons/trash-2.svg" alt="">';
    deleteButton.addEventListener('click', () => {
      if (!confirm(`确认删除「${sticker.name || '表情包'}」？`)) return;
      deleteSticker(sticker.id);
    });
    item.append(preview, name, meta, deleteButton);
    grid.appendChild(item);
  }
}

function resolveStickerAttachmentMeta(attachment) {
  if (!attachment || attachment.type !== 'image') return null;
  if (attachment.source === 'sticker') return attachment;
  return listStickers().find(item => item.dataUrl === attachment.dataUrl) || null;
}

function isStickerOnlyMessage(text, attachments = []) {
  if (String(text || '').trim()) return false;
  if (attachments.length !== 1) return false;
  return Boolean(resolveStickerAttachmentMeta(attachments[0]));
}

function getStickerAttachmentOrientation(sticker) {
  const width = Number(sticker?.width) || 0;
  const height = Number(sticker?.height) || 0;
  if (!width || !height) return 'is-sticker-square';
  const ratio = Math.max(width, height) / Math.min(width, height);
  if (ratio <= 1.2) return 'is-sticker-square';
  return width > height ? 'is-sticker-landscape' : 'is-sticker-portrait';
}

function createStickerActionTile(icon, label, onClick) {
  const button = document.createElement('button');
  button.className = 'sticker-action-tile';
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = `<img src="src/_logo/icons/${icon}.svg" alt="">`;
  button.addEventListener('click', event => {
    event.stopPropagation();
    onClick?.();
  });
  return button;
}

function createStickerTile(sticker, options = {}) {
  const button = document.createElement('button');
  button.className = options.className || 'sticker-tile';
  button.type = 'button';
  button.title = sticker.name || '表情包';
  const image = document.createElement('img');
  image.src = sticker.dataUrl;
  image.alt = sticker.name || '表情包';
  image.className = isWideSticker(sticker) ? 'is-crop' : 'is-contain';
  button.appendChild(image);
  if (options.onClick) {
    button.addEventListener('click', event => {
      event.stopPropagation();
      options.onClick(sticker);
    });
  }
  return button;
}

async function sendSticker(sticker) {
  const attachment = stickerToAttachment(sticker);
  if (!attachment) return;
  const sent = await sendMessageToActiveConversation('', [attachment]);
  if (!sent) return;
  closeStickerPopover();
}

function closeStickerPopover() {
  state.stickerPopoverOpen = false;
  renderStickerPopover();
}

function renderGroupMemberPicker() {
  const container = document.getElementById('group-member-list');
  if (!container) return;
  const selected = state.groupMemberSelection;
  const query = state.groupMemberSearch;
  const characters = state.store.characters.filter(character => {
    if (!query) return true;
    return matchQuery([character.name, character.description, character.source], query);
  });
  container.innerHTML = '';
  for (const character of characters) {
    const item = document.createElement('button');
    item.className = `member-item${selected.has(character.id) ? ' is-selected' : ''}`;
    item.type = 'button';
    item.dataset.characterId = character.id;
    item.innerHTML = `
      <span class="member-check" aria-hidden="true"></span>
      <img src="${escapeHtml(characterAvatar(character))}" alt="">
      <span class="member-text"><strong>${escapeHtml(character.name)}</strong><small>${escapeHtml(character.description || character.source)}</small></span>
    `;
    item.addEventListener('click', () => {
      if (selected.has(character.id)) selected.delete(character.id);
    else selected.add(character.id);
      renderGroupMemberPicker();
    });
    container.appendChild(item);
  }
  if (!characters.length) {
    container.innerHTML = '<div class="member-empty">没有匹配的好友。</div>';
  }
  renderGroupSelectionSummary();
}

function openGroupInfoPanel() {
  const conversation = getActiveConversation();
  if (!conversation || conversation.type !== 'group') return;
  state.groupInfoEditing = false;
  state.groupInfoMemberSearch = '';
  state.groupMemberSelection = new Set(conversation.memberIds);
  document.getElementById('group-info-panel')?.classList.remove('hidden');
  document.getElementById('group-info-backdrop')?.classList.remove('hidden');
  renderGroupInfoPanel();
}

function closeGroupInfoPanel() {
  document.getElementById('group-info-panel')?.classList.add('hidden');
  document.getElementById('group-info-backdrop')?.classList.add('hidden');
  state.groupInfoEditing = false;
}

function openGroupInfoEditor() {
  const conversation = getActiveConversation();
  if (!conversation || conversation.type !== 'group') return;
  state.groupInfoEditing = true;
  state.groupInfoMemberSearch = '';
  state.groupMemberSelection = new Set(conversation.memberIds);
  const search = document.getElementById('group-info-member-search');
  if (search) search.value = '';
  renderGroupInfoPanel();
}

function renderGroupInfoPanel() {
  const panel = document.getElementById('group-info-panel');
  if (!panel || panel.classList.contains('hidden')) return;
  const conversation = getActiveConversation();
  if (!conversation || conversation.type !== 'group') {
    closeGroupInfoPanel();
    return;
  }
  const settings = normalizeGroupSettings(conversation.groupSettings);
  const members = getGroupMembers(conversation);
  setText('group-info-count', `查看${members.length}名群成员`);
  setText('group-info-max-label', `${settings.maxParticipants} 人`);
  const maxInput = document.getElementById('group-setting-max-members');
  if (maxInput) {
    maxInput.min = String(Math.max(2, members.length));
    maxInput.value = String(settings.maxParticipants);
  }
  const chainInput = document.getElementById('group-setting-chain-limit');
  if (chainInput) chainInput.value = String(settings.botChainLimit);
  setChecked('group-setting-auto-talk', settings.autoBotChat);
  setChecked('group-setting-idle-talk', settings.idleTalk);
  setChecked('group-setting-bot-at', settings.botAtMentionTriggersReply);
  setText('group-info-chain-label', `${settings.botChainLimit} 次`);
  renderGroupInfoMemberGrid(members);
  renderGroupInfoMemberEditor();
}

function renderGroupInfoMemberGrid(members) {
  const grid = document.getElementById('group-info-member-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const character of members.slice(0, 13)) {
    const item = document.createElement('button');
    item.className = 'group-info-member';
    item.type = 'button';
    item.title = character.name;
    item.innerHTML = `
      <img src="${escapeHtml(characterAvatar(character))}" alt="">
      <span>${escapeHtml(compactLabel(character.name, 4))}</span>
    `;
    item.addEventListener('click', () => insertMentionText(character.name));
    grid.appendChild(item);
  }
  grid.appendChild(createGroupInfoAction('group-info-invite-btn', '+', '邀请'));
  grid.appendChild(createGroupInfoAction('group-info-remove-btn', '-', '移出'));
}

function createGroupInfoAction(id, symbol, label) {
  const button = document.createElement('button');
  button.className = 'group-info-member group-info-member--action';
  button.id = id;
  button.type = 'button';
  button.innerHTML = `<span class="group-info-symbol">${symbol}</span><span>${label}</span>`;
  button.addEventListener('click', openGroupInfoEditor);
  return button;
}

function renderGroupInfoMemberEditor() {
  const editor = document.getElementById('group-info-member-editor');
  const list = document.getElementById('group-info-member-list');
  const save = document.getElementById('group-info-save-members');
  if (!editor || !list) return;
  editor.classList.toggle('hidden', !state.groupInfoEditing);
  if (!state.groupInfoEditing) return;
  const query = state.groupInfoMemberSearch;
  const selected = state.groupMemberSelection;
  const characters = state.store.characters.filter(character => {
    if (!query) return true;
    return matchQuery([character.name, character.description, character.source], query);
  });
  list.innerHTML = '';
  for (const character of characters) {
    const item = document.createElement('button');
    item.className = `group-info-member-row${selected.has(character.id) ? ' is-selected' : ''}`;
    item.type = 'button';
    item.innerHTML = `
      <span class="member-check" aria-hidden="true"></span>
      <img src="${escapeHtml(characterAvatar(character))}" alt="">
      <span><strong>${escapeHtml(character.name)}</strong><small>${escapeHtml(character.description || character.source)}</small></span>
    `;
    item.addEventListener('click', () => {
      if (selected.has(character.id)) selected.delete(character.id);
      else selected.add(character.id);
      renderGroupInfoMemberEditor();
    });
    list.appendChild(item);
  }
  if (!characters.length) {
    list.innerHTML = '<div class="member-empty">没有匹配的好友。</div>';
  }
  if (save) {
    const count = selected.size;
    save.disabled = count < 2;
    save.textContent = `保存成员(${count})`;
  }
}

function getGroupMembers(conversation) {
  return conversation.memberIds
    .map(id => getCharacterById(state.store.characters, id))
    .filter(Boolean);
}

function updateMentionPicker() {
  const input = document.getElementById('message-input');
  const conversation = getActiveConversation();
  if (!input || conversation?.type !== 'group') {
    closeMentionPicker();
    return;
  }
  const token = findMentionToken(input.value, input.selectionStart || 0);
  if (!token) {
    closeMentionPicker();
    return;
  }
  const candidates = getMentionCandidates(conversation, token.query);
  state.mention = {
    active: candidates.length > 0,
    start: token.start,
    query: token.query,
    selectedIndex: 0,
    candidates
  };
  renderMentionPicker();
}

function handleMentionKeydown(event) {
  if (!state.mention.active) return false;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeMentionPicker();
    return true;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const length = state.mention.candidates.length || 1;
    state.mention.selectedIndex = (state.mention.selectedIndex + delta + length) % length;
    renderMentionPicker();
    return true;
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    const candidate = state.mention.candidates[state.mention.selectedIndex];
    if (candidate) {
      event.preventDefault();
      insertMentionText(candidate.insertName || candidate.name, { replaceToken: true });
      return true;
    }
  }
  return false;
}

function renderMentionPicker() {
  const picker = document.getElementById('mention-popover');
  if (!picker) return;
  const conversation = getActiveConversation();
  if (!state.mention.active || conversation?.type !== 'group') {
    picker.classList.add('hidden');
    picker.innerHTML = '';
    return;
  }
  picker.classList.remove('hidden');
  picker.innerHTML = '';
  state.mention.candidates.forEach((candidate, index) => {
    const row = document.createElement('button');
    row.className = `mention-row${index === state.mention.selectedIndex ? ' is-active' : ''}`;
    row.type = 'button';
    row.innerHTML = `
      <img src="${escapeHtml(candidate.avatar)}" alt="">
      <span><strong>@${escapeHtml(candidate.name)}</strong><small>${escapeHtml(candidate.description || '群成员')}</small></span>
    `;
    row.addEventListener('mousedown', event => {
      event.preventDefault();
      insertMentionText(candidate.insertName || candidate.name, { replaceToken: true });
    });
    picker.appendChild(row);
  });
}

function closeMentionPicker() {
  state.mention.active = false;
  state.mention.candidates = [];
  const picker = document.getElementById('mention-popover');
  if (picker) {
    picker.classList.add('hidden');
    picker.innerHTML = '';
  }
}

function getMentionCandidates(conversation, query) {
  const normalized = String(query || '').trim().toLowerCase();
  const allCandidate = {
    id: 'all',
    name: '大家',
    insertName: '大家',
    avatar: 'src/_logo/icons/users.svg',
    description: '全体成员'
  };
  const members = getGroupMembers(conversation).map(character => ({
    id: character.id,
    name: character.name,
    insertName: character.name,
    avatar: characterAvatar(character),
    description: character.description || character.source
  }));
  return [allCandidate, ...members]
    .filter(item => !normalized || item.name.toLowerCase().includes(normalized) || String(item.description || '').toLowerCase().includes(normalized))
    .slice(0, 8);
}

function findMentionToken(value, caret) {
  const before = String(value || '').slice(0, caret);
  const match = before.match(/[@＠][^\s@＠，。！？、：:；;]*$/);
  if (!match) return null;
  return {
    start: caret - match[0].length,
    query: match[0].slice(1)
  };
}

function insertMentionText(name, options = {}) {
  const input = document.getElementById('message-input');
  if (!input || !name) return;
  const value = input.value || '';
  const caret = input.selectionStart || value.length;
  const token = options.replaceToken ? findMentionToken(value, caret) : null;
  const start = token ? token.start : caret;
  const end = token ? caret : caret;
  const insert = `@${name} `;
  input.value = `${value.slice(0, start)}${insert}${value.slice(end)}`;
  const nextCaret = start + insert.length;
  input.focus();
  input.setSelectionRange(nextCaret, nextCaret);
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 128)}px`;
  closeMentionPicker();
}

function renderMessageText(container, text) {
  container.innerHTML = '';
  const source = String(text || '');
  const pattern = /[@＠][^\s@＠，。！？、：:；;]+/g;
  let lastIndex = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(source.slice(lastIndex, match.index)));
    }
    const mention = document.createElement('button');
    mention.className = 'message-mention';
    mention.type = 'button';
    mention.textContent = match[0];
    mention.addEventListener('click', () => insertMentionText(match[0].slice(1)));
    container.appendChild(mention);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < source.length) {
    container.appendChild(document.createTextNode(source.slice(lastIndex)));
  }
}

async function refreshKnowledgePanel() {
  const list = document.getElementById('kb-list');
  if (!list) return;
  const kbs = await listKnowledgeBases().catch(() => []);
  const activeIds = getActiveKnowledgeBaseIds().filter(id => kbs.some(kb => kb.id === id));
  const activeSet = new Set(activeIds);
  if (state.selectedKbId && !kbs.some(kb => kb.id === state.selectedKbId)) {
    state.selectedKbId = '';
    state.selectedKbFileId = '';
  }
  if (!state.selectedKbId && kbs.length) state.selectedKbId = activeIds[0] || kbs[0].id;
  list.innerHTML = '';
  for (const kb of kbs) {
    const item = document.createElement('button');
    item.className = `kb-item${state.selectedKbId === kb.id ? ' is-active' : ''}`;
    item.type = 'button';
    item.innerHTML = `
      <strong>${escapeHtml(kb.name)}</strong>
      <small>${kb.fileCount || 0} 文件 · ${kb.chunkCount || 0} 分块 · ${activeSet.has(kb.id) ? '已启用' : '未启用'}</small>
    `;
    item.addEventListener('click', () => {
      state.selectedKbId = kb.id;
      state.selectedKbFileId = '';
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
  const empty = document.getElementById('kb-empty');
  const detail = document.getElementById('kb-detail');
  const title = document.getElementById('kb-current-title');
  const meta = document.getElementById('kb-current-meta');
  const activeStatus = document.getElementById('kb-active-status');
  const enable = document.getElementById('kb-enable-toggle');
  const fileList = document.getElementById('kb-file-list');
  const chunkPreview = document.getElementById('kb-chunk-list');
  if (!empty || !detail || !fileList || !chunkPreview) return;
  const kbs = await listKnowledgeBases().catch(() => []);
  const kb = kbs.find(item => item.id === state.selectedKbId) || null;
  empty.classList.toggle('hidden', Boolean(kb));
  detail.classList.toggle('hidden', !kb);
  if (!state.selectedKbId) {
    fileList.innerHTML = '';
    chunkPreview.innerHTML = '';
    return;
  }
  if (!kb) return;
  const activeIds = getActiveKnowledgeBaseIds();
  const isActive = activeIds.includes(kb.id);
  if (title) title.textContent = kb.name;
  if (meta) meta.textContent = `${kb.fileCount || 0} 文件 · ${kb.chunkCount || 0} 分块`;
  if (activeStatus) {
    activeStatus.textContent = isActive ? '此知识库正在参与 RAG 检索。' : '此知识库未启用，启用后会加入检索上下文。';
    activeStatus.dataset.kind = isActive ? 'ok' : 'info';
  }
  if (enable) {
    enable.textContent = isActive ? '停用检索' : '启用此知识库';
    enable.classList.toggle('btn-primary', !isActive);
    enable.classList.toggle('btn-soft', isActive);
    enable.classList.add('kb-icon-btn');
    enable.innerHTML = `<img src="${isActive ? 'src/_logo/icons/x.svg' : 'src/_logo/icons/database.svg'}" alt="">`;
    enable.title = isActive ? '停用检索' : '启用此知识库';
    enable.setAttribute('aria-label', enable.title);
  }
  const deleteKb = document.getElementById('kb-delete-btn');
  if (deleteKb) {
    deleteKb.classList.add('kb-icon-btn', 'kb-icon-btn-danger');
    deleteKb.innerHTML = '<img src="src/_logo/icons/trash-2.svg" alt="">';
    deleteKb.title = '删除知识库';
    deleteKb.setAttribute('aria-label', '删除知识库');
  }
  await renderKnowledgeFileList(kb.id);
}

async function renderKnowledgeFileList(kbId) {
  const fileList = document.getElementById('kb-file-list');
  if (!fileList) return;
  const files = (await getKnowledgeBaseFiles(kbId)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!files.some(file => file.id === state.selectedKbFileId)) {
    state.selectedKbFileId = files[0]?.id || '';
  }
  fileList.innerHTML = '';
  if (!files.length) {
    fileList.innerHTML = '<div class="kb-empty-line">还没有文档。上传 txt 或 md 文件后会自动建立索引。</div>';
    await renderKnowledgeChunks(kbId, '');
    return;
  }
  for (const file of files) {
    const row = document.createElement('article');
    row.className = `file-row${state.selectedKbFileId === file.id ? ' is-active' : ''}`;
    row.tabIndex = 0;
    row.dataset.fileId = file.id;
    row.innerHTML = `
      <span><strong>${escapeHtml(file.name)}</strong><small>${file.charCount || 0} 字 · ${file.chunkCount || 0} 分块 · ${formatBytes(file.size)}</small></span>
      <button class="btn btn-danger" type="button" data-delete-file="${escapeHtml(file.id)}">删除</button>
    `;
    const fileDeleteButton = row.querySelector('[data-delete-file]');
    if (fileDeleteButton) {
      fileDeleteButton.classList.add('kb-icon-btn', 'kb-icon-btn-danger');
      fileDeleteButton.innerHTML = '<img src="src/_logo/icons/trash-2.svg" alt="">';
      fileDeleteButton.title = '删除文档';
      fileDeleteButton.setAttribute('aria-label', '删除文档');
    }
    row.addEventListener('click', event => {
      const deleteButton = event.target.closest('[data-delete-file]');
      if (deleteButton) return;
      state.selectedKbFileId = file.id;
      renderKnowledgeChunks(kbId, file.id);
      renderKnowledgeFileList(kbId);
    });
    row.querySelector('[data-delete-file]')?.addEventListener('click', async event => {
      event.stopPropagation();
      if (!confirm(`确认删除「${file.name}」及其所有分块？`)) return;
      try {
        await deleteKnowledgeBaseFile(file.id);
        if (state.selectedKbFileId === file.id) state.selectedKbFileId = '';
        setKbStatus('文件已删除，索引已重建。', 'ok');
        refreshKnowledgePanel();
      } catch (err) {
        setKbStatus(err?.message || '删除文件失败。', 'warn');
      }
    });
    fileList.appendChild(row);
  }
  await renderKnowledgeChunks(kbId, state.selectedKbFileId);
}

async function renderKnowledgeChunks(kbId, fileId) {
  const title = document.getElementById('kb-preview-title');
  const chunkPreview = document.getElementById('kb-chunk-list');
  if (!chunkPreview) return;
  if (!fileId) {
    if (title) title.textContent = '分块预览';
    chunkPreview.innerHTML = '<div class="kb-empty-line">选择一个文件查看分块。</div>';
    return;
  }
  const files = await getKnowledgeBaseFiles(kbId);
  const file = files.find(item => item.id === fileId);
  const chunks = await getKnowledgeBaseChunks(kbId, fileId);
  const previewChunks = chunks.slice(0, MAX_KB_PREVIEW_CHUNKS);
  if (title) {
    const suffix = chunks.length > MAX_KB_PREVIEW_CHUNKS ? ` · 前 ${MAX_KB_PREVIEW_CHUNKS}/${chunks.length} 块` : ` · ${chunks.length} 块`;
    title.textContent = file ? `分块预览 · ${file.name}${suffix}` : '分块预览';
  }
  chunkPreview.innerHTML = previewChunks.map(chunk => `
    <div class="chunk-row">
      <strong>#${chunk.index + 1} ${escapeHtml(chunk.title || '片段')}</strong>
      <small>${escapeHtml(compactText(chunk.text || '', MAX_KB_PREVIEW_CHARS))}</small>
    </div>
  `).join('') || '<div class="kb-empty-line">这个文件暂无分块。</div>';
}

function setKbStatus(text, kind = 'info') {
  const status = document.getElementById('kb-active-status') || document.getElementById('kb-upload-status');
  if (!status) return;
  status.textContent = text || '';
  status.dataset.kind = kind;
}

function renderMemoryNodePanel() {
  const store = getLongTermMemoryStore();
  const stats = document.getElementById('memory-node-stats');
  if (stats) stats.textContent = `${store.memories.length} 条记忆 · ${store.edges.length} 条关系`;
  renderMemoryArchive();
  if (!document.getElementById('memory-search-results')?.classList.contains('hidden')) performMemorySearch();
  renderMemoryGraph();
}

function renderMemoryArchive() {
  const list = document.getElementById('memory-archive-list');
  if (!list) return;
  const store = getLongTermMemoryStore();
  const filter = state.memoryGraph.archiveFilter || 'orphan';
  const search = String(document.getElementById('memory-archive-search')?.value || '').trim().toLowerCase();
  const orphanIds = new Set(getOrphanMemories(store).map(memory => memory.id));
  const rows = store.memories
    .filter(memory => {
      if (filter === 'orphan' && !orphanIds.has(memory.id)) return false;
      if (filter === 'public' && memory.scope !== 'public:roundtable') return false;
      if (filter === 'private' && memory.scope === 'public:roundtable') return false;
      if (!search) return true;
      return [
        memory.text,
        memory.source,
        memory.scope,
        memory.characterName,
        memory.characterId,
        ...(memory.tags || [])
      ].some(value => String(value || '').toLowerCase().includes(search));
    })
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
    .slice(0, 120);
  updateMemoryArchiveFilter(filter);
  list.innerHTML = rows.map(memory => `
    <article class="memory-archive-item">
      <strong>${escapeHtml(memory.text)}</strong>
      <small>${escapeHtml(memory.source)} · ${memory.scope === 'public:roundtable' ? '公共记忆' : '私有记忆'} · ${escapeHtml(memory.characterName || memory.characterId || '公共')}</small>
      <button class="btn btn-danger" type="button" data-delete-memory-id="${escapeHtml(memory.id)}">删除</button>
    </article>
  `).join('') || '<div class="memory-empty-line">没有匹配的记忆。</div>';
  list.querySelectorAll('[data-delete-memory-id]').forEach(button => {
    button.addEventListener('click', () => {
      deleteLongTermMemoryMemory(button.dataset.deleteMemoryId);
      renderMemoryNodePanel();
    });
  });
}

function performMemorySearch() {
  const query = document.getElementById('memory-search-input')?.value.trim() || '';
  const panel = document.getElementById('memory-search-results');
  const title = document.getElementById('memory-result-title');
  const list = document.getElementById('memory-result-list');
  const store = getLongTermMemoryStore();
  if (!list) return;
  panel?.classList.remove('hidden');
  if (title) title.textContent = query ? `搜索：${query}` : '全部关系';
  const results = store.edges.filter(edge => {
    if (!query) return true;
    return `${edge.head} ${edge.relation} ${edge.tail}`.includes(query);
  }).slice(0, 60);
  list.innerHTML = results.map(edge => `
    <article class="memory-result-item" role="button" tabindex="0" data-edge-id="${escapeHtml(edge.id)}">
      <strong>${escapeHtml(edge.head)} ${escapeHtml(edge.relation)} ${escapeHtml(edge.tail)}</strong>
      <small>${edge.scope === 'public:roundtable' ? '公共记忆' : '私有记忆'} · 来源 ${(edge.sourceMemoryIds || []).length} 条</small>
      <span class="memory-result-actions"><span>定位节点</span><button class="btn btn-danger" type="button" data-delete-edge-id="${escapeHtml(edge.id)}">删除</button></span>
    </article>
  `).join('') || '<div class="memory-result-item"><small>没有匹配的关系。</small></div>';
  list.querySelectorAll('[data-edge-id]').forEach(button => {
    button.addEventListener('click', event => {
      if (event.target.closest('[data-delete-edge-id]')) return;
      const graph = state.memoryGraph;
      const edge = graph.edges.find(item => item.id === button.dataset.edgeId);
      graph.selectedNodeId = edge?.from || '';
      renderMemoryNodeDetail();
    });
  });
  list.querySelectorAll('[data-delete-edge-id]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      const edge = store.edges.find(item => item.id === button.dataset.deleteEdgeId);
      const label = edge ? `${edge.head} --${edge.relation}--> ${edge.tail}` : '该关系';
      if (!confirm(`确认删除「${label}」？\n这会同时删除长期记忆知识库中对应的相关内容。`)) return;
      deleteLongTermMemoryEdge(button.dataset.deleteEdgeId);
      renderMemoryNodePanel();
    });
  });
}

function updateMemoryArchiveFilter(filter) {
  document.querySelectorAll('[data-memory-filter]').forEach(button => {
    const active = button.dataset.memoryFilter === filter;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function closeMemoryArchivePopover() {
  document.getElementById('memory-archive-popover')?.classList.add('hidden');
}

function closeMemorySettingsPopover() {
  document.getElementById('memory-settings-popover')?.classList.add('hidden');
}

function syncMemoryNodeSettings() {
  const settings = getLongTermMemorySettings();
  setChecked('memory-setting-enabled', settings.enabled);
  setChecked('memory-setting-intimate', settings.includeIntimate);
  setValue('memory-setting-retention', settings.retentionDays);
  setValue('memory-setting-keywords', (settings.blockedKeywords || []).join('\n'));
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
  const positionIds = new Set(graph.nodes.map(node => node.id));
  Object.keys(state.memoryGraph.positions).forEach(id => {
    if (!positionIds.has(id)) delete state.memoryGraph.positions[id];
  });
  const nodes = graph.nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, graph.nodes.length);
    const radius = Math.max(90, Math.min(width, height) * 0.34);
    const fallbackX = centerX + Math.cos(angle) * radius;
    const fallbackY = centerY + Math.sin(angle) * radius;
    const saved = state.memoryGraph.positions[node.id];
    return {
      ...node,
      x: Number.isFinite(saved?.x) ? saved.x : fallbackX,
      y: Number.isFinite(saved?.y) ? saved.y : fallbackY,
      r: node.kind === 'player' ? 24 : node.kind === 'public' ? 21 : 18
    };
  });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edges = graph.edges;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  const transform = state.memoryGraph.transform;
  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.scale, transform.scale);
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
  ctx.restore();
  state.memoryGraph.nodes = nodes;
  state.memoryGraph.edges = edges;
  renderMemoryNodeDetail();
}

function screenToGraph(x, y) {
  const transform = state.memoryGraph.transform;
  return {
    x: (x - transform.x) / transform.scale,
    y: (y - transform.y) / transform.scale
  };
}

function findMemoryNodeAtPoint(point) {
  return state.memoryGraph.nodes.find(item => Math.hypot(item.x - point.x, item.y - point.y) < item.r + 4);
}

function zoomMemoryGraph(screenX, screenY, factor) {
  const transform = state.memoryGraph.transform;
  const before = screenToGraph(screenX, screenY);
  const nextScale = Math.max(0.45, Math.min(2.8, transform.scale * factor));
  transform.scale = nextScale;
  transform.x = screenX - before.x * nextScale;
  transform.y = screenY - before.y * nextScale;
  renderMemoryGraph();
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
  setValue('adv-kb-overlap', advanced.kbChunkOverlap);
  setValue('adv-kb-candidate-limit', advanced.kbCandidateLimit);
  setValue('adv-kb-inject-limit', advanced.kbInjectLimit);
  setValue('adv-roundtable-max', advanced.roundtableMaxParticipants);
  setValue('adv-roundtable-token-limit', advanced.roundtableTokenHardLimit);
  setValue('adv-roundtable-call-limit', advanced.roundtableCallLimit);
  setValue('adv-roundtable-follow-up-rate', advanced.roundtableFollowUpRate);
  setValue('adv-history-limit', advanced.historyLimit);
  setValue('adv-memory-limit', advanced.memoryLimit);
  setValue('adv-edge-limit', advanced.edgeLimit);
  setValue('localization-sensitivity', settings.localizationSensitivity);
  setChecked('deepseek-intimate-mode', settings.deepseekIntimateMode);
  const enabled = document.getElementById('memory-enabled');
  if (enabled) enabled.checked = memory.enabled;
  setValue('memory-retention', memory.retentionDays);
  setValue('memory-blocked', memory.blockedKeywords.join(', '));
  refreshAdvancedValueLabels();
  updateDeepSeekIntimateVisibility();
}

function refreshAdvancedValueLabels() {
  const valueOf = id => document.getElementById(id)?.value ?? '';
  const checked = document.getElementById('deepseek-intimate-mode')?.checked;
  const rows = {
    'adv-kb-chunk-size-value': valueOf('adv-kb-chunk-size'),
    'adv-kb-overlap-value': valueOf('adv-kb-overlap'),
    'adv-kb-candidate-limit-value': valueOf('adv-kb-candidate-limit'),
    'adv-kb-inject-limit-value': valueOf('adv-kb-inject-limit'),
    'adv-history-limit-value': valueOf('adv-history-limit'),
    'adv-memory-limit-value': valueOf('adv-memory-limit'),
    'adv-edge-limit-value': valueOf('adv-edge-limit'),
    'adv-roundtable-max-value': valueOf('adv-roundtable-max'),
    'adv-roundtable-token-limit-value': valueOf('adv-roundtable-token-limit'),
    'adv-roundtable-call-limit-value': valueOf('adv-roundtable-call-limit'),
    'adv-roundtable-follow-up-rate-value': `${Math.round(Number(valueOf('adv-roundtable-follow-up-rate')) * 100 || 0)}%`,
    'localization-sensitivity-value': `${(Number(valueOf('localization-sensitivity')) || 0.5).toFixed(2)}x`,
    'deepseek-intimate-mode-value': checked ? 'ON' : 'OFF'
  };
  Object.entries(rows).forEach(([id, value]) => setText(id, value));
}

function updateDeepSeekIntimateVisibility() {
  const card = document.getElementById('deepseek-intimate-mode-card');
  if (!card) return;
  const draft = {
    ...getSettings(),
    model: document.getElementById('model-name')?.value || getSettings().model,
    localizationSensitivity: Number(document.getElementById('localization-sensitivity')?.value)
  };
  card.classList.toggle('hidden', !isDeepSeekIntimateModeAvailable(draft));
  refreshAdvancedValueLabels();
}

function updateContextStatus() {
  const activeKb = getActiveKnowledgeBaseIds();
  const memory = getLongTermMemorySettings();
  const settings = getSettings();
  setText('rag-status', activeKb.length ? `${activeKb.length} 个已启用` : '未启用');
  setText('ltm-status', memory.enabled ? '启用' : '关闭');
  setText('model-status', settings.apiKey ? settings.model : '未配置');
}

function openPanel(id, options = {}) {
  document.getElementById(id)?.classList.remove('hidden');
  if (id === 'group-editor-panel') {
    prepareGroupEditor(options);
    renderGroupMemberPicker();
  }
  if (id === 'memory-node-panel') openMemoryNodePanel();
  if (id === 'sticker-manager-panel') {
    showStickerManagerSection('manage');
    renderStickerManager();
  }
}

function closePanel(id) {
  if (id === 'memory-node-panel') {
    closeMemoryNodePanel();
    return;
  }
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

function showStickerManagerSection(section) {
  document.querySelectorAll('[data-sticker-section]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.stickerSection === section);
  });
  document.querySelectorAll('[data-sticker-view]').forEach(view => {
    view.classList.toggle('is-active', view.dataset.stickerView === section);
  });
}

function selectConversation(id) {
  const next = saveAppStore({ ...state.store, activeConversationId: id });
  document.getElementById('app')?.classList.remove('is-detail-open');
  closeGroupInfoPanel();
  closeMentionPicker();
  closeStickerPopover();
  updateStore(next);
  document.getElementById('app')?.classList.add('is-chat-open');
}

function updateStore(store) {
  state.store = store || loadAppStore();
  renderAll();
}

function scheduleRoundtableIdle() {
  if (roundtableIdleTimer) clearTimeout(roundtableIdleTimer);
  roundtableIdleTimer = 0;
  const conversation = getActiveConversation();
  if (!conversation || conversation.type !== 'group') return;
  const settings = normalizeGroupSettings(conversation.groupSettings);
  if (!settings.idleTalk || !settings.autoBotChat) return;
  const messages = getConversationMessages(state.store, conversation.id);
  const latest = messages[messages.length - 1];
  if (latest?.status === 'typing') return;
  const lastActivity = latest?.createdAt || conversation.updatedAt || Date.now();
  const delay = Math.max(12000, ROUNDTABLE_IDLE_DELAY_MS - (Date.now() - lastActivity));
  roundtableIdleTimer = setTimeout(async () => {
    const active = getActiveConversation();
    if (!active || active.id !== conversation.id || active.type !== 'group') return;
    const activeSettings = normalizeGroupSettings(active.groupSettings);
    if (!activeSettings.idleTalk || !activeSettings.autoBotChat) return;
    await runRoundtableTurn({
      store: state.store,
      conversation: active,
      characters: state.store.characters,
      triggerText: '',
      onStore: updateStore
    });
  }, delay);
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
  return 'src/_char/Profile_GroupChat.png';
}

function handleChatInfoToggle() {
  const conversation = getActiveConversation();
  if (!conversation) return;
  if (conversation.type === 'group') {
    openGroupInfoPanel();
    return;
  }
  document.getElementById('app')?.classList.toggle('is-detail-open');
  renderDetail();
}

function updateConversationChrome(conversation) {
  const app = document.getElementById('app');
  const infoButton = document.getElementById('chat-info-btn');
  if (!app) return;
  const isPrivate = conversation?.type === 'private';
  const isGroup = conversation?.type === 'group';
  app.classList.toggle('is-private-chat', Boolean(isPrivate));
  app.classList.toggle('is-group-chat', Boolean(isGroup));
  if (!isPrivate) app.classList.remove('is-detail-open');
  if (!isGroup) closeGroupInfoPanel();
  if (infoButton) {
    infoButton.title = isPrivate ? '角色卡片' : '群聊成员';
    infoButton.setAttribute('aria-label', isPrivate ? '打开角色卡片' : '打开群聊成员');
    const icon = infoButton.querySelector('img');
    if (icon) icon.src = isPrivate ? 'src/_logo/icons/bot.svg' : 'src/_logo/icons/users.svg';
  }
  document.querySelectorAll('.detail-group-action').forEach(button => {
    button.classList.toggle('hidden', !isGroup);
  });
}

function prepareGroupEditor(options = {}) {
  const active = getActiveConversation();
  state.groupMemberSearch = '';
  state.groupEditorMode = !options.fresh && active?.type === 'group' ? 'edit' : 'create';
  const search = document.getElementById('group-member-search');
  if (search) search.value = '';
  state.groupMemberSelection = new Set(state.groupEditorMode === 'edit' ? active.memberIds : []);
}

function renderGroupSelectionSummary() {
  const strip = document.getElementById('group-selected-strip');
  const total = document.getElementById('group-member-total');
  const create = document.getElementById('create-group-btn');
  const title = document.getElementById('group-editor-title');
  const selectedCharacters = [...state.groupMemberSelection]
    .map(id => getCharacterById(state.store.characters, id))
    .filter(Boolean);
  if (total) total.textContent = String(state.store.characters.length);
  if (title) title.textContent = state.groupEditorMode === 'edit' ? '群聊成员' : '创建群聊';
  if (strip) {
    strip.innerHTML = selectedCharacters.length
      ? selectedCharacters.map(character => `<img src="${escapeHtml(characterAvatar(character))}" alt="${escapeHtml(character.name)}" title="${escapeHtml(character.name)}">`).join('')
      : '<span>选择至少 2 位好友</span>';
  }
  if (create) {
    const count = selectedCharacters.length;
    create.disabled = count < 2;
    if (state.groupEditorMode === 'edit') {
      create.textContent = count ? `保存成员(${count})` : '保存成员';
    } else {
      create.textContent = count ? `创建群聊(${count})` : '创建群聊';
    }
  }
}

function buildGroupTitle(memberIds) {
  const names = memberIds
    .map(id => getCharacterById(state.store.characters, id)?.name)
    .filter(Boolean);
  if (!names.length) return '圆桌密语';
  const title = names.slice(0, 3).join('、');
  return names.length > 3 ? `${title} 等人的群聊` : `${title}的群聊`;
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

function setChecked(id, value) {
  const element = document.getElementById(id);
  if (element) element.checked = Boolean(value);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value ?? '';
}

function compactLabel(label, max = 7) {
  const chars = [...String(label || '')];
  return chars.length > max ? `${chars.slice(0, max).join('')}...` : label;
}

function compactText(text, max = 360) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const chars = [...normalized];
  return chars.length > max ? `${chars.slice(0, max).join('')}...` : normalized;
}

function formatBytes(size) {
  const bytes = Math.max(0, Number(size) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const value = bytes / 1024;
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
