import {
  appendMessage,
  createGroupConversation,
  createId,
  ensurePrivateConversation,
  formatConversationListTime,
  formatMessageTime,
  formatTime,
  getConversationMessages,
  loadAppStore,
  normalizeGroupSettings,
  normalizeCharacterRecord,
  now,
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
import { completePrivateMessageReply } from './chat_engine.js';
import { completeToolPrivateMessageReply } from './tool_chat_engine.js';
import {
  MCP_CONFIG_EVENT,
  MCP_LOG_EVENT,
  MCP_TRANSPORTS,
  buildWebMcpManifest,
  clearMcpLogs,
  createDefaultMcpClient,
  deleteMcpClient,
  formatMcpServerConfigJson,
  getAvailableMcpClients,
  getMcpConfig,
  getSelectedMcpClientIds,
  getWebMcpTools,
  initWebMcpServer,
  isMcpEnabledForConversation,
  parseMcpServerConfigJson,
  saveMcpConfig,
  setSelectedMcpClientIds,
  upsertMcpClient
} from './mcp_tools.js';
import {
  MODELSCOPE_LOGIN_URL,
  MODELSCOPE_MCP_PAGE_URL,
  buildModelScopeMcpConfig,
  checkModelScopeLogin,
  deployModelScopeMcp,
  fetchHostedModelScopeMcps,
  fetchModelScopeMcpDetail,
  normalizeModelScopeMcp
} from './plugin_store.js';
import { getRoundtableError, runRoundtableTurn } from './roundtable.js';
import { getMediaDataUrl, isMediaRef, saveBlobAsMedia, saveFileAsMedia } from './media_store.js';
import {
  exportArchiveZip,
  formatArchiveDate,
  formatArchiveSize,
  getArchiveStats,
  getWebDavConfig,
  ensureWebDavCorsSupport,
  importArchiveZipFile,
  resolveArchiveConflict,
  saveWebDavConfig,
  startArchiveSync,
  syncWebDavNow,
  testWebDavConnection
} from './archive_sync.js';
import { getRuntimeEnvironment, isBrowserFrontendRuntime } from './runtime_env.js';

const MAX_KB_PREVIEW_CHUNKS = 80;
const MAX_KB_PREVIEW_CHARS = 360;
const ROUNDTABLE_IDLE_DELAY_MS = 45000;
const CONVERSATION_LIST_WIDTH_KEY = 'fritia_conversation_list_width';
const CONVERSATION_LIST_DEFAULT_WIDTH = 360;
const CONVERSATION_LIST_MIN_WIDTH = 272;
const CONVERSATION_LIST_MAX_WIDTH = 560;
const CONVERSATION_LIST_MIN_CHAT_WIDTH = 420;
const DESKTOP_LANDSCAPE_QUERY = '(min-width: 761px) and (orientation: landscape)';
const MOBILE_LAYOUT_QUERY = '(max-width: 760px)';
const MOBILE_EDGE_BACK_START = 48;
const MOBILE_EDGE_BACK_DISTANCE = 76;
const MODELSCOPE_LOGIN_POLL_INTERVAL_MS = 2500;
const MODELSCOPE_LOGIN_POLL_TIMEOUT_MS = 120000;
const ROLE_PLUGIN_CATALOG_URL = 'https://chat.fritia.online/api/downloads/fritia-online-source/char/plugin_char.json';
const ROLE_PLUGIN_RESOURCE_BASE_URL = 'https://chat.fritia.online/api/downloads/fritia-online-source/char';
const ROLE_PLUGIN_ACCESS_TOKEN = 'cyandust_workshop';
const ROLE_PLUGIN_CARD_ICON = 'src/_logo/icons/girl.svg';

let roundtableIdleTimer = 0;
let layoutResizeFrame = 0;
let mobileEdgeSwipe = null;
let voiceNoticeTimer = 0;
let voicePlaybackTimer = 0;
let pluginStoreSearchTimer = 0;
let modelScopeLoginPollTimer = 0;
let modelScopeLoginPollEndsAt = 0;

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
  modelProviderTab: 'chat',
  selectedChatProviderId: '',
  selectedTtsProviderId: '',
  roundtableErrorPopoverOpen: false,
  voiceErrorPopoverOpen: false,
  voiceError: null,
  mainMenuOpen: false,
  quickCreateMenuOpen: false,
  archiveConfigOpen: false,
  archiveProgress: {
    phase: 'idle',
    label: '等待操作',
    progress: 0
  },
  archiveConflict: null,
  toolPanelSection: 'client',
  mcpTransport: MCP_TRANSPORTS.STREAMABLE_HTTP,
  selectedMcpClientId: '',
  mcpPickerOpen: false,
  mcpHelpLoaded: false,
  mcpHelpHtml: '',
  activeToolRun: null,
  toolOtherFiles: {
    messageId: '',
    attachments: []
  },
  pluginStoreSection: 'roles',
  pluginSourceMenuOpen: false,
  pluginStore: {
    search: '',
    page: 1,
    pageSize: 12,
    total: 0,
    items: [],
    loading: false,
    error: '',
    loginChecking: false,
    modelScopeConnected: false,
    modelScopeMessage: '',
    detail: null,
    detailLoading: false,
    detailError: '',
    installing: false,
    installStatus: '',
    officialUrl: '',
    officialTitle: ''
  },
  rolePluginStore: {
    items: [],
    loading: false,
    loaded: false,
    error: '',
    requestId: 0,
    installingId: '',
    installStatus: ''
  },
  stickerPopoverOpen: false,
  voiceNotice: null,
  characterImport: {
    avatarUrl: '',
    voiceUrl: ''
  },
  characterEdit: {
    characterId: '',
    avatarUrl: '',
    voiceUrl: ''
  },
  voicePlayback: {
    messageId: '',
    audio: null,
    remaining: 0
  },
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
  installNativeBackHandler();
  initWebMcpServer({ getStore: () => state.store });
  bindGlobalEvents();
  applyStoredConversationListWidth();
  syncSettingsToForm();
  renderAll();
  syncMobileBackAvailability();
  ensurePreloadedKnowledgeBases().then(() => {
    refreshKnowledgePanel();
    updateContextStatus();
  });
  startArchiveSync();
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
  document.addEventListener('fritia-archive-sync-updated', () => {
    renderArchivePanel();
  });
  document.addEventListener(MCP_CONFIG_EVENT, () => {
    renderToolCallPanel();
    renderMcpPicker();
    updateConversationChrome(getActiveConversation());
  });
  document.addEventListener(MCP_LOG_EVENT, () => {
    renderMcpLogPanel();
  });
  document.addEventListener('fritia-archive-sync-status', event => {
    state.archiveProgress = event.detail || state.archiveProgress;
    renderArchiveProgress();
  });
  document.addEventListener('fritia-archive-conflict', event => {
    state.archiveConflict = event.detail || null;
    renderArchiveConflict();
  });
  bindConversationListResizer();
  bindMobileBackGesture();
  window.addEventListener('resize', () => {
    scheduleConversationListWidthSync();
    syncMobileBackAvailability();
  });

  document.querySelectorAll('[data-panel-open]').forEach(button => {
    button.addEventListener('click', () => {
      const section = button.dataset.settingsSectionJump;
      const openedFromDetailPane = Boolean(button.closest('.detail-pane'));
      openPanel(button.dataset.panelOpen);
      if (section) showSettingsSection(section);
      if (openedFromDetailPane) closeDetailPane();
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
  document.getElementById('voice-reply-toggle-btn')?.addEventListener('click', togglePrivateVoiceReply);
  document.getElementById('external-tools-toggle-btn')?.addEventListener('click', event => {
    event.stopPropagation();
    toggleMcpPicker();
  });
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
  document.getElementById('voice-error-btn')?.addEventListener('click', event => {
    event.stopPropagation();
    state.voiceErrorPopoverOpen = !state.voiceErrorPopoverOpen;
    renderVoiceErrorIndicator();
  });
  document.getElementById('voice-error-close')?.addEventListener('click', event => {
    event.stopPropagation();
    state.voiceErrorPopoverOpen = false;
    renderVoiceErrorIndicator();
  });
  document.getElementById('detail-close-btn')?.addEventListener('click', closeDetailPane);
  document.getElementById('mobile-back-btn')?.addEventListener('click', () => {
    closeMobileChatPage();
  });
  bindMainMenu();
  bindQuickCreateMenu();
  document.addEventListener('click', event => {
    if (!state.roundtableErrorPopoverOpen) return;
    const popover = document.getElementById('roundtable-error-popover');
    const button = document.getElementById('roundtable-error-btn');
    if (popover?.contains(event.target) || button?.contains(event.target)) return;
    state.roundtableErrorPopoverOpen = false;
    renderRoundtableErrorIndicator();
  });
  document.addEventListener('click', event => {
    if (!state.voiceErrorPopoverOpen) return;
    const popover = document.getElementById('voice-error-popover');
    const button = document.getElementById('voice-error-btn');
    if (popover?.contains(event.target) || button?.contains(event.target)) return;
    state.voiceErrorPopoverOpen = false;
    renderVoiceErrorIndicator();
  });
  document.addEventListener('click', event => {
    if (!state.stickerPopoverOpen) return;
    const popover = document.getElementById('sticker-popover');
    const button = document.getElementById('sticker-toggle-btn');
    if (popover?.contains(event.target) || button?.contains(event.target)) return;
    closeStickerPopover();
  });
  document.addEventListener('click', event => {
    if (!state.mcpPickerOpen) return;
    const popover = document.getElementById('mcp-picker-popover');
    const button = document.getElementById('external-tools-toggle-btn');
    if (popover?.contains(event.target) || button?.contains(event.target)) return;
    closeMcpPicker();
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.custom-select')) closeCustomSelects();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeMainMenu();
      closeQuickCreateMenu();
      closePluginSourceMenu();
      closeCustomSelects();
      closeMcpPicker();
    }
  });

  bindComposer();
  bindStickers();
  bindCharacterForm();
  bindCharacterEditForm();
  bindGroupEditor();
  bindGroupInfoPanel();
  bindSettings();
  bindKnowledge();
  bindMemoryPanel();
  bindArchivePanel();
  bindToolCallPanel();
  bindPluginStore();
}

function bindMainMenu() {
  document.getElementById('mobile-menu-btn')?.addEventListener('click', event => {
    event.stopPropagation();
    state.mainMenuOpen = !state.mainMenuOpen;
    renderMainMenu();
  });
  document.getElementById('main-menu-plugin-store')?.addEventListener('click', event => {
    event.stopPropagation();
    closeMainMenu();
    openPanel('plugin-store-panel');
  });
  document.getElementById('main-menu-official-site')?.addEventListener('click', event => {
    event.stopPropagation();
    closeMainMenu();
    openExternalUrl('https://fritia.online/');
  });
  document.addEventListener('click', event => {
    if (!state.mainMenuOpen) return;
    const menu = document.getElementById('main-menu');
    const button = document.getElementById('mobile-menu-btn');
    if (menu?.contains(event.target) || button?.contains(event.target)) return;
    closeMainMenu();
  });
  renderMainMenu();
}

function renderMainMenu() {
  const menu = document.getElementById('main-menu');
  const button = document.getElementById('mobile-menu-btn');
  const wrap = document.getElementById('main-menu-wrap');
  menu?.classList.toggle('hidden', !state.mainMenuOpen);
  wrap?.classList.toggle('is-open', state.mainMenuOpen);
  button?.setAttribute('aria-expanded', String(state.mainMenuOpen));
}

function closeMainMenu() {
  if (!state.mainMenuOpen) return;
  state.mainMenuOpen = false;
  renderMainMenu();
}

function bindQuickCreateMenu() {
  document.getElementById('quick-new-group')?.addEventListener('click', event => {
    event.stopPropagation();
    state.quickCreateMenuOpen = !state.quickCreateMenuOpen;
    renderQuickCreateMenu();
  });
  document.getElementById('quick-create-group')?.addEventListener('click', event => {
    event.stopPropagation();
    closeQuickCreateMenu();
    openPanel('group-editor-panel', { fresh: true });
  });
  document.getElementById('quick-import-character')?.addEventListener('click', event => {
    event.stopPropagation();
    closeQuickCreateMenu();
    openPanel('character-import-panel');
  });
  document.addEventListener('click', event => {
    if (!state.quickCreateMenuOpen) return;
    const menu = document.getElementById('quick-create-menu');
    const button = document.getElementById('quick-new-group');
    if (menu?.contains(event.target) || button?.contains(event.target)) return;
    closeQuickCreateMenu();
  });
  renderQuickCreateMenu();
}

function renderQuickCreateMenu() {
  const menu = document.getElementById('quick-create-menu');
  const button = document.getElementById('quick-new-group');
  const wrap = document.getElementById('quick-create-wrap');
  menu?.classList.toggle('hidden', !state.quickCreateMenuOpen);
  wrap?.classList.toggle('is-open', state.quickCreateMenuOpen);
  button?.setAttribute('aria-expanded', String(state.quickCreateMenuOpen));
}

function closeQuickCreateMenu() {
  if (!state.quickCreateMenuOpen) return;
  state.quickCreateMenuOpen = false;
  renderQuickCreateMenu();
}

function toggleMcpPicker() {
  const conversation = getActiveConversation();
  if (!conversation || conversation.type !== 'private') return;
  state.mcpPickerOpen = !state.mcpPickerOpen;
  renderMcpPicker();
}

function closeMcpPicker() {
  if (!state.mcpPickerOpen) return;
  state.mcpPickerOpen = false;
  renderMcpPicker();
}

function installNativeBackHandler() {
  if (typeof window === 'undefined') return;
  window.__FRITIA_HANDLE_ANDROID_BACK__ = handleAndroidBackAction;
}

function isPureFrontendToolRuntime() {
  return isBrowserFrontendRuntime(getRuntimeEnvironment());
}

function mcpTransportIconName(transport) {
  return transport === MCP_TRANSPORTS.STDIO ? 'tool-stdio' : 'tool-streamable-http';
}

function renderMcpPicker() {
  const popover = document.getElementById('mcp-picker-popover');
  const button = document.getElementById('external-tools-toggle-btn');
  if (!popover || !button) return;
  const conversation = getActiveConversation();
  const isPrivate = conversation?.type === 'private';
  const clients = getAvailableMcpClients();
  const selectedIds = new Set(isPrivate ? getSelectedMcpClientIds(conversation.id) : []);
  button.classList.toggle('hidden', !isPrivate);
  button.classList.toggle('is-active', selectedIds.size > 0);
  button.setAttribute('aria-pressed', String(selectedIds.size > 0));
  button.setAttribute('aria-expanded', String(state.mcpPickerOpen && isPrivate));
  if (!isPrivate || !state.mcpPickerOpen) {
    popover.classList.add('hidden');
    return;
  }
  popover.classList.remove('hidden');
  if (!clients.length) {
    popover.innerHTML = `
      <div class="mcp-picker-title">可调用 MCP 列表</div>
      <div class="mcp-picker-empty">
        <strong>暂无可用 MCP 客户端</strong>
        <span>请先在“工具调用”中添加 Streamable HTTP 服务。</span>
      </div>
    `;
    return;
  }
  popover.innerHTML = `
    <div class="mcp-picker-title">可调用 MCP 列表</div>
    ${clients.map(client => `
      <label class="mcp-picker-item">
        <input type="checkbox" value="${escapeHtml(client.id)}" ${selectedIds.has(client.id) ? 'checked' : ''}>
        <span class="mcp-picker-icon"><img src="src/_logo/icons/${mcpTransportIconName(client.transport)}.svg" alt=""></span>
        <span><strong>${escapeHtml(client.name)}</strong><small>${escapeHtml(clientSubtitle(client))}</small></span>
      </label>
    `).join('')}
  `;
  popover.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.addEventListener('change', event => {
      event.stopPropagation();
      const next = new Set(getSelectedMcpClientIds(conversation.id));
      if (event.target.checked) next.add(event.target.value);
      else next.delete(event.target.value);
      setSelectedMcpClientIds(conversation.id, [...next]);
      const character = getCharacterById(state.store.characters, conversation.memberIds[0]);
      if (next.size) {
        showVoiceNotice({
          conversationId: conversation.id,
          level: 'info',
          text: `现在 ${character?.name || conversationTitle(conversation)} 可以调用外部工具了。`
        });
      }
      renderMcpPicker();
    });
  });
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
    const media = await saveFileAsMedia(file, { category: 'attachment', prefix: 'att' });
    state.selectedAttachment = {
      id: createId('att'),
      type: 'image',
      name: file.name,
      mime: file.type,
      size: file.size,
      dataRef: media.ref,
      dataUrl: media.dataUrl
    };
    renderAttachmentPreview();
    imageInput.value = '';
  });
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const media = await saveFileAsMedia(file, { category: 'attachment', prefix: 'att' });
    state.selectedAttachment = {
      id: createId('att'),
      type: file.type.startsWith('audio/') ? 'audio' : 'file',
      name: file.name,
      mime: file.type,
      size: file.size,
      dataRef: media.ref,
      dataUrl: media.dataUrl
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
  const sent = sendMessageToActiveConversation(text, attachments);
  if (!sent) return;
  clearComposerDraft(input);
  closeStickerPopover();
}

function clearComposerDraft(input = document.getElementById('message-input')) {
  if (input) {
    input.value = '';
    input.style.height = 'auto';
  }
  state.selectedAttachment = null;
  renderAttachmentPreview();
  closeMentionPicker();
}

function sendMessageToActiveConversation(text, attachments = []) {
  let committed = null;
  try {
    committed = commitOutgoingMessage(text, attachments);
  } catch (error) {
    console.warn('[ui] outgoing message commit failed', error);
    notifyPersistenceFailure(error);
  }
  if (!committed) return null;
  continueConversationAfterOutgoing(committed);
  return committed;
}

function notifyPersistenceFailure(error) {
  window.alert([
    '本地持久化失败，消息没有发送。',
    '为避免刷新后丢失对话，当前发送已停止。',
    `错误详情：${error?.message || '未知错误'}`
  ].join('\n'));
}

function commitOutgoingMessage(text, attachments = []) {
  const conversation = getActiveConversation();
  if (!conversation) return null;
  const toolMode = conversation.type === 'private' && getSelectedMcpClientIds(conversation.id).length > 0;
  const message = {
    id: createId('msg'),
    role: 'user',
    speakerId: 'player',
    speakerName: '分析员',
    text,
    attachments: attachments.map(prepareAttachmentForPersistence),
    createdAt: now(),
    ...(toolMode ? { meta: { toolMode: true } } : {})
  };
  const store = appendMessage(state.store, conversation.id, message);
  updateStore(store);
  return {
    store,
    conversation: store.conversations.find(item => item.id === conversation.id) || conversation,
    message
  };
}

function prepareAttachmentForPersistence(attachment = {}) {
  const next = { ...attachment };
  if (next.dataRef) next.dataUrl = '';
  return next;
}

function continueConversationAfterOutgoing(committed) {
  const { store, conversation, message } = committed;
  if (!conversation) return;
  if (conversation.type === 'group') {
    runRoundtableTurn({
      store,
      conversation,
      characters: store.characters,
      triggerText: message.text,
      triggerAttachments: message.attachments || [],
      onStore: updateStore
    }).catch(error => {
      console.warn('[ui] roundtable turn failed', error);
    });
    return;
  }
  const character = getCharacterById(store.characters, conversation.memberIds[0]);
  if (!character) return;
  const selectedMcpClientIds = getSelectedMcpClientIds(conversation.id);
  if (selectedMcpClientIds.length) {
    const controller = new AbortController();
    state.activeToolRun = {
      conversationId: conversation.id,
      messageId: '',
      controller,
      stopping: false
    };
    renderMessages();
    completeToolPrivateMessageReply({
      store,
      conversation,
      character,
      text: message.text,
      userMessage: message,
      selectedClientIds: selectedMcpClientIds,
      onStore: updateStoreFromToolReply,
      signal: controller.signal
    }).catch(error => {
      console.warn('[ui] tool private reply failed', error);
    }).finally(() => {
      if (state.activeToolRun?.controller === controller) {
        state.activeToolRun = null;
        renderMessages();
      }
    });
    return;
  }
  completePrivateMessageReply({
    store,
    conversation,
    character,
    text: message.text,
    userMessage: message,
    voiceReplyEnabled: conversation.voiceReplyEnabled === true,
    onVoiceNotice: showVoiceNotice,
    onStore: updateStore
  }).catch(error => {
    console.warn('[ui] private reply failed', error);
  });
}

async function sendSticker(sticker) {
  const attachment = await stickerToAttachment(sticker);
  if (!attachment) return;
  const sent = sendMessageToActiveConversation('', [attachment]);
  if (!sent) return;
  closeStickerPopover();
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
  const form = document.getElementById('character-form');
  form?.querySelectorAll('input[maxlength], textarea[maxlength]').forEach(element => {
    element.addEventListener('input', () => updateCharacterImportCounter(element));
    updateCharacterImportCounter(element);
  });
  document.getElementById('char-avatar-file')?.addEventListener('change', event => {
    updateCharacterAvatarPreview(event.target.files?.[0]);
  });
  document.getElementById('char-voice-file')?.addEventListener('change', event => {
    updateCharacterVoicePreview(event.target.files?.[0]);
  });
  document.getElementById('char-voice-play')?.addEventListener('click', toggleCharacterVoicePreview);
  document.getElementById('char-load-prompt-file')?.addEventListener('click', () => {
    document.getElementById('char-prompt-file')?.click();
  });
  document.getElementById('char-prompt-file')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const prompt = document.getElementById('char-prompt');
    prompt.value = await readFileAsText(file);
    updateCharacterImportCounter(prompt);
    event.target.value = '';
  });
  form?.addEventListener('reset', () => {
    requestAnimationFrame(resetCharacterImportPreview);
  });
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const avatarFile = document.getElementById('char-avatar-file').files?.[0];
    const voiceFile = document.getElementById('char-voice-file').files?.[0];
    const avatarMedia = avatarFile ? await saveFileAsMedia(avatarFile, { category: 'avatar', prefix: 'avatar' }) : null;
    const voiceMedia = voiceFile ? await saveFileAsMedia(voiceFile, { category: 'voice', prefix: 'voice' }) : null;
    const name = document.getElementById('char-name').value.trim();
    const character = normalizeCharacterRecord({
      id: `char_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now().toString(36)}`,
      name,
      description: document.getElementById('char-description').value.trim(),
      prompt: document.getElementById('char-prompt').value.trim(),
      examples: document.getElementById('char-examples').value.trim(),
      avatar: avatarMedia ? avatarMedia.ref : 'src/_logo/emoji/robot_3d.png',
      voiceSample: voiceMedia ? voiceMedia.ref : '',
      source: 'custom',
      tags: ['自定义'],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    const next = upsertCharacter(state.store, character);
    ensurePrivateConversation(next, character);
    updateStore(loadAppStore());
    event.target.reset();
    resetCharacterImportPreview();
    closePanel('character-import-panel');
    selectConversation(`private:${character.id}`);
  });
}

function updateCharacterImportCounter(element) {
  if (!element?.id) return;
  const target = document.querySelector(`[data-count-for="${element.id}"]`);
  if (!target) return;
  const max = Number(element.getAttribute('maxlength')) || 0;
  const current = [...String(element.value || '')].length;
  target.textContent = max ? `${current}/${max}` : `${current}`;
}

function updateCharacterAvatarPreview(file) {
  if (state.characterImport.avatarUrl) URL.revokeObjectURL(state.characterImport.avatarUrl);
  state.characterImport.avatarUrl = '';
  const preview = document.getElementById('char-avatar-preview');
  if (!file) {
    if (preview) preview.src = 'src/_logo/emoji/robot_3d.png';
    return;
  }
  state.characterImport.avatarUrl = URL.createObjectURL(file);
  if (preview) preview.src = state.characterImport.avatarUrl;
}

function updateCharacterVoicePreview(file) {
  if (state.characterImport.voiceUrl) URL.revokeObjectURL(state.characterImport.voiceUrl);
  state.characterImport.voiceUrl = '';
  const preview = document.getElementById('char-voice-preview');
  const audio = document.getElementById('char-voice-audio');
  const playButton = document.getElementById('char-voice-play');
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
  }
  if (!file) {
    preview?.classList.add('is-empty');
    if (playButton) playButton.disabled = true;
    setText('char-voice-name', '尚未选择参考语音');
    setText('char-voice-meta', '支持 MP3 / WAV / M4A，大小不超过 10MB');
    return;
  }
  state.characterImport.voiceUrl = URL.createObjectURL(file);
  if (audio) audio.src = state.characterImport.voiceUrl;
  preview?.classList.remove('is-empty');
  if (playButton) playButton.disabled = false;
  setText('char-voice-name', file.name || '参考语音');
  setText('char-voice-meta', `${formatCompactFileSize(file.size)} · ${file.type || 'audio'}`);
}

function toggleCharacterVoicePreview() {
  const audio = document.getElementById('char-voice-audio');
  if (!audio?.src) return;
  if (audio.paused) audio.play().catch(error => console.warn('[ui] failed to preview voice sample', error));
  else audio.pause();
}

function resetCharacterImportPreview() {
  updateCharacterAvatarPreview(null);
  updateCharacterVoicePreview(null);
  document.querySelectorAll('#character-form input[maxlength], #character-form textarea[maxlength]').forEach(updateCharacterImportCounter);
}

function bindCharacterEditForm() {
  const form = document.getElementById('character-edit-form');
  form?.querySelectorAll('input[maxlength], textarea[maxlength]').forEach(element => {
    element.addEventListener('input', () => updateCharacterImportCounter(element));
  });
  document.getElementById('edit-char-avatar-file')?.addEventListener('change', event => {
    updateCharacterEditAvatarPreview(event.target.files?.[0]);
  });
  document.getElementById('edit-char-voice-file')?.addEventListener('change', event => {
    updateCharacterEditVoicePreview(event.target.files?.[0]);
  });
  document.getElementById('edit-char-voice-play')?.addEventListener('click', toggleCharacterEditVoicePreview);
  document.getElementById('edit-char-load-prompt-file')?.addEventListener('click', () => {
    document.getElementById('edit-char-prompt-file')?.click();
  });
  document.getElementById('edit-char-prompt-file')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const prompt = document.getElementById('edit-char-prompt');
    prompt.value = await readFileAsText(file);
    updateCharacterImportCounter(prompt);
    event.target.value = '';
  });
  form?.addEventListener('submit', saveCharacterEditForm);
}

function openCharacterEditPanel() {
  const character = getActivePrivateCharacter();
  if (!isEditableCharacter(character)) return false;
  clearCharacterEditTransientUrls();
  state.characterEdit.characterId = character.id;
  setValue('edit-char-name', character.name);
  setValue('edit-char-description', character.description);
  setValue('edit-char-prompt', character.prompt);
  setValue('edit-char-examples', character.examples);
  const avatarInput = document.getElementById('edit-char-avatar-file');
  const voiceInput = document.getElementById('edit-char-voice-file');
  if (avatarInput) avatarInput.value = '';
  if (voiceInput) voiceInput.value = '';
  setImageSource(document.getElementById('edit-char-avatar-preview'), character.avatar);
  setCharacterEditVoiceFromSource(character.voiceSample);
  document.querySelectorAll('#character-edit-form input[maxlength], #character-edit-form textarea[maxlength]').forEach(updateCharacterImportCounter);
  document.getElementById('character-edit-panel')?.classList.remove('hidden');
  return true;
}

function updateCharacterEditAvatarPreview(file) {
  if (state.characterEdit.avatarUrl) URL.revokeObjectURL(state.characterEdit.avatarUrl);
  state.characterEdit.avatarUrl = '';
  const preview = document.getElementById('edit-char-avatar-preview');
  if (!file) {
    const character = getCharacterById(state.store.characters, state.characterEdit.characterId);
    setImageSource(preview, character?.avatar);
    return;
  }
  state.characterEdit.avatarUrl = URL.createObjectURL(file);
  if (preview) preview.src = state.characterEdit.avatarUrl;
}

function updateCharacterEditVoicePreview(file) {
  if (state.characterEdit.voiceUrl) URL.revokeObjectURL(state.characterEdit.voiceUrl);
  state.characterEdit.voiceUrl = '';
  if (!file) {
    const character = getCharacterById(state.store.characters, state.characterEdit.characterId);
    setCharacterEditVoiceFromSource(character?.voiceSample);
    return;
  }
  state.characterEdit.voiceUrl = URL.createObjectURL(file);
  const preview = document.getElementById('edit-char-voice-preview');
  const audio = document.getElementById('edit-char-voice-audio');
  const playButton = document.getElementById('edit-char-voice-play');
  if (audio) {
    audio.pause();
    audio.dataset.voiceSource = state.characterEdit.voiceUrl;
    audio.src = state.characterEdit.voiceUrl;
  }
  preview?.classList.remove('is-empty');
  if (playButton) playButton.disabled = false;
  setText('edit-char-voice-name', file.name || '参考语音');
  setText('edit-char-voice-meta', `${formatCompactFileSize(file.size)} · ${file.type || 'audio'}`);
}

function setCharacterEditVoiceFromSource(source) {
  const value = String(source || '');
  const preview = document.getElementById('edit-char-voice-preview');
  const audio = document.getElementById('edit-char-voice-audio');
  const playButton = document.getElementById('edit-char-voice-play');
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.dataset.voiceSource = value;
  }
  if (!value) {
    preview?.classList.add('is-empty');
    if (playButton) playButton.disabled = true;
    setText('edit-char-voice-name', '尚未选择参考语音');
    setText('edit-char-voice-meta', '支持 MP3 / WAV / M4A，大小不超过 10MB');
    return;
  }
  preview?.classList.remove('is-empty');
  if (playButton) playButton.disabled = false;
  setText('edit-char-voice-name', '已配置 TTS 参考语音');
  setText('edit-char-voice-meta', '不上传新文件则保留当前参考语音');
  if (!audio) return;
  if (!isMediaRef(value)) {
    audio.src = value;
    return;
  }
  getMediaDataUrl(value)
    .then(dataUrl => {
      if (audio.dataset.voiceSource === value) audio.src = dataUrl || '';
    })
    .catch(error => {
      console.warn('[ui] failed to load edit voice sample', error);
      if (audio.dataset.voiceSource === value && playButton) playButton.disabled = true;
    });
}

function toggleCharacterEditVoicePreview() {
  const audio = document.getElementById('edit-char-voice-audio');
  if (!audio?.src) return;
  if (audio.paused) audio.play().catch(error => console.warn('[ui] failed to preview edit voice sample', error));
  else audio.pause();
}

async function saveCharacterEditForm(event) {
  event.preventDefault();
  const current = getCharacterById(state.store.characters, state.characterEdit.characterId);
  if (!isEditableCharacter(current)) return;
  const avatarFile = document.getElementById('edit-char-avatar-file')?.files?.[0];
  const voiceFile = document.getElementById('edit-char-voice-file')?.files?.[0];
  const avatarMedia = avatarFile ? await saveFileAsMedia(avatarFile, { category: 'avatar', prefix: 'avatar' }) : null;
  const voiceMedia = voiceFile ? await saveFileAsMedia(voiceFile, { category: 'voice', prefix: 'voice' }) : null;
  const updated = normalizeCharacterRecord({
    ...current,
    name: document.getElementById('edit-char-name')?.value.trim(),
    description: document.getElementById('edit-char-description')?.value.trim(),
    prompt: document.getElementById('edit-char-prompt')?.value.trim(),
    examples: document.getElementById('edit-char-examples')?.value.trim(),
    avatar: avatarMedia ? avatarMedia.ref : current.avatar,
    voiceSample: voiceMedia ? voiceMedia.ref : current.voiceSample,
    source: 'custom',
    updatedAt: Date.now()
  });
  if (!updated) return;
  const characters = state.store.characters.map(item => item.id === updated.id ? updated : item);
  const conversations = state.store.conversations.map(conversation => {
    if (conversation.type !== 'private' || conversation.memberIds[0] !== updated.id) return conversation;
    return {
      ...conversation,
      title: updated.name,
      avatar: updated.avatar,
      updatedAt: Date.now()
    };
  });
  const messages = Object.fromEntries(Object.entries(state.store.messages || {}).map(([conversationId, list]) => [
    conversationId,
    (Array.isArray(list) ? list : []).map(message => message.speakerId === updated.id
      ? { ...message, speakerName: updated.name }
      : message)
  ]));
  const saved = saveAppStore({
    ...state.store,
    characters,
    conversations,
    messages
  });
  updateStore(saved);
  closePanel('character-edit-panel');
}

function clearCharacterEditTransientUrls() {
  if (state.characterEdit.avatarUrl) URL.revokeObjectURL(state.characterEdit.avatarUrl);
  if (state.characterEdit.voiceUrl) URL.revokeObjectURL(state.characterEdit.voiceUrl);
  state.characterEdit.avatarUrl = '';
  state.characterEdit.voiceUrl = '';
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
    button.addEventListener('click', () => {
      openGroupInfoPanel();
      if (button.closest('.detail-pane')) closeDetailPane();
    });
  });
  document.getElementById('group-info-invite-btn')?.addEventListener('click', () => openGroupInfoEditor());
  document.getElementById('group-info-remove-btn')?.addEventListener('click', () => openGroupInfoEditor());
  document.getElementById('group-info-name-row')?.addEventListener('click', renameActiveGroupConversation);
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

function bindArchivePanel() {
  document.getElementById('archive-export-btn')?.addEventListener('click', () => runArchiveAction(() => exportArchiveZip()));
  document.getElementById('archive-import-file')?.addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (!file) return;
    runArchiveAction(() => importArchiveZipFile(file)).finally(() => {
      event.target.value = '';
    });
  });
  const importDrop = document.getElementById('archive-import-drop');
  importDrop?.addEventListener('dragover', event => {
    event.preventDefault();
    importDrop.classList.add('is-dragging');
  });
  importDrop?.addEventListener('dragleave', () => {
    importDrop.classList.remove('is-dragging');
  });
  importDrop?.addEventListener('drop', event => {
    event.preventDefault();
    importDrop.classList.remove('is-dragging');
    const file = [...(event.dataTransfer?.files || [])].find(item => /\.zip$/i.test(item.name || ''));
    if (file) runArchiveAction(() => importArchiveZipFile(file));
  });
  document.getElementById('archive-webdav-enabled')?.addEventListener('change', event => {
    const enabled = event.target.checked;
    if (!enabled) {
      saveWebDavConfig({ enabled: false });
      renderArchivePanel();
      return;
    }
    runArchiveAction(async () => {
      const next = { ...getWebDavConfig(), enabled: true };
      await ensureWebDavCorsSupport(next);
      saveWebDavConfig({ enabled: true });
    });
  });
  document.getElementById('archive-config-open')?.addEventListener('click', () => {
    state.archiveConfigOpen = true;
    syncArchiveConfigFields();
    renderArchivePanel();
  });
  document.getElementById('archive-config-close')?.addEventListener('click', () => {
    state.archiveConfigOpen = false;
    renderArchivePanel();
  });
  document.getElementById('archive-config-save')?.addEventListener('click', () => {
    runArchiveAction(async () => {
      const next = readArchiveConfigFields();
      if (next.enabled) await ensureWebDavCorsSupport(next);
      saveWebDavConfig(next);
      state.archiveConfigOpen = false;
      renderArchivePanel();
    });
  });
  document.getElementById('archive-webdav-test')?.addEventListener('click', () => runArchiveAction(() => testWebDavConnection()));
  document.getElementById('archive-webdav-sync')?.addEventListener('click', () => runArchiveAction(() => syncWebDavNow()));
  document.getElementById('archive-config-test')?.addEventListener('click', () => {
    saveWebDavConfig(readArchiveConfigFields());
    runArchiveAction(() => testWebDavConnection());
  });
  document.getElementById('archive-config-sync')?.addEventListener('click', () => {
    saveWebDavConfig(readArchiveConfigFields());
    runArchiveAction(() => syncWebDavNow());
  });
  document.getElementById('archive-conflict-local')?.addEventListener('click', () => runArchiveAction(async () => {
    await resolveArchiveConflict('local');
    state.archiveConflict = null;
    renderArchiveConflict();
  }));
  document.getElementById('archive-conflict-remote')?.addEventListener('click', () => runArchiveAction(async () => {
    await resolveArchiveConflict('remote');
    state.archiveConflict = null;
    renderArchiveConflict();
  }));
  renderArchivePanel();
}

async function runArchiveAction(action) {
  setArchiveButtonsDisabled(true);
  try {
    await action();
    renderArchivePanel();
  } catch (error) {
    console.warn('[archive] action failed', error);
    state.archiveProgress = {
      phase: 'error',
      label: error?.message || '存档操作失败',
      progress: 0
    };
    renderArchiveProgress();
  } finally {
    setArchiveButtonsDisabled(false);
    renderArchivePanel();
  }
}

function readArchiveConfigFields() {
  return {
    enabled: document.getElementById('archive-config-enabled')?.checked === true,
    url: document.getElementById('archive-config-url')?.value || '',
    path: document.getElementById('archive-config-path')?.value || '',
    username: document.getElementById('archive-config-username')?.value || '',
    password: document.getElementById('archive-config-password')?.value || '',
    intervalMinutes: Number(document.getElementById('archive-config-interval')?.value) || 30
  };
}

function syncArchiveConfigFields() {
  const config = getWebDavConfig();
  setChecked('archive-config-enabled', config.enabled);
  setValue('archive-config-url', config.url);
  setValue('archive-config-path', config.path);
  setValue('archive-config-username', config.username);
  setValue('archive-config-password', config.password);
  setValue('archive-config-interval', config.intervalMinutes);
}

async function renderArchivePanel() {
  const panel = document.getElementById('archive-panel');
  if (!panel) return;
  try {
    const stats = await getArchiveStats();
    setText('archive-sync-state', stats.connected ? '已连接' : '未连接');
    setText('archive-sync-detail', stats.statusText || (stats.connected ? 'WebDAV 同步可用' : '尚未配置 WebDAV'));
    setText('archive-last-backup', formatArchiveDate(stats.lastBackupAt));
    setText('archive-backup-size', stats.lastBackupSize ? formatArchiveSize(stats.lastBackupSize) : '无本地备份');
    setText('archive-backup-count', String(stats.backupCount || 0));
    setText('archive-local-size', formatArchiveSize(stats.localSize));
    setText('archive-webdav-url', stats.serverUrl || '未配置');
    setText('archive-webdav-user', stats.username || '未配置');
    setText('archive-webdav-path', stats.remotePath || '/fritia-online-chat');
    setText('archive-webdav-interval', `每 ${stats.intervalMinutes || 30} 分钟`);
    setText('archive-last-sync', formatArchiveDate(stats.lastSyncAt));
    setText('archive-local-size-inline', formatArchiveSize(stats.localSize));
    setChecked('archive-webdav-enabled', stats.connected);
    document.getElementById('archive-sync-state')?.classList.toggle('is-connected', stats.connected);
  } catch (error) {
    console.warn('[archive] render failed', error);
  }
  document.getElementById('archive-config-popover')?.classList.toggle('hidden', !state.archiveConfigOpen);
  if (state.archiveConfigOpen) syncArchiveConfigFields();
  renderArchiveProgress();
  renderArchiveConflict();
}

function renderArchiveProgress() {
  const progress = state.archiveProgress || {};
  const percent = `${Math.round((Number(progress.progress) || 0) * 100)}%`;
  setText('archive-progress-label', progress.label || '等待操作');
  setText('archive-config-progress-label', progress.label || '等待操作');
  document.getElementById('archive-progress-fill')?.style.setProperty('--progress', percent);
  document.getElementById('archive-config-progress-fill')?.style.setProperty('--progress', percent);
  document.getElementById('archive-progress')?.classList.toggle('is-error', progress.phase === 'error');
  document.getElementById('archive-config-progress')?.classList.toggle('is-error', progress.phase === 'error');
}

function renderArchiveConflict() {
  const overlay = document.getElementById('archive-conflict-overlay');
  if (!overlay) return;
  overlay.classList.toggle('hidden', !state.archiveConflict);
  if (!state.archiveConflict) return;
  setText('archive-conflict-local-time', formatArchiveDate(state.archiveConflict.local?.updatedAt));
  setText('archive-conflict-local-size', formatArchiveSize(state.archiveConflict.local?.size));
  setText('archive-conflict-remote-time', formatArchiveDate(state.archiveConflict.remote?.updatedAt));
  setText('archive-conflict-remote-size', formatArchiveSize(state.archiveConflict.remote?.size));
}

function setArchiveButtonsDisabled(disabled) {
  document.querySelectorAll('[data-archive-action]').forEach(button => {
    button.disabled = disabled;
  });
}

function bindToolCallPanel() {
  document.querySelectorAll('[data-tool-section]').forEach(button => {
    button.addEventListener('click', () => showToolSection(button.dataset.toolSection));
  });
  document.querySelectorAll('[data-mcp-transport]').forEach(button => {
    button.addEventListener('click', () => {
      if (isPureFrontendToolRuntime() && button.dataset.mcpTransport === MCP_TRANSPORTS.STDIO) return;
      state.mcpTransport = button.dataset.mcpTransport === MCP_TRANSPORTS.STDIO
        ? MCP_TRANSPORTS.STDIO
        : MCP_TRANSPORTS.STREAMABLE_HTTP;
      state.selectedMcpClientId = '';
      renderToolCallPanel();
    });
  });
  document.getElementById('mcp-client-add')?.addEventListener('click', () => {
    const client = createDefaultMcpClient(state.mcpTransport);
    state.selectedMcpClientId = client.id;
    upsertMcpClient(client);
  });
  document.getElementById('mcp-client-save')?.addEventListener('click', saveSelectedMcpClientFromForm);
  document.getElementById('mcp-client-enabled')?.addEventListener('change', toggleSelectedMcpClientEnabled);
  document.getElementById('mcp-client-delete')?.addEventListener('click', () => {
    if (!state.selectedMcpClientId) return;
    const current = getMcpConfig().clients.find(client => client.id === state.selectedMcpClientId);
    if (current?.builtin) return;
    deleteMcpClient(state.selectedMcpClientId);
    state.selectedMcpClientId = '';
    renderToolCallPanel();
  });
  document.getElementById('mcp-client-name')?.addEventListener('input', updateMcpClientDraftHeader);
  document.getElementById('mcp-client-json')?.addEventListener('input', updateMcpClientDraftHeader);
  document.getElementById('webmcp-server-save')?.addEventListener('click', saveWebMcpServerFromForm);
  document.getElementById('mcp-permission-save')?.addEventListener('click', saveMcpPermissionsFromForm);
  document.getElementById('mcp-log-clear')?.addEventListener('click', () => {
    clearMcpLogs();
    renderToolCallPanel();
  });
  renderToolCallPanel();
}

function showToolSection(section = 'client') {
  state.toolPanelSection = section;
  document.querySelectorAll('[data-tool-section]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.toolSection === section);
  });
  document.querySelectorAll('[data-tool-view]').forEach(view => {
    view.classList.toggle('is-active', view.dataset.toolView === section);
  });
  renderToolCallPanel();
}

function renderToolCallPanel() {
  const panel = document.getElementById('tool-call-panel');
  if (!panel) return;
  const hideStdio = isPureFrontendToolRuntime();
  if (hideStdio && state.mcpTransport === MCP_TRANSPORTS.STDIO) {
    state.mcpTransport = MCP_TRANSPORTS.STREAMABLE_HTTP;
    state.selectedMcpClientId = '';
  }
  document.querySelectorAll('[data-mcp-transport]').forEach(button => {
    const isStdio = button.dataset.mcpTransport === MCP_TRANSPORTS.STDIO;
    button.classList.toggle('hidden', hideStdio && isStdio);
    button.disabled = hideStdio && isStdio;
    button.classList.toggle('is-active', button.dataset.mcpTransport === state.mcpTransport);
  });
  renderMcpClientEditor();
  renderWebMcpServerPanel();
  renderWebMcpSkills();
  renderMcpPermissionPanel();
  renderMcpLogPanel();
  renderMcpHelpPanel();
}

function renderMcpClientEditor() {
  const config = getMcpConfig();
  if (isPureFrontendToolRuntime() && state.mcpTransport === MCP_TRANSPORTS.STDIO) {
    state.mcpTransport = MCP_TRANSPORTS.STREAMABLE_HTTP;
  }
  const clients = config.clients.filter(client => (
    state.mcpTransport === MCP_TRANSPORTS.STDIO
      ? client.transport === MCP_TRANSPORTS.STDIO
      : client.transport !== MCP_TRANSPORTS.STDIO
  ));
  const list = document.getElementById('mcp-client-list');
  if (!list) return;
  if (!clients.some(client => client.id === state.selectedMcpClientId)) {
    state.selectedMcpClientId = clients[0]?.id || '';
  }
  list.innerHTML = '';
  for (const client of clients) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tool-client-item${client.id === state.selectedMcpClientId ? ' is-active' : ''}`;
    button.innerHTML = `
      <img src="src/_logo/icons/${mcpTransportIconName(client.transport)}.svg" alt="">
      <span><strong>${escapeHtml(client.name)}</strong><small>${escapeHtml(clientSubtitle(client))}</small></span>
      <em>${client.enabled ? 'ON' : 'OFF'}</em>
    `;
    button.addEventListener('click', () => {
      state.selectedMcpClientId = client.id;
      renderToolCallPanel();
    });
    list.appendChild(button);
  }
  if (!clients.length) {
    list.innerHTML = '<div class="tool-empty">当前传输类型还没有 MCP 服务。</div>';
  }
  const selected = clients.find(client => client.id === state.selectedMcpClientId) || null;
  syncMcpClientForm(selected);
}

function syncMcpClientForm(client) {
  const disabled = !client;
  const builtin = Boolean(client?.builtin);
  ['mcp-client-name', 'mcp-client-enabled', 'mcp-client-json', 'mcp-client-save', 'mcp-client-delete'].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.disabled = disabled;
  });
  ['mcp-client-name', 'mcp-client-json', 'mcp-client-save'].forEach(id => {
    const element = document.getElementById(id);
    if (element && builtin) element.disabled = true;
  });
  const deleteButton = document.getElementById('mcp-client-delete');
  if (deleteButton) deleteButton.disabled = disabled || builtin;
  setValue('mcp-client-name', client?.name || '');
  setChecked('mcp-client-enabled', client?.enabled);
  const json = client
    ? (client.configJson || (client.transport === MCP_TRANSPORTS.STDIO
      ? formatMcpServerConfigJson(client.config, client.transport, client.name)
      : ''))
    : '';
  setValue('mcp-client-json', json);
  setText('mcp-client-title', client?.name || '未选择服务');
  setText('mcp-client-subtitle', client ? clientSubtitle(client) : '点击新增创建 MCP 客户端');
  setText('mcp-client-json-status', client
    ? (builtin ? '内置 Filesystem MCP 客户端会随工具模式自动激活。' : '填写 JSON 后点击保存。')
    : '没有可编辑的 MCP 服务。');
  const icon = document.getElementById('mcp-client-editor-icon');
  if (icon) icon.src = `src/_logo/icons/${mcpTransportIconName(client?.transport)}.svg`;
}

function toggleSelectedMcpClientEnabled(event) {
  const config = getMcpConfig();
  const current = config.clients.find(client => client.id === state.selectedMcpClientId);
  if (!current) return;
  const enabled = event.target.checked === true;
  upsertMcpClient({ ...current, enabled });
  renderMcpPicker();
  renderMcpClientEditor();
}

function updateMcpClientDraftHeader() {
  const name = document.getElementById('mcp-client-name')?.value.trim() || 'MCP 服务';
  const rawJson = document.getElementById('mcp-client-json')?.value || '';
  setText('mcp-client-title', name);
  if (!rawJson.trim()) {
    setText('mcp-client-subtitle', '服务器配置 JSON');
    setText('mcp-client-json-status', '服务器配置 JSON 为空，保存后该客户端不会执行。');
    return;
  }
  try {
    const config = parseMcpServerConfigJson(rawJson, state.mcpTransport);
    setText('mcp-client-subtitle', config.url || config.command || '服务器配置 JSON');
    setText('mcp-client-json-status', 'JSON 格式有效，保存后会保留当前原文。');
  } catch (error) {
    setText('mcp-client-subtitle', '服务器配置 JSON');
    setText('mcp-client-json-status', error?.message || 'JSON 格式无效。');
  }
}

function saveSelectedMcpClientFromForm() {
  const config = getMcpConfig();
  const current = config.clients.find(client => client.id === state.selectedMcpClientId);
  if (!current) return;
  try {
    const rawJson = (document.getElementById('mcp-client-json')?.value || '').trim();
    const serverConfig = rawJson
      ? parseMcpServerConfigJson(rawJson, state.mcpTransport)
      : createBlankMcpClientConfig(state.mcpTransport);
    const name = document.getElementById('mcp-client-name')?.value.trim() || serverConfig.name || current.name;
    const saved = upsertMcpClient({
      ...current,
      name,
      enabled: document.getElementById('mcp-client-enabled')?.checked === true,
      transport: serverConfig.transport || state.mcpTransport,
      config: serverConfig,
      configJson: rawJson
    });
    state.mcpTransport = serverConfig.transport === MCP_TRANSPORTS.STDIO
      ? MCP_TRANSPORTS.STDIO
      : MCP_TRANSPORTS.STREAMABLE_HTTP;
    state.selectedMcpClientId = current.id;
    setText('mcp-client-json-status', '配置已保存，服务器配置 JSON 原文已保留。');
    renderMcpPicker();
    return saved;
  } catch (error) {
    setText('mcp-client-json-status', error?.message || '配置保存失败。');
    return null;
  }
}

function createBlankMcpClientConfig(transport) {
  if (transport === MCP_TRANSPORTS.STDIO) {
    return {
      transport: MCP_TRANSPORTS.STDIO,
      command: '',
      args: [],
      env: {},
      cwd: '',
      relayUrl: 'http://127.0.0.1:17373/mcp',
      timeout: 30
    };
  }
  return {
    transport: transport === MCP_TRANSPORTS.SSE ? MCP_TRANSPORTS.SSE : MCP_TRANSPORTS.STREAMABLE_HTTP,
    url: '',
    headers: {},
    timeout: 10,
    sse_read_timeout: 300
  };
}

function bindPluginStore() {
  document.querySelectorAll('[data-plugin-store-section]').forEach(button => {
    button.addEventListener('click', () => showPluginStoreSection(button.dataset.pluginStoreSection));
  });
  document.getElementById('role-plugin-refresh')?.addEventListener('click', () => loadRolePluginCatalog({ force: true }));
  document.getElementById('plugin-store-search')?.addEventListener('input', event => {
    state.pluginStore.search = event.target.value.trim();
    if (pluginStoreSearchTimer) clearTimeout(pluginStoreSearchTimer);
    pluginStoreSearchTimer = setTimeout(() => {
      state.pluginStore.page = 1;
      loadPluginStorePage();
    }, 320);
  });
  document.getElementById('plugin-store-refresh')?.addEventListener('click', () => loadPluginStorePage());
  document.getElementById('plugin-store-prev')?.addEventListener('click', () => {
    if (state.pluginStore.page <= 1) return;
    state.pluginStore.page -= 1;
    loadPluginStorePage();
  });
  document.getElementById('plugin-store-next')?.addEventListener('click', () => {
    const maxPage = Math.max(1, Math.ceil(state.pluginStore.total / state.pluginStore.pageSize));
    if (state.pluginStore.page >= maxPage) return;
    state.pluginStore.page += 1;
    loadPluginStorePage();
  });
  document.getElementById('plugin-source-trigger')?.addEventListener('click', event => {
    event.stopPropagation();
    state.pluginSourceMenuOpen = !state.pluginSourceMenuOpen;
    renderPluginSourceMenu();
  });
  document.getElementById('plugin-source-modelscope')?.addEventListener('click', event => {
    event.stopPropagation();
    closePluginSourceMenu();
    openModelScopeLoginPanel();
  });
  document.getElementById('modelscope-login-open')?.addEventListener('click', async () => {
    if (await openModelScopeDesktopWindow()) return;
    window.open(MODELSCOPE_LOGIN_URL, '_blank', 'noopener');
  });
  document.getElementById('modelscope-login-check')?.addEventListener('click', () => checkModelScopeLoginStatus({ refreshList: true, closeDesktopLogin: true }));
  document.getElementById('plugin-official-open-external')?.addEventListener('click', () => {
    if (state.pluginStore.officialUrl) window.open(state.pluginStore.officialUrl, '_blank', 'noopener');
  });
  document.getElementById('plugin-detail-add')?.addEventListener('click', installSelectedPluginDetail);
  document.addEventListener('click', event => {
    if (!state.pluginSourceMenuOpen) return;
    const menu = document.getElementById('plugin-source-menu');
    const button = document.getElementById('plugin-source-trigger');
    if (menu?.contains(event.target) || button?.contains(event.target)) return;
    closePluginSourceMenu();
  });
  renderPluginStorePanel();
}

function showPluginStoreSection(section = 'mcp') {
  state.pluginStoreSection = section === 'roles' ? 'roles' : 'mcp';
  renderPluginStorePanel();
  if (state.pluginStoreSection === 'roles' && !state.rolePluginStore.loaded && !state.rolePluginStore.loading) {
    loadRolePluginCatalog();
  }
  if (state.pluginStoreSection === 'mcp' && !state.pluginStore.items.length && !state.pluginStore.loading) {
    checkModelScopeLoginStatus();
    loadPluginStorePage();
  }
}

function renderPluginStorePanel() {
  document.querySelectorAll('[data-plugin-store-section]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.pluginStoreSection === state.pluginStoreSection);
  });
  document.querySelectorAll('[data-plugin-store-view]').forEach(view => {
    view.classList.toggle('is-active', view.dataset.pluginStoreView === state.pluginStoreSection);
  });
  const search = document.getElementById('plugin-store-search');
  if (search && document.activeElement !== search) search.value = state.pluginStore.search;
  renderPluginSourceMenu();
  renderRolePluginStoreGrid();
  renderPluginStoreGrid();
  renderPluginStorePagination();
}

async function loadRolePluginCatalog(options = {}) {
  if (state.rolePluginStore.loading || (state.rolePluginStore.loaded && !options.force)) return;
  const requestId = Date.now();
  state.rolePluginStore.requestId = requestId;
  state.rolePluginStore.loading = true;
  state.rolePluginStore.error = '';
  if (options.force) state.rolePluginStore.installStatus = '';
  renderRolePluginStoreGrid();
  try {
    const response = await fetch(withRolePluginToken(ROLE_PLUGIN_CATALOG_URL), { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (state.rolePluginStore.requestId !== requestId) return;
    state.rolePluginStore.items = normalizeRolePluginCatalog(payload);
    state.rolePluginStore.loaded = true;
  } catch (error) {
    if (state.rolePluginStore.requestId !== requestId) return;
    state.rolePluginStore.items = [];
    state.rolePluginStore.loaded = false;
    state.rolePluginStore.error = `角色插件加载失败：${error?.message || '未知错误'}`;
  } finally {
    if (state.rolePluginStore.requestId === requestId) {
      state.rolePluginStore.loading = false;
      renderRolePluginStoreGrid();
    }
  }
}

function normalizeRolePluginCatalog(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('角色插件目录格式无效。');
  }
  return Object.entries(payload).map(([key, raw], index) => {
    const source = raw && typeof raw === 'object' ? raw : {};
    const name = String(source.name || key).trim();
    if (!name) return null;
    return {
      key: String(key || '').trim(),
      name,
      description: String(source.description || '').trim(),
      promptFile: String(source.prompt || '').trim(),
      profileFile: String(source.profile || '').trim(),
      voiceFile: String(source.voice || '').trim(),
      dialogSampleFile: String(source.dialog_sample || '').trim(),
      index
    };
  }).filter(item => item?.key);
}

function renderRolePluginStoreGrid() {
  const grid = document.getElementById('role-plugin-grid');
  if (!grid) return;
  const refresh = document.getElementById('role-plugin-refresh');
  const loading = state.rolePluginStore.loading;
  const installing = Boolean(state.rolePluginStore.installingId);
  if (refresh) refresh.disabled = loading || installing;
  if (loading) {
    setText('role-plugin-status', '正在下载并解析角色插件目录...');
    grid.innerHTML = Array.from({ length: 6 }, () => '<article class="plugin-card role-plugin-card is-skeleton"></article>').join('');
    return;
  }
  if (state.rolePluginStore.error) {
    setText('role-plugin-status', state.rolePluginStore.error);
    grid.innerHTML = `
      <div class="plugin-store-empty plugin-store-error">
        <img src="src/_logo/icons/circle-alert.svg" alt="">
        <strong>无法读取角色插件</strong>
      </div>
    `;
    return;
  }
  if (!state.rolePluginStore.loaded) {
    setText('role-plugin-status', '打开插件商店后会自动加载角色插件。');
    grid.innerHTML = `
      <div class="plugin-store-empty">
        <img src="${ROLE_PLUGIN_CARD_ICON}" alt="">
        <strong>等待加载角色插件</strong>
      </div>
    `;
    return;
  }
  const items = getSortedRolePluginItems();
  const installableCount = items.filter(item => !item.installed).length;
  setText(
    'role-plugin-status',
    state.rolePluginStore.installStatus || (items.length
      ? `共 ${items.length} 个角色插件，${installableCount} 个可安装。`
      : '暂无可显示的角色插件。')
  );
  if (!items.length) {
    grid.innerHTML = '<div class="plugin-store-empty"><img src="src/_logo/icons/search.svg" alt=""><strong>没有找到角色插件</strong></div>';
    return;
  }
  grid.innerHTML = items.map(createRolePluginCardHtml).join('');
  grid.querySelectorAll('[data-role-plugin-install]').forEach(button => {
    button.addEventListener('click', () => installRolePlugin(button.dataset.rolePluginInstall));
  });
}

function getSortedRolePluginItems() {
  const existingNames = getExistingCharacterNameSet();
  return state.rolePluginStore.items
    .map(item => ({ ...item, installed: existingNames.has(normalizeRolePluginName(item.name)) }))
    .sort((left, right) => Number(left.installed) - Number(right.installed) || left.index - right.index);
}

function createRolePluginCardHtml(item) {
  const installing = state.rolePluginStore.installingId === item.key;
  const disabled = item.installed || installing || Boolean(state.rolePluginStore.installingId);
  const label = installing ? '安装中' : (item.installed ? '已安装' : '安装');
  return `
    <article class="plugin-card role-plugin-card${item.installed ? ' is-installed' : ''}${installing ? ' is-installing' : ''}">
      <header>
        <img src="${ROLE_PLUGIN_CARD_ICON}" alt="">
        <div class="role-plugin-card-main">
          <strong>${escapeHtml(item.name)}</strong>
        </div>
        <button class="btn btn-primary role-plugin-install-btn" type="button" data-role-plugin-install="${escapeHtml(item.key)}" aria-label="${escapeHtml(label)} ${escapeHtml(item.name)}" title="${escapeHtml(label)}" ${disabled ? 'disabled' : ''}>
          <img src="src/_logo/icons/download.svg" alt="">
          <span>${escapeHtml(label)}</span>
        </button>
      </header>
      <p>${escapeHtml(item.description || '暂无角色简介。')}</p>
    </article>
  `;
}

async function installRolePlugin(key) {
  if (state.rolePluginStore.installingId) return;
  const item = state.rolePluginStore.items.find(candidate => candidate.key === key);
  if (!item) return;
  if (hasCharacterWithName(item.name)) {
    state.rolePluginStore.installStatus = `${item.name} 已存在，不能重复安装。`;
    renderRolePluginStoreGrid();
    return;
  }
  state.rolePluginStore.installingId = item.key;
  state.rolePluginStore.installStatus = `正在下载 ${item.name} 的人格设定...`;
  renderRolePluginStoreGrid();
  try {
    const prompt = item.promptFile ? await fetchRolePluginText(item, item.promptFile, '人格设定') : '';
    let profileBlob = null;
    if (item.profileFile) {
      state.rolePluginStore.installStatus = `正在下载 ${item.name} 的头像...`;
      renderRolePluginStoreGrid();
      profileBlob = await fetchRolePluginBlob(item, item.profileFile, '头像');
    }
    let voiceBlob = null;
    if (item.voiceFile) {
      state.rolePluginStore.installStatus = `正在下载 ${item.name} 的参考语音...`;
      renderRolePluginStoreGrid();
      voiceBlob = await fetchRolePluginBlob(item, item.voiceFile, '参考语音');
    }
    let examples = '';
    if (item.dialogSampleFile) {
      state.rolePluginStore.installStatus = `正在下载 ${item.name} 的示例对话...`;
      renderRolePluginStoreGrid();
      examples = await fetchRolePluginText(item, item.dialogSampleFile, '示例对话');
    }
    if (hasCharacterWithName(item.name)) {
      state.rolePluginStore.installStatus = `${item.name} 已存在，不能重复安装。`;
      return;
    }
    state.rolePluginStore.installStatus = `正在保存 ${item.name} 到本地存档...`;
    renderRolePluginStoreGrid();
    const avatarMedia = profileBlob
      ? await saveBlobAsMedia(profileBlob.blob, {
        category: 'avatar',
        prefix: 'avatar',
        name: item.profileFile,
        mime: profileBlob.mime,
        size: profileBlob.blob.size
      })
      : null;
    const voiceMedia = voiceBlob
      ? await saveBlobAsMedia(voiceBlob.blob, {
        category: 'voice',
        prefix: 'voice',
        name: item.voiceFile,
        mime: voiceBlob.mime,
        size: voiceBlob.blob.size
      })
      : null;
    const character = normalizeCharacterRecord({
      id: createRolePluginCharacterId(item),
      name: item.name,
      description: item.description,
      prompt,
      examples,
      avatar: avatarMedia ? avatarMedia.ref : 'src/_logo/emoji/robot_3d.png',
      voiceSample: voiceMedia ? voiceMedia.ref : '',
      source: 'custom',
      tags: ['插件角色'],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    if (!character) throw new Error('角色数据无效。');
    const next = upsertCharacter(state.store, character);
    ensurePrivateConversation(next, character);
    updateStore(loadAppStore());
    state.rolePluginStore.installStatus = `${item.name} 已安装到角色列表。`;
  } catch (error) {
    state.rolePluginStore.installStatus = `${item.name} 安装失败：${error?.message || '未知错误'}`;
  } finally {
    state.rolePluginStore.installingId = '';
    renderRolePluginStoreGrid();
  }
}

async function fetchRolePluginText(item, fileName, label) {
  const response = await fetch(buildRolePluginResourceUrl(item.key, fileName), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${label}下载失败：HTTP ${response.status}`);
  return response.text();
}

async function fetchRolePluginBlob(item, fileName, label) {
  const response = await fetch(buildRolePluginResourceUrl(item.key, fileName), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${label}下载失败：HTTP ${response.status}`);
  const blob = await response.blob();
  return {
    blob,
    mime: response.headers.get('content-type') || blob.type || ''
  };
}

function buildRolePluginResourceUrl(key, fileName) {
  return withRolePluginToken(`${ROLE_PLUGIN_RESOURCE_BASE_URL}/${encodeURIComponent(key)}/${encodeURIComponent(fileName)}`);
}

function withRolePluginToken(url) {
  const separator = String(url).includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(ROLE_PLUGIN_ACCESS_TOKEN)}`;
}

function getExistingCharacterNameSet() {
  return new Set(state.store.characters.map(character => normalizeRolePluginName(character.name)).filter(Boolean));
}

function hasCharacterWithName(name) {
  return getExistingCharacterNameSet().has(normalizeRolePluginName(name));
}

function normalizeRolePluginName(name) {
  return String(name || '').trim().toLocaleLowerCase();
}

function createRolePluginCharacterId(item) {
  const base = String(item.key || item.name || 'remote')
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36) || 'remote';
  return `char_plugin_${base}_${Date.now().toString(36)}`;
}

function renderPluginSourceMenu() {
  const menu = document.getElementById('plugin-source-menu');
  const trigger = document.getElementById('plugin-source-trigger');
  const wrap = document.getElementById('plugin-source-wrap');
  const dot = document.getElementById('modelscope-source-dot');
  menu?.classList.toggle('hidden', !state.pluginSourceMenuOpen);
  trigger?.setAttribute('aria-expanded', String(state.pluginSourceMenuOpen));
  wrap?.classList.toggle('is-open', state.pluginSourceMenuOpen);
  dot?.classList.toggle('is-connected', state.pluginStore.modelScopeConnected);
  const loginStatus = document.getElementById('modelscope-login-status');
  if (loginStatus) {
    loginStatus.textContent = state.pluginStore.loginChecking
      ? '正在检测魔搭登录状态...'
      : (state.pluginStore.modelScopeConnected ? '魔搭社区已连接' : (state.pluginStore.modelScopeMessage || '等待登录检测'));
  }
}

function closePluginSourceMenu() {
  if (!state.pluginSourceMenuOpen) return;
  state.pluginSourceMenuOpen = false;
  renderPluginSourceMenu();
}

async function openModelScopeLoginPanel() {
  if (await openModelScopeDesktopWindow()) {
    state.pluginStore.modelScopeMessage = '已打开魔搭社区窗口，请在窗口中完成登录。';
    renderPluginSourceMenu();
    startModelScopeLoginPoll();
    checkModelScopeLoginStatus({ refreshList: true, closeDesktopLogin: true, quiet: true });
    return;
  }
  const frame = document.getElementById('modelscope-login-frame');
  if (frame && frame.getAttribute('src') !== MODELSCOPE_LOGIN_URL) {
    frame.setAttribute('src', MODELSCOPE_LOGIN_URL);
  }
  openPanel('plugin-source-login-panel');
  checkModelScopeLoginStatus();
}

function getTauriInvoke() {
  return window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke || null;
}

async function openModelScopeDesktopWindow() {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  try {
    await invoke('open_modelscope_window');
    return true;
  } catch (error) {
    console.warn('[plugin-store] failed to open ModelScope desktop window', error);
    return false;
  }
}

async function closeModelScopeDesktopWindow() {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  try {
    await invoke('close_modelscope_window');
    return true;
  } catch (error) {
    console.warn('[plugin-store] failed to close ModelScope desktop window', error);
    return false;
  }
}

async function openModelScopeOfficialDesktopWindow(url, title) {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  try {
    await invoke('open_modelscope_detail_window', { url, title });
    return true;
  } catch (error) {
    console.warn('[plugin-store] failed to open ModelScope official window', error);
    return false;
  }
}

async function openExternalUrl(url) {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      await invoke('open_external_url', { url });
      return true;
    } catch (error) {
      console.warn('[main-menu] failed to open external URL via desktop shell', error);
    }
  }
  window.open(url, '_blank', 'noopener');
  return false;
}

function stopModelScopeLoginPoll() {
  if (modelScopeLoginPollTimer) {
    window.clearTimeout(modelScopeLoginPollTimer);
    modelScopeLoginPollTimer = 0;
  }
  modelScopeLoginPollEndsAt = 0;
}

function startModelScopeLoginPoll() {
  stopModelScopeLoginPoll();
  modelScopeLoginPollEndsAt = Date.now() + MODELSCOPE_LOGIN_POLL_TIMEOUT_MS;
  const tick = async () => {
    modelScopeLoginPollTimer = 0;
    if (Date.now() > modelScopeLoginPollEndsAt || state.pluginStore.modelScopeConnected) return;
    await checkModelScopeLoginStatus({ refreshList: true, closeDesktopLogin: true, quiet: true });
    if (!state.pluginStore.modelScopeConnected && Date.now() <= modelScopeLoginPollEndsAt) {
      modelScopeLoginPollTimer = window.setTimeout(tick, MODELSCOPE_LOGIN_POLL_INTERVAL_MS);
    }
  };
  modelScopeLoginPollTimer = window.setTimeout(tick, MODELSCOPE_LOGIN_POLL_INTERVAL_MS);
}

async function checkModelScopeLoginStatus(options = {}) {
  const quiet = Boolean(options.quiet);
  let shouldRender = !quiet;
  if (!quiet) {
    state.pluginStore.loginChecking = true;
    state.pluginStore.modelScopeMessage = '';
    renderPluginSourceMenu();
    renderPluginStoreGrid();
  }
  try {
    const result = await checkModelScopeLogin();
    state.pluginStore.modelScopeConnected = result.connected;
    if (result.connected || !quiet) {
      state.pluginStore.modelScopeMessage = result.connected ? '魔搭社区已连接' : (result.message || '尚未检测到魔搭登录态');
      shouldRender = true;
    }
    if (result.connected && options.refreshList) {
      stopModelScopeLoginPoll();
      closePanel('plugin-source-login-panel');
      if (options.closeDesktopLogin) closeModelScopeDesktopWindow();
      await loadPluginStorePage();
    }
  } catch (error) {
    if (!quiet) {
      state.pluginStore.modelScopeConnected = false;
      state.pluginStore.modelScopeMessage = error?.message || '登录状态检测失败。';
    }
  } finally {
    if (!quiet) state.pluginStore.loginChecking = false;
    if (shouldRender) {
      renderPluginSourceMenu();
      renderPluginStoreGrid();
    }
  }
}

async function loadPluginStorePage() {
  const requestId = Date.now();
  state.pluginStore.requestId = requestId;
  state.pluginStore.loading = true;
  state.pluginStore.error = '';
  renderPluginStoreGrid();
  try {
    const result = await fetchHostedModelScopeMcps({
      page: state.pluginStore.page,
      pageSize: state.pluginStore.pageSize,
      query: state.pluginStore.search
    });
    if (state.pluginStore.requestId !== requestId) return;
    state.pluginStore.items = result.items;
    state.pluginStore.total = result.total;
  } catch (error) {
    if (state.pluginStore.requestId !== requestId) return;
    state.pluginStore.items = [];
    state.pluginStore.total = 0;
    state.pluginStore.error = error?.message || 'MCP 插件加载失败。';
  } finally {
    if (state.pluginStore.requestId === requestId) {
      state.pluginStore.loading = false;
      renderPluginStorePanel();
    }
  }
}

function renderPluginStoreGrid() {
  const status = document.getElementById('plugin-store-status');
  const grid = document.getElementById('plugin-store-grid');
  if (!grid) return;
  if (state.pluginStore.loading) {
    setText('plugin-store-status', '正在刷新魔搭社区 hosted MCP。');
    grid.innerHTML = Array.from({ length: 6 }, () => '<article class="plugin-card is-skeleton"></article>').join('');
    return;
  }
  if (state.pluginStore.error) {
    setText('plugin-store-status', state.pluginStore.error);
    const errorTitle = isPureFrontendToolRuntime()
      ? '网页版无法直接安装插件，请使用 APP 或点击下方按钮手动配置'
      : '无法读取魔搭 MCP 列表';
    grid.innerHTML = `
      <div class="plugin-store-empty plugin-store-error">
        <img src="src/_logo/icons/circle-alert.svg" alt="">
        <strong>${escapeHtml(errorTitle)}</strong>
        <button class="btn btn-soft" type="button" data-modelscope-open-official>
          <img src="src/_logo/icons/monitor-up.svg" alt="">
          <span>打开魔搭 MCP</span>
        </button>
      </div>
    `;
    grid.querySelector('[data-modelscope-open-official]')?.addEventListener('click', () => {
      window.open(MODELSCOPE_MCP_PAGE_URL, '_blank', 'noopener');
    });
    return;
  }
  const total = state.pluginStore.total || state.pluginStore.items.length;
  setText('plugin-store-status', total ? `共 ${total} 个 hosted MCP，可搜索或翻页查看。` : '暂无 hosted MCP 插件。');
  if (!state.pluginStore.items.length) {
    grid.innerHTML = '<div class="plugin-store-empty"><img src="src/_logo/icons/search.svg" alt=""><strong>没有找到 MCP 插件</strong></div>';
    return;
  }
  grid.innerHTML = state.pluginStore.items.map(item => createPluginCardHtml(item)).join('');
  grid.querySelectorAll('[data-plugin-mcp-id]').forEach(card => {
    card.addEventListener('click', () => openPluginDetailById(card.dataset.pluginMcpId));
    card.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openPluginDetailById(card.dataset.pluginMcpId);
    });
  });
  grid.querySelectorAll('[data-plugin-install-id]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      openPluginDetailById(button.dataset.pluginInstallId);
    });
  });
  if (status && state.pluginStore.loginChecking) status.textContent = '正在检测魔搭登录状态...';
}

function createPluginCardHtml(item) {
  const tags = (item.tags?.length ? item.tags : ['Hosted', 'Remote']).slice(0, 2);
  return `
    <article class="plugin-card" data-plugin-mcp-id="${escapeHtml(item.id)}" tabindex="0" role="button">
      <header>
        <img src="${escapeHtml(item.icon)}" alt="">
        <strong>${escapeHtml(item.displayName)}</strong>
        <button class="plugin-card-more" type="button" aria-label="更多">
          <span aria-hidden="true">⋮</span>
        </button>
      </header>
      <p>${escapeHtml(compactText(item.description || '魔搭社区 Hosted MCP 服务', 96))}</p>
      <small>${escapeHtml(item.owner || 'modelscope')}</small>
      <footer>
        <span>${tags.map(tag => `<em>${escapeHtml(tag)}</em>`).join('')}</span>
        <button class="btn btn-primary plugin-install-btn" type="button" data-plugin-install-id="${escapeHtml(item.id)}">安装</button>
      </footer>
    </article>
  `;
}

function renderPluginStorePagination() {
  const prev = document.getElementById('plugin-store-prev');
  const next = document.getElementById('plugin-store-next');
  const pages = document.getElementById('plugin-store-pages');
  const maxPage = Math.max(1, Math.ceil(state.pluginStore.total / state.pluginStore.pageSize));
  if (prev) prev.disabled = state.pluginStore.loading || state.pluginStore.page <= 1;
  if (next) next.disabled = state.pluginStore.loading || state.pluginStore.page >= maxPage;
  if (!pages) return;
  const pageItems = buildPluginPageItems(state.pluginStore.page, maxPage);
  pages.innerHTML = pageItems.map(item => {
    if (item === '...') return '<span>...</span>';
    return `<button class="${item === state.pluginStore.page ? 'is-active' : ''}" type="button" data-plugin-page="${item}">${item}</button>`;
  }).join('');
  pages.querySelectorAll('[data-plugin-page]').forEach(button => {
    button.addEventListener('click', () => {
      const page = Number(button.dataset.pluginPage) || 1;
      if (page === state.pluginStore.page) return;
      state.pluginStore.page = page;
      loadPluginStorePage();
    });
  });
}

function buildPluginPageItems(current, maxPage) {
  if (maxPage <= 7) return Array.from({ length: maxPage }, (_, index) => index + 1);
  const items = [1];
  if (current > 4) items.push('...');
  const start = Math.max(2, current - 1);
  const end = Math.min(maxPage - 1, current + 1);
  for (let page = start; page <= end; page += 1) items.push(page);
  if (current < maxPage - 3) items.push('...');
  items.push(maxPage);
  return items;
}

function openPluginDetailById(id) {
  const item = state.pluginStore.items.find(server => server.id === id);
  if (!item) return;
  openPluginDetail(item);
}

async function openPluginDetail(server) {
  state.pluginStore.detail = normalizeModelScopeMcp(server);
  state.pluginStore.detailLoading = true;
  state.pluginStore.detailError = '';
  state.pluginStore.installStatus = '';
  openPanel('plugin-detail-panel');
  renderPluginDetail();
  try {
    state.pluginStore.detail = await fetchModelScopeMcpDetail(server);
  } catch (error) {
    state.pluginStore.detailError = error?.message || '插件详情加载失败。';
  } finally {
    state.pluginStore.detailLoading = false;
    renderPluginDetail();
  }
}

function renderPluginDetail() {
  const container = document.getElementById('plugin-detail-content');
  const addButton = document.getElementById('plugin-detail-add');
  if (!container) return;
  const detail = state.pluginStore.detail;
  setText('plugin-detail-install-status', state.pluginStore.installStatus);
  if (addButton) addButton.disabled = state.pluginStore.installing || !detail;
  if (!detail) {
    container.innerHTML = '<div class="plugin-store-empty">未选择插件。</div>';
    return;
  }
  const fields = Array.isArray(detail.serviceFields) ? detail.serviceFields : [];
  const loading = state.pluginStore.detailLoading ? '<span class="status-pill">正在加载详情</span>' : '';
  const error = state.pluginStore.detailError ? `<div class="plugin-detail-error">${escapeHtml(state.pluginStore.detailError)}</div>` : '';
  container.innerHTML = `
    <section class="plugin-detail-summary">
      <img src="${escapeHtml(detail.icon)}" alt="">
      <div>
        <h3>${escapeHtml(detail.displayName)}</h3>
        <p>${escapeHtml(detail.description || '魔搭社区 Hosted MCP 服务')}</p>
        <div class="plugin-detail-meta">
          <span>remote</span>
          <span>Streamable HTTP</span>
          ${detail.verified ? '<span>已验证</span>' : ''}
          ${loading}
        </div>
      </div>
      <button class="btn btn-soft" type="button" data-plugin-detail-official>
        <img src="src/_logo/icons/monitor-up.svg" alt="">
        <span>官方详情</span>
      </button>
    </section>
    ${error}
    <section class="plugin-detail-block">
      <h4>介绍</h4>
      <p>${escapeHtml(compactText(detail.readme || detail.description || '暂无介绍。', 720))}</p>
    </section>
    <section class="plugin-detail-block">
      <h4>服务配置</h4>
      <div class="plugin-config-mode"><span>类型</span><strong>remote</strong></div>
      <div class="plugin-config-fields">
        ${fields.length ? fields.map(createPluginConfigFieldHtml).join('') : '<div class="plugin-config-empty">该 MCP 无额外服务配置项。</div>'}
      </div>
    </section>
  `;
  container.querySelector('[data-plugin-detail-official]')?.addEventListener('click', () => {
    openPluginOfficialDetail(detail);
  });
}

async function openPluginOfficialDetail(detail) {
  const url = detail?.detailUrl || '';
  if (!url) return;
  const title = detail?.displayName || '官方详情';
  state.pluginStore.officialUrl = url;
  state.pluginStore.officialTitle = title;
  if (await openModelScopeOfficialDesktopWindow(url, title)) return;
  openPluginOfficialPanel(url, title);
}

function openPluginOfficialPanel(url, title = '官方详情') {
  state.pluginStore.officialUrl = url;
  state.pluginStore.officialTitle = title;
  setText('plugin-official-browser-title', title);
  const frame = document.getElementById('plugin-official-frame');
  if (frame && frame.getAttribute('src') !== url) frame.setAttribute('src', url);
  openPanel('plugin-official-browser-panel');
}

function createPluginConfigFieldHtml(field) {
  const required = field.required ? '<em>必填</em>' : '';
  const scope = field.scope || 'env';
  const configAttrs = `data-modelscope-config-key="${escapeHtml(field.key)}" data-modelscope-config-scope="${escapeHtml(scope)}"`;
  if (field.type === 'boolean') {
    return `
      <label class="plugin-config-row is-checkbox">
        <span><strong>${escapeHtml(field.label)}</strong>${required}<small>${escapeHtml(field.description || field.key)}</small></span>
        <input type="checkbox" ${configAttrs} ${field.defaultValue ? 'checked' : ''}>
      </label>
    `;
  }
  const options = normalizePluginConfigOptions(field);
  if (options.length) {
    return `
      <label class="plugin-config-row">
        <span><strong>${escapeHtml(field.label)}</strong>${required}<small>${escapeHtml(field.description || field.key)}</small></span>
        <select ${configAttrs}>
          ${options.map(option => `<option value="${escapeHtml(option.value)}" ${option.value === String(field.defaultValue ?? '') ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
        </select>
      </label>
    `;
  }
  return `
    <label class="plugin-config-row">
      <span><strong>${escapeHtml(field.label)}</strong>${required}<small>${escapeHtml(field.description || field.key)}</small></span>
      <input type="${field.type === 'number' ? 'number' : 'text'}" ${configAttrs} placeholder="${escapeHtml(field.placeholder)}" value="${escapeHtml(field.defaultValue ?? '')}">
    </label>
  `;
}

function normalizePluginConfigOptions(field) {
  const source = Array.isArray(field.options) && field.options.length ? field.options : (Array.isArray(field.enum) ? field.enum : []);
  return source.map(option => {
    if (option && typeof option === 'object') {
      return {
        value: String(option.value ?? option.label ?? ''),
        label: String(option.label ?? option.value ?? '')
      };
    }
    return { value: String(option), label: String(option) };
  }).filter(option => option.value);
}

async function installSelectedPluginDetail() {
  const detail = state.pluginStore.detail;
  if (!detail || state.pluginStore.installing) return;
  state.pluginStore.installing = true;
  state.pluginStore.installStatus = '正在连接魔搭社区...';
  renderPluginDetail();
  try {
    const values = readPluginServiceConfig();
    let deployResult;
    try {
      deployResult = await deployModelScopeMcp(detail, values.environmentVariables, values.options);
    } catch (error) {
      if (!detail.deployedUrl) throw error;
      deployResult = { url: detail.deployedUrl, transportType: values.options.transportType || detail.deployedUrlTransportType || 'streamable_http' };
    }
    const configJson = buildModelScopeMcpConfig(detail, deployResult, values.options);
    await copyTextToClipboard(configJson);
    const parsedConfig = parseMcpServerConfigJson(configJson, MCP_TRANSPORTS.STREAMABLE_HTTP);
    const timestamp = Date.now();
    const clientId = createId('modelscope');
    upsertMcpClient({
      id: clientId,
      name: detail.displayName,
      enabled: true,
      transport: MCP_TRANSPORTS.STREAMABLE_HTTP,
      permission: 'ask',
      config: parsedConfig,
      configJson,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    state.mcpTransport = MCP_TRANSPORTS.STREAMABLE_HTTP;
    state.selectedMcpClientId = clientId;
    state.pluginStore.installStatus = '已复制 JSON，并添加到 Streamable HTTP MCP 服务列表。';
    renderMcpPicker();
    renderToolCallPanel();
  } catch (error) {
    state.pluginStore.installStatus = error?.message || '添加 MCP 服务失败。';
  } finally {
    state.pluginStore.installing = false;
    renderPluginDetail();
  }
}

function readPluginServiceConfig() {
  const values = {
    environmentVariables: {},
    options: {}
  };
  document.querySelectorAll('[data-modelscope-config-key]').forEach(input => {
    const key = input.dataset.modelscopeConfigKey;
    if (!key) return;
    const scope = input.dataset.modelscopeConfigScope || 'env';
    let value;
    if (input.type === 'checkbox') {
      value = input.checked;
    } else {
      if (input.value === '') return;
      value = input.type === 'number' ? Number(input.value) : input.value;
    }
    if (scope === 'deploy') {
      writePluginDeployOption(values.options, key, value);
      return;
    }
    values.environmentVariables[key] = value;
  });
  return values;
}

function writePluginDeployOption(options, key, value) {
  if (key === '__modelscope_transport_type') {
    options.transportType = String(value || 'streamable_http');
    return;
  }
  if (key === '__modelscope_auth_type') {
    options.authCheck = ['bearer', 'token', 'true'].includes(String(value || '').toLowerCase());
    return;
  }
  if (key === '__modelscope_expiration') {
    const minutes = Number(value);
    options.expirationMinutes = Number.isFinite(minutes) ? minutes : -1;
    return;
  }
  options[key] = value;
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function renderWebMcpServerPanel() {
  const config = getMcpConfig();
  const server = config.webMcpServer || {};
  setChecked('webmcp-server-enabled', server.enabled);
  setChecked('webmcp-server-confirm', server.requireConfirmation);
  setValue('webmcp-server-json', JSON.stringify(server, null, 2));
  const manifest = document.getElementById('webmcp-server-manifest');
  if (manifest) manifest.textContent = JSON.stringify(buildWebMcpManifest(state.store), null, 2);
}

function saveWebMcpServerFromForm() {
  try {
    const raw = JSON.parse(document.getElementById('webmcp-server-json')?.value || '{}');
    saveMcpConfig({
      webMcpServer: {
        ...raw,
        enabled: document.getElementById('webmcp-server-enabled')?.checked === true,
        requireConfirmation: document.getElementById('webmcp-server-confirm')?.checked === true
      }
    });
  } catch (error) {
    window.alert(`WebMCP 服务端配置 JSON 无效：${error?.message || '未知错误'}`);
  }
}

function renderWebMcpSkills() {
  const container = document.getElementById('webmcp-skill-list');
  if (!container) return;
  container.innerHTML = getWebMcpTools().map(tool => `
    <article class="tool-skill-item">
      <img src="src/_logo/icons/tool-skills.svg" alt="">
      <div>
        <strong>${escapeHtml(tool.name)}</strong>
        <p>${escapeHtml(tool.description)}</p>
      </div>
    </article>
  `).join('');
}

function renderMcpPermissionPanel() {
  const permissions = getMcpConfig().permissions;
  setValue('mcp-permission-level', permissions.level);
  setChecked('mcp-permission-manual', permissions.requireManualApproval);
  setChecked('mcp-permission-remote', permissions.allowRemoteHttp);
  setChecked('mcp-permission-stdio', permissions.allowLocalStdio);
  setChecked('mcp-permission-share-character', permissions.shareCharacterProfile);
  setChecked('mcp-permission-share-memory', permissions.shareLongTermMemory);
  setChecked('mcp-permission-isolate-tool-context', permissions.isolateToolContext);
  setChecked('mcp-permission-complete-tool-result', permissions.completeToolResultReply !== false);
  setChecked('mcp-permission-file-write', permissions.requireFileWriteApproval);
}

function saveMcpPermissionsFromForm() {
  saveMcpConfig({
    permissions: {
      level: document.getElementById('mcp-permission-level')?.value || 'ask',
      requireManualApproval: document.getElementById('mcp-permission-manual')?.checked === true,
      allowRemoteHttp: document.getElementById('mcp-permission-remote')?.checked === true,
      allowLocalStdio: document.getElementById('mcp-permission-stdio')?.checked === true,
      shareCharacterProfile: document.getElementById('mcp-permission-share-character')?.checked === true,
      shareLongTermMemory: document.getElementById('mcp-permission-share-memory')?.checked === true,
      isolateToolContext: document.getElementById('mcp-permission-isolate-tool-context')?.checked === true,
      completeToolResultReply: document.getElementById('mcp-permission-complete-tool-result')?.checked !== false,
      requireFileWriteApproval: document.getElementById('mcp-permission-file-write')?.checked === true
    }
  });
  closePanel('tool-call-panel');
}

function renderMcpLogPanel() {
  const config = getMcpConfig();
  const logs = config.logs || [];
  setText('mcp-log-count', `${logs.length} 条日志`);
  const container = document.getElementById('mcp-log-list');
  if (!container) return;
  if (!logs.length) {
    container.innerHTML = '<div class="tool-empty">暂无 MCP 调用日志。</div>';
    return;
  }
  container.innerHTML = logs.map(log => `
    <article class="tool-log-item is-${escapeHtml(log.status)}">
      <header>
        <strong>${escapeHtml(log.toolName || 'MCP')}</strong>
        <span>${escapeHtml(log.source)} · ${formatMessageTime(log.createdAt)}</span>
      </header>
      <dl>
        <div><dt>参数</dt><dd><pre>${escapeHtml(JSON.stringify(log.args || {}, null, 2))}</pre></dd></div>
        <div><dt>结果</dt><dd><pre>${escapeHtml(log.result || '')}</pre></dd></div>
      </dl>
    </article>
  `).join('');
}

async function renderMcpHelpPanel() {
  const container = document.getElementById('mcp-help-content');
  if (!container) return;
  if (state.mcpHelpLoaded) {
    container.innerHTML = state.mcpHelpHtml;
    return;
  }
  container.innerHTML = '<div class="tool-empty">正在加载使用说明。</div>';
  try {
    const response = await fetch('src/docs/mcp_help.md', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const markdown = await response.text();
    state.mcpHelpHtml = renderMarkdownDocument(markdown);
    state.mcpHelpLoaded = true;
    container.innerHTML = state.mcpHelpHtml;
  } catch (error) {
    container.innerHTML = `<div class="tool-empty">使用说明加载失败：${escapeHtml(error?.message || '未知错误')}</div>`;
  }
}

function renderMarkdownDocument(markdown = '') {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const language = fence[1] ? ` data-language="${escapeHtml(fence[1])}"` : '';
      html.push(`<pre${language}><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const mathFence = line.match(/^\$\$\s*$/);
    if (mathFence) {
      const formula = [];
      index += 1;
      while (index < lines.length && !/^\$\$\s*$/.test(lines[index])) {
        formula.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      html.push(renderMarkdownMathBlock(formula.join('\n')));
      continue;
    }
    const singleLineMath = line.match(/^\$\$(.+)\$\$\s*$/);
    if (singleLineMath) {
      html.push(renderMarkdownMathBlock(singleLineMath[1].trim()));
      index += 1;
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const { blockquoteHtml, nextIndex } = renderMarkdownBlockquote(lines, index);
      html.push(blockquoteHtml);
      index = nextIndex;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderMarkdownInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }
    if (isMarkdownTableStart(lines, index)) {
      const { tableHtml, nextIndex } = renderMarkdownTable(lines, index);
      html.push(tableHtml);
      index = nextIndex;
      continue;
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const tag = ordered ? 'ol' : 'ul';
      const items = [];
      const pattern = ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/;
      while (index < lines.length) {
        const item = lines[index].match(pattern);
        if (!item) break;
        items.push(`<li>${renderMarkdownInline(item[1])}</li>`);
        index += 1;
      }
      html.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${renderMarkdownInline(paragraph.join(' '))}</p>`);
  }
  return `<article class="markdown-body">${html.join('')}</article>`;
}

function isMarkdownBlockStart(lines, index) {
  const line = lines[index] || '';
  return /^```/.test(line)
    || /^\$\$/.test(line)
    || /^\s*>\s?/.test(line)
    || /^#{1,6}\s+/.test(line)
    || /^\s*[-*+]\s+/.test(line)
    || /^\s*\d+[.)]\s+/.test(line)
    || isMarkdownTableStart(lines, index);
}

function renderMarkdownBlockquote(lines, startIndex) {
  const quote = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index];
    const quoted = line.match(/^\s*>\s?(.*)$/);
    if (!quoted) break;
    quote.push(quoted[1] || '');
    index += 1;
  }
  const inner = renderMarkdownDocument(quote.join('\n'))
    .replace(/^<article class="markdown-body">/, '')
    .replace(/<\/article>$/, '');
  return { blockquoteHtml: `<blockquote>${inner}</blockquote>`, nextIndex: index };
}

function isMarkdownTableStart(lines, index) {
  const head = lines[index] || '';
  const split = lines[index + 1] || '';
  return head.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(split);
}

function renderMarkdownTable(lines, startIndex) {
  const rows = [];
  let index = startIndex;
  const headers = splitMarkdownTableRow(lines[index]);
  index += 2;
  while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
    rows.push(splitMarkdownTableRow(lines[index]));
    index += 1;
  }
  const headHtml = `<thead><tr>${headers.map(cell => `<th>${renderMarkdownInline(cell)}</th>`).join('')}</tr></thead>`;
  const bodyHtml = `<tbody>${rows.map(row => `<tr>${headers.map((_, cellIndex) => `<td>${renderMarkdownInline(row[cellIndex] || '')}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return { tableHtml: `<div class="markdown-table-wrap"><table>${headHtml}${bodyHtml}</table></div>`, nextIndex: index };
}

function splitMarkdownTableRow(row = '') {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

function renderMarkdownInline(text = '') {
  const tokens = [];
  const remember = html => {
    const token = `\u0000${tokens.length}\u0000`;
    tokens.push(html);
    return token;
  };
  let source = String(text)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => remember(renderMarkdownImage(alt, url)))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => remember(renderMarkdownLink(label, url)))
    .replace(/`([^`]+)`/g, (_, code) => remember(`<code>${escapeHtml(code)}</code>`))
    .replace(/\\\((.+?)\\\)/g, (_, formula) => remember(renderMarkdownInlineMath(formula)))
    .replace(/\$([^$\n]+)\$/g, (_, formula) => remember(renderMarkdownInlineMath(formula)))
    .replace(/(^|[\s(（])((?:https?:\/\/|www\.)[^\s<]+)/gi, (_, prefix, url) => `${prefix}${remember(renderMarkdownAutoLink(url))}`);
  source = escapeHtml(source);
  source = source
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(^|[^\w])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\s][^_]*?)_/g, '$1<em>$2</em>');
  return tokens.reduce((result, html, index) => result.replace(new RegExp(`\\u0000${index}\\u0000`, 'g'), html), source);
}

function normalizeMarkdownUrl(url = '') {
  const clean = String(url).trim().replace(/^<|>$/g, '').split(/\s+/)[0] || '';
  if (/^www\./i.test(clean)) return `https://${clean}`;
  if (/^(https?:|data:image\/|\.{0,2}\/|src\/|\/)/i.test(clean)) return clean;
  return '';
}

function renderMarkdownImage(alt, url) {
  const src = normalizeMarkdownUrl(url);
  if (!src) return escapeHtml(alt || '');
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt || '')}" loading="lazy">`;
}

function renderMarkdownLink(label, url) {
  const href = normalizeMarkdownUrl(url);
  const text = escapeHtml(label || url || '');
  if (!href) return text;
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

function renderMarkdownAutoLink(url = '') {
  let clean = String(url || '').trim();
  let suffix = '';
  while (clean && /[)\]}.。,，!！?？;；:：]$/.test(clean)) {
    suffix = clean.slice(-1) + suffix;
    clean = clean.slice(0, -1);
  }
  return `${renderMarkdownLink(clean, clean)}${escapeHtml(suffix)}`;
}

function renderMarkdownInlineMath(formula = '') {
  return `<span class="markdown-math">${escapeHtml(formula.trim())}</span>`;
}

function renderMarkdownMathBlock(formula = '') {
  return `<div class="markdown-math-block">${escapeHtml(String(formula || '').trim())}</div>`;
}

function clientSubtitle(client) {
  return client?.transport === MCP_TRANSPORTS.STDIO
    ? `${client.config.command || 'stdio'} ${(client.config.args || []).join(' ')}`.trim()
    : client?.config?.url || '';
}

function bindSettings() {
  enhanceCustomSelects();
  document.querySelectorAll('[data-model-tab]').forEach(button => {
    button.addEventListener('click', () => showModelProviderTab(button.dataset.modelTab));
  });
  document.getElementById('model-chat-add')?.addEventListener('click', () => addModelProvider('chat'));
  document.getElementById('model-chat-add-mobile')?.addEventListener('click', () => addModelProvider('chat'));
  document.getElementById('model-tts-add')?.addEventListener('click', () => addModelProvider('tts'));
  document.getElementById('model-tts-add-mobile')?.addEventListener('click', () => addModelProvider('tts'));
  document.getElementById('model-chat-delete')?.addEventListener('click', () => deleteModelProvider('chat'));
  document.getElementById('model-chat-delete-detail')?.addEventListener('click', () => deleteModelProvider('chat'));
  document.getElementById('model-tts-delete')?.addEventListener('click', () => deleteModelProvider('tts'));
  document.getElementById('model-tts-delete-detail')?.addEventListener('click', () => deleteModelProvider('tts'));
  document.getElementById('model-chat-save')?.addEventListener('click', () => saveCurrentModelProvider('chat'));
  document.getElementById('model-tts-save')?.addEventListener('click', () => saveCurrentModelProvider('tts'));
  document.getElementById('model-chat-provider-select')?.addEventListener('change', event => {
    selectModelProvider('chat', event.target.value);
  });
  document.getElementById('model-tts-provider-select')?.addEventListener('change', event => {
    selectModelProvider('tts', event.target.value);
  });
  document.getElementById('tts-provider-speed')?.addEventListener('input', event => {
    setText('tts-provider-speed-value', `${Number(event.target.value || 1).toFixed(2)}x`);
  });
  document.getElementById('chat-provider-id')?.addEventListener('input', () => updateModelDraftHeader('chat'));
  document.getElementById('chat-provider-base-url')?.addEventListener('input', () => updateModelDraftHeader('chat'));
  document.getElementById('tts-provider-id')?.addEventListener('input', () => updateModelDraftHeader('tts'));
  document.getElementById('tts-provider-base-url')?.addEventListener('input', () => updateModelDraftHeader('tts'));
  document.getElementById('settings-save')?.addEventListener('click', () => {
    saveModelSettings({ closeAfterSave: true });
    updateDeepSeekIntimateVisibility();
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
  document.getElementById('chat-provider-model')?.addEventListener('input', updateDeepSeekIntimateVisibility);
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

function bindConversationListResizer() {
  const resizer = document.getElementById('conversation-resizer');
  if (!resizer) return;
  resizer.addEventListener('pointerdown', event => {
    if (!isDesktopLandscapeLayout() || event.button !== 0) return;
    const app = document.getElementById('app');
    if (!app) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = getCurrentConversationListWidth();
    app.classList.add('is-resizing-list');
    resizer.setPointerCapture?.(event.pointerId);

    const handleMove = moveEvent => {
      if (moveEvent.pointerId !== event.pointerId) return;
      const nextWidth = startWidth + moveEvent.clientX - startX;
      setConversationListWidth(nextWidth);
    };
    const handleEnd = endEvent => {
      if (endEvent.pointerId !== event.pointerId) return;
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleEnd);
      document.removeEventListener('pointercancel', handleEnd);
      app.classList.remove('is-resizing-list');
      saveConversationListWidth(getCurrentConversationListWidth());
      resizer.releasePointerCapture?.(event.pointerId);
    };
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleEnd);
    document.addEventListener('pointercancel', handleEnd);
  });
  resizer.addEventListener('keydown', event => {
    if (!isDesktopLandscapeLayout()) return;
    const step = event.shiftKey ? 48 : 16;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const width = setConversationListWidth(getCurrentConversationListWidth() + direction * step);
      saveConversationListWidth(width);
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const bounds = getConversationListWidthBounds();
      const width = setConversationListWidth(event.key === 'Home' ? bounds.min : bounds.max);
      saveConversationListWidth(width);
    }
  });
}

function bindMobileBackGesture() {
  window.addEventListener('pointerdown', event => {
    if (!canStartMobileEdgeSwipe(event.clientX)) return;
    if (!isAllowedMobileBackPointer(event)) return;
    startMobileEdgeSwipe(`pointer:${event.pointerId}`, event.clientX, event.clientY);
  }, { passive: true, capture: true });
  window.addEventListener('pointermove', event => {
    if (!isActiveMobileEdgeSwipe(`pointer:${event.pointerId}`)) return;
    handleMobileBackGestureMove(event.clientX, event.clientY, event);
  }, { passive: false, capture: true });
  window.addEventListener('pointerup', event => {
    handleMobileBackGestureEnd(`pointer:${event.pointerId}`, event.clientX, event.clientY, event);
  }, { passive: false, capture: true });
  window.addEventListener('pointercancel', event => {
    if (!isActiveMobileEdgeSwipe(`pointer:${event.pointerId}`)) return;
    mobileEdgeSwipe = null;
  }, { passive: true, capture: true });

  window.addEventListener('touchstart', event => {
    const touch = event.changedTouches[0];
    if (!touch || !canStartMobileEdgeSwipe(touch.clientX)) return;
    startMobileEdgeSwipe(`touch:${touch.identifier}`, touch.clientX, touch.clientY);
  }, { passive: true, capture: true });
  window.addEventListener('touchmove', event => {
    const touch = findActiveMobileEdgeTouch(event.changedTouches);
    if (!touch) return;
    handleMobileBackGestureMove(touch.clientX, touch.clientY, event);
  }, { passive: false, capture: true });
  window.addEventListener('touchend', event => {
    const touch = findActiveMobileEdgeTouch(event.changedTouches);
    if (!touch) return;
    handleMobileBackGestureEnd(`touch:${touch.identifier}`, touch.clientX, touch.clientY, event);
  }, { passive: false, capture: true });
  window.addEventListener('touchcancel', event => {
    const touch = findActiveMobileEdgeTouch(event.changedTouches);
    if (!touch) return;
    mobileEdgeSwipe = null;
  }, { passive: true, capture: true });
}

function canStartMobileEdgeSwipe(clientX) {
  return isMobilePortraitLayout() && clientX <= MOBILE_EDGE_BACK_START && hasMobileBackDestination() && !mobileEdgeSwipe;
}

function isAllowedMobileBackPointer(event) {
  if (event.pointerType === 'touch' || event.pointerType === 'pen') return true;
  return event.pointerType === 'mouse' && event.button === 0;
}

function startMobileEdgeSwipe(id, startX, startY) {
  mobileEdgeSwipe = { id, startX, startY };
}

function isActiveMobileEdgeSwipe(id) {
  return Boolean(mobileEdgeSwipe && mobileEdgeSwipe.id === id);
}

function findActiveMobileEdgeTouch(touches) {
  if (!mobileEdgeSwipe?.id?.startsWith('touch:')) return null;
  const id = Number(mobileEdgeSwipe.id.slice('touch:'.length));
  return Array.from(touches).find(touch => touch.identifier === id) || null;
}

function handleMobileBackGestureMove(clientX, clientY, event) {
  if (!mobileEdgeSwipe) return;
  const deltaX = clientX - mobileEdgeSwipe.startX;
  const deltaY = Math.abs(clientY - mobileEdgeSwipe.startY);
  if (deltaX < -8 || (deltaY > 58 && deltaY > Math.abs(deltaX) * 1.2)) {
    mobileEdgeSwipe = null;
    return;
  }
  if (deltaX > 14 && deltaX > deltaY) event.preventDefault();
}

function handleMobileBackGestureEnd(id, clientX, clientY, event) {
  if (!isActiveMobileEdgeSwipe(id)) return;
  const deltaX = clientX - mobileEdgeSwipe.startX;
  const deltaY = Math.abs(clientY - mobileEdgeSwipe.startY);
  mobileEdgeSwipe = null;
  if (deltaX < MOBILE_EDGE_BACK_DISTANCE || deltaX < deltaY * 1.35 || deltaY > 90) return;
  event.preventDefault();
  performMobileBackGesture();
}

function scheduleConversationListWidthSync() {
  if (layoutResizeFrame) cancelAnimationFrame(layoutResizeFrame);
  layoutResizeFrame = requestAnimationFrame(() => {
    layoutResizeFrame = 0;
    applyStoredConversationListWidth();
  });
}

function applyStoredConversationListWidth() {
  const stored = readStoredConversationListWidth();
  setConversationListWidth(stored || CONVERSATION_LIST_DEFAULT_WIDTH);
}

function setConversationListWidth(width) {
  const app = document.getElementById('app');
  if (!app) return width;
  const bounds = getConversationListWidthBounds();
  const nextWidth = Math.round(clampNumber(Number(width) || CONVERSATION_LIST_DEFAULT_WIDTH, bounds.min, bounds.max));
  app.style.setProperty('--list-width', `${nextWidth}px`);
  const resizer = document.getElementById('conversation-resizer');
  if (resizer) {
    resizer.setAttribute('aria-valuemin', String(bounds.min));
    resizer.setAttribute('aria-valuemax', String(bounds.max));
    resizer.setAttribute('aria-valuenow', String(nextWidth));
  }
  return nextWidth;
}

function getConversationListWidthBounds() {
  const app = document.getElementById('app');
  const rail = document.querySelector('.rail');
  const resizer = document.getElementById('conversation-resizer');
  const appWidth = app?.getBoundingClientRect().width || window.innerWidth || 0;
  const railWidth = rail?.getBoundingClientRect().width || 0;
  const resizerWidth = isDesktopLandscapeLayout() ? (resizer?.getBoundingClientRect().width || 10) : 0;
  const available = appWidth - railWidth - resizerWidth - CONVERSATION_LIST_MIN_CHAT_WIDTH;
  const max = Math.max(CONVERSATION_LIST_MIN_WIDTH, Math.min(CONVERSATION_LIST_MAX_WIDTH, available));
  return { min: CONVERSATION_LIST_MIN_WIDTH, max: Math.round(max) };
}

function getCurrentConversationListWidth() {
  const list = document.querySelector('.conversation-list');
  const current = list?.getBoundingClientRect().width || readStoredConversationListWidth() || CONVERSATION_LIST_DEFAULT_WIDTH;
  return clampNumber(current, getConversationListWidthBounds().min, getConversationListWidthBounds().max);
}

function readStoredConversationListWidth() {
  try {
    return Number(localStorage.getItem(CONVERSATION_LIST_WIDTH_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveConversationListWidth(width) {
  try {
    localStorage.setItem(CONVERSATION_LIST_WIDTH_KEY, String(Math.round(width)));
  } catch {
    // Browser storage may be unavailable in private contexts.
  }
}

function isDesktopLandscapeLayout() {
  return window.matchMedia(DESKTOP_LANDSCAPE_QUERY).matches;
}

function isMobilePortraitLayout() {
  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
}

function hasMobileBackDestination() {
  const app = document.getElementById('app');
  const groupInfo = document.getElementById('group-info-panel');
  const groupInfoOpen = Boolean(groupInfo && !groupInfo.classList.contains('hidden'));
  return Boolean(getTopOpenModalId() || groupInfoOpen || app?.classList.contains('is-detail-open') || app?.classList.contains('is-chat-open'));
}

function syncMobileBackAvailability() {
  const app = document.getElementById('app');
  app?.classList.toggle('is-mobile-back-available', isMobilePortraitLayout() && hasMobileBackDestination());
}

function performMobileBackGesture() {
  let handled = false;
  const openModalId = getTopOpenModalId();
  if (openModalId) {
    closePanel(openModalId);
    syncMobileBackAvailability();
    handled = true;
    clearMobileTouchActivationState();
    return handled;
  }
  const groupInfo = document.getElementById('group-info-panel');
  if (groupInfo && !groupInfo.classList.contains('hidden')) {
    closeGroupInfoPanel();
    syncMobileBackAvailability();
    handled = true;
    clearMobileTouchActivationState();
    return handled;
  }
  const app = document.getElementById('app');
  if (app?.classList.contains('is-detail-open')) {
    app.classList.remove('is-detail-open');
    syncMobileBackAvailability();
    handled = true;
    clearMobileTouchActivationState();
    return handled;
  }
  if (app?.classList.contains('is-chat-open')) {
    closeMobileChatPage();
    handled = true;
    clearMobileTouchActivationState();
    return handled;
  }
  syncMobileBackAvailability();
  return false;
}

function handleAndroidBackAction() {
  if (closeTransientBackSurface()) {
    syncMobileBackAvailability();
    clearMobileTouchActivationState();
    return true;
  }
  return performMobileBackGesture();
}

function closeTransientBackSurface() {
  if (state.mainMenuOpen) {
    closeMainMenu();
    return true;
  }
  if (state.pluginSourceMenuOpen) {
    closePluginSourceMenu();
    return true;
  }
  if (state.quickCreateMenuOpen) {
    closeQuickCreateMenu();
    return true;
  }
  if (state.mcpPickerOpen) {
    closeMcpPicker();
    return true;
  }
  if (state.stickerPopoverOpen) {
    closeStickerPopover();
    return true;
  }
  if (state.mention.active) {
    closeMentionPicker();
    return true;
  }
  if (state.roundtableErrorPopoverOpen) {
    state.roundtableErrorPopoverOpen = false;
    renderRoundtableErrorIndicator();
    return true;
  }
  if (state.voiceErrorPopoverOpen) {
    state.voiceErrorPopoverOpen = false;
    renderVoiceErrorIndicator();
    return true;
  }
  if (hideOpenElement('#memory-search-results')) return true;
  if (hideOpenElement('#memory-archive-popover')) return true;
  if (hideOpenElement('#memory-settings-popover')) return true;
  if (document.querySelector('.custom-select.is-open')) {
    closeCustomSelects();
    return true;
  }
  return false;
}

function hideOpenElement(selector) {
  const element = document.querySelector(selector);
  if (!element || element.classList.contains('hidden')) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  element.classList.add('hidden');
  return true;
}

function clearMobileTouchActivationState() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  const app = document.getElementById('app');
  app?.classList.add('is-clearing-touch-activation');
  window.setTimeout(() => {
    app?.classList.remove('is-clearing-touch-activation');
  }, 220);
}

function closeMobileChatPage() {
  closeMentionPicker();
  closeStickerPopover();
  state.roundtableErrorPopoverOpen = false;
  state.voiceErrorPopoverOpen = false;
  renderRoundtableErrorIndicator();
  renderVoiceErrorIndicator();
  document.getElementById('app')?.classList.remove('is-chat-open');
  syncMobileBackAvailability();
}

function getTopOpenModalId() {
  const panels = [...document.querySelectorAll('.modal:not(.hidden)')];
  const panel = panels[panels.length - 1];
  return panel?.id || '';
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
  renderMcpPicker();
  renderRolePluginStoreGrid();
  updateContextStatus();
  renderRoundtableErrorIndicator();
  renderVoiceErrorIndicator();
  scheduleRoundtableIdle();
  syncMobileBackAvailability();
}

function setImageSource(image, source, fallback = 'src/_logo/emoji/robot_3d.png') {
  if (!image) return;
  const value = String(source || fallback);
  image.dataset.mediaSource = value;
  image.src = fallback;
  if (!isMediaRef(value)) {
    image.src = value || fallback;
    return;
  }
  getMediaDataUrl(value)
    .then(dataUrl => {
      if (image.dataset.mediaSource === value) image.src = dataUrl || fallback;
    })
    .catch(error => {
      console.warn('[ui] failed to load media image', error);
      if (image.dataset.mediaSource === value) image.src = fallback;
    });
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
    const avatar = node.querySelector('.conversation-item__avatar');
    setImageSource(avatar, item.avatar);
    avatar.alt = item.title;
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
        meta: item.source === 'preset' ? '预置' : '导入'
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
        preview: last ? `${last.speakerName || ''}${last.speakerName ? '：' : ''}${messagePreviewText(last)}` : '还没有消息',
        meta: last ? formatConversationListTime(last.createdAt) : ''
      };
    });
}

function renderMessages() {
  const container = document.getElementById('message-list');
  if (!container) return;
  const conversation = getActiveConversation();
  if (!conversation) {
    container.innerHTML = `<div class="empty-state"><img src="src/_logo/emoji/sparkles_3d.png" alt=""><h2>NEXT Chat</h2><p>选择角色或群聊开始。</p></div>`;
    return;
  }
  const messages = getConversationMessages(state.store, conversation.id);
  if (!messages.length) {
    container.innerHTML = `<div class="empty-state"><img src="src/_logo/emoji/speech_balloon_3d.png" alt=""><h2>${escapeHtml(conversation.title || conversationTitle(conversation))}</h2><p>发送第一条消息。</p></div>`;
    if (state.voiceNotice?.conversationId === conversation.id) {
      container.appendChild(createVoiceNoticeNode(state.voiceNotice));
    }
    return;
  }
  container.innerHTML = '';
  for (const message of messages) {
    container.appendChild(createMessageNode(message));
  }
  if (state.voiceNotice?.conversationId === conversation.id) {
    container.appendChild(createVoiceNoticeNode(state.voiceNotice));
  }
  container.scrollTop = container.scrollHeight;
}

function createMessageNode(message) {
  const row = document.createElement('article');
  row.className = `message-row${message.role === 'user' ? ' is-self' : ''}`;
  const avatar = document.createElement('img');
  avatar.className = 'message-avatar';
  avatar.alt = message.speakerName || '';
  setImageSource(avatar, message.role === 'user'
    ? 'src/_char/Profile_Adjutant.png'
    : characterAvatar(getCharacterById(state.store.characters, message.speakerId)));
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
  const text = message.text || '';
  const attachments = message.attachments || [];
  const hasGeneratedToolContent = Boolean(message.meta?.toolMode && (text.trim() || attachments.length));
  if (message.status === 'typing' && !hasGeneratedToolContent) {
    content.innerHTML = '<span class="typing-indicator"><span></span><span></span><span></span></span>';
  } else if (isVoiceReplyMessage(message)) {
    content.classList.add('message-content--voice');
    content.appendChild(createVoiceBubble(message));
  } else {
    const stickerOnly = isStickerOnlyMessage(text, attachments);
    if (stickerOnly) content.classList.add('message-content--sticker-only');
    if (text.trim()) renderMessageText(content, text);
    for (const [index, attachment] of attachments.entries()) {
      const node = createMessageAttachmentNode(message, attachment, index);
      if (!node) continue;
      if (content.childNodes.length) content.appendChild(document.createElement('br'));
      content.appendChild(node);
    }
    const otherToolAttachments = getToolOtherAttachments(message);
    if (otherToolAttachments.length) {
      if (content.childNodes.length) content.appendChild(document.createElement('br'));
      content.appendChild(createToolOtherFilesButton(message, otherToolAttachments));
    }
  }
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent = `${formatMessageTime(message.createdAt)}${message.status === 'error' ? ' · 失败' : ''}`;
  const stopButton = isActiveToolMessage(message) ? createToolStopButton() : null;
  bubble.append(name);
  if (message.meta?.toolTrace) {
    bubble.appendChild(createToolTraceNode(message.meta.toolTrace));
  }
  if (stopButton && !hasGeneratedToolContent) {
    const runtimeRow = document.createElement('div');
    runtimeRow.className = 'tool-runtime-row';
    runtimeRow.append(content, stopButton);
    bubble.append(runtimeRow, meta);
  } else {
    bubble.append(content);
    if (stopButton) {
      const stopRow = document.createElement('div');
      stopRow.className = 'tool-stop-row';
      stopRow.appendChild(stopButton);
      bubble.appendChild(stopRow);
    }
    bubble.append(meta);
  }
  if (message.role === 'user') row.append(bubble, avatar);
  else row.append(avatar, bubble);
  return row;
}

function isActiveToolMessage(message = {}) {
  const run = state.activeToolRun;
  if (!run || message.status !== 'typing' || message.meta?.toolMode !== true) return false;
  if (run.messageId) return message.id === run.messageId;
  return getActiveConversation()?.id === run.conversationId;
}

function createToolStopButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tool-stop-button';
  button.title = state.activeToolRun?.stopping ? '正在停止工具调用' : '停止工具调用';
  button.setAttribute('aria-label', button.title);
  button.disabled = Boolean(state.activeToolRun?.stopping);
  const icon = document.createElement('img');
  icon.src = 'src/_logo/icons/x.svg';
  icon.alt = '';
  button.appendChild(icon);
  button.addEventListener('click', event => {
    event.stopPropagation();
    stopActiveToolRun();
  });
  return button;
}

function stopActiveToolRun() {
  const run = state.activeToolRun;
  if (!run?.controller || run.controller.signal.aborted) return;
  run.stopping = true;
  run.controller.abort();
  renderMessages();
}

function createMessageAttachmentNode(message, attachment, index = 0) {
  if (!attachment) return null;
  if (attachment.type === 'image' && (attachment.dataRef || attachment.dataUrl || attachment.url || attachment.path)) {
    const image = document.createElement('img');
    const stickerMeta = resolveStickerAttachmentMeta(attachment);
    image.className = `message-image${stickerMeta ? ` message-image-sticker ${getStickerAttachmentOrientation(stickerMeta)}` : ''}`;
    setAttachmentImageSource(image, attachment);
    image.alt = attachment.name || '图片';
    return image;
  }
  if (attachment.type === 'audio' && (attachment.dataRef || attachment.dataUrl || attachment.url || attachment.path)) {
    return createVoiceBubble(message, attachment, `${message.id}:attachment:${index}`);
  }
  if (attachment.type === 'video' && (attachment.dataRef || attachment.dataUrl || attachment.url || attachment.path)) {
    return createVideoAttachmentNode(attachment);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'message-attachment-file';
  button.title = '保存附件';
  button.setAttribute('aria-label', `保存附件 ${attachment.name || attachment.mime || '未命名'}`);
  const icon = document.createElement('img');
  icon.src = 'src/_logo/icons/paperclip.svg';
  icon.alt = '';
  const text = document.createElement('span');
  const name = document.createElement('strong');
  name.textContent = attachment.name || attachment.mime || '未命名附件';
  const meta = document.createElement('small');
  meta.textContent = [
    attachment.mime || attachment.type || 'attachment',
    attachment.size ? formatBytes(attachment.size) : '',
    attachment.path && !attachment.dataRef && !attachment.dataUrl ? '本地文件引用' : ''
  ].filter(Boolean).join(' · ');
  text.append(name, meta);
  button.append(icon, text);
  button.addEventListener('click', () => {
    saveAttachmentToUserDevice(attachment).catch(error => {
      console.warn('[ui] attachment save failed', error);
      window.alert(`附件保存失败：${error?.message || '未知错误'}`);
    });
  });
  return button;
}

function getToolOtherAttachments(message = {}) {
  if (message.meta?.toolMode !== true) return [];
  const attachments = message.meta?.toolOtherAttachments;
  return Array.isArray(attachments) ? attachments.filter(Boolean) : [];
}

function createToolOtherFilesButton(message, attachments = []) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tool-other-files-button';
  button.setAttribute('aria-label', `查看其他文件，共 ${attachments.length} 个`);
  const icon = document.createElement('img');
  icon.src = 'src/_logo/icons/paperclip.svg';
  icon.alt = '';
  const label = document.createElement('span');
  label.textContent = `其他文件 · ${attachments.length}`;
  button.append(icon, label);
  button.addEventListener('click', event => {
    event.stopPropagation();
    openToolOtherFilesPanel(message, attachments);
  });
  return button;
}

function openToolOtherFilesPanel(message, attachments = []) {
  state.toolOtherFiles = {
    messageId: message?.id || '',
    attachments: attachments.map(item => ({ ...item }))
  };
  renderToolOtherFilesPanel();
  openPanel('tool-other-files-panel');
}

function renderToolOtherFilesPanel() {
  const list = document.getElementById('tool-other-files-list');
  if (!list) return;
  const attachments = state.toolOtherFiles.attachments || [];
  setText('tool-other-files-count', `${attachments.length} 个文件`);
  list.innerHTML = '';
  if (!attachments.length) {
    list.innerHTML = '<div class="tool-other-files-empty">没有其他文件。</div>';
    return;
  }
  const message = getConversationMessages(state.store, getActiveConversation()?.id)
    .find(item => item.id === state.toolOtherFiles.messageId) || { id: state.toolOtherFiles.messageId };
  attachments.forEach((attachment, index) => {
    const item = document.createElement('article');
    item.className = `tool-other-file-item is-${attachment.type || 'file'}`;
    const node = createMessageAttachmentNode(message, attachment, index);
    if (node) item.appendChild(node);
    list.appendChild(item);
  });
}

function setAttachmentImageSource(image, attachment = {}, fallback = 'src/_logo/emoji/robot_3d.png') {
  if (!image) return;
  const stableSource = attachment.dataRef || attachment.dataUrl || attachment.url || attachment.path || fallback;
  image.dataset.mediaSource = stableSource;
  image.src = fallback;
  if (attachment.dataRef || attachment.dataUrl || attachment.path) {
    resolveAttachmentDataUrl(attachment)
      .then(dataUrl => {
        if (image.dataset.mediaSource === stableSource) image.src = dataUrl || attachment.url || fallback;
      })
      .catch(error => {
        console.warn('[ui] failed to load attachment image', error);
        if (image.dataset.mediaSource === stableSource) image.src = attachment.url || fallback;
      });
    return;
  }
  image.src = attachment.url || fallback;
}

function createVideoAttachmentNode(attachment = {}) {
  const video = document.createElement('video');
  video.className = 'message-video';
  video.controls = true;
  video.preload = 'metadata';
  const stableSource = attachment.dataRef || attachment.dataUrl || attachment.url || attachment.path || '';
  video.dataset.mediaSource = stableSource;
  if (attachment.dataRef || attachment.dataUrl || attachment.path) {
    resolveAttachmentDataUrl(attachment)
      .then(dataUrl => {
        if (video.dataset.mediaSource === stableSource && dataUrl) video.src = dataUrl;
      })
      .catch(error => {
        console.warn('[ui] failed to load attachment video', error);
        if (video.dataset.mediaSource === stableSource && attachment.url) video.src = attachment.url;
      });
  } else {
    video.src = attachment.url || '';
  }
  return video;
}

function createToolTraceNode(trace = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'message-tool-trace';
  const thoughts = Array.isArray(trace.thoughts) ? trace.thoughts : [];
  for (const thought of thoughts.length ? thoughts : [{ title: '思考中', content: '正在处理。', status: 'running' }]) {
    wrap.appendChild(createTraceDetails({
      icon: 'sparkles_3d.png',
      title: thought.title || '思考中',
      status: thought.status || 'running',
      body: thought.content || ''
    }, trace.collapsed));
  }
  const calls = Array.isArray(trace.calls) ? trace.calls : [];
  if (calls.length) wrap.appendChild(createToolCallGroupNode(calls));
  return wrap;
}

function createToolCallGroupNode(calls = []) {
  const latest = calls[calls.length - 1] || {};
  const status = calls.some(call => call.status === 'error')
    ? 'error'
    : calls.some(call => !['success', 'done'].includes(call.status))
      ? 'running'
      : 'success';
  const details = document.createElement('details');
  details.className = `tool-trace-card tool-trace-call-group is-${status}`;
  const summary = createTraceSummary({
    icon: 'wrench.svg',
    title: `MCP 调用：${latest.toolName || 'tool'}`,
    status,
    statusLabel: `${traceStatusLabel(status)} · ${calls.length} 次`
  });
  const list = document.createElement('div');
  list.className = 'tool-trace-call-list';
  calls.forEach((call, index) => {
    list.appendChild(createTraceDetails({
      icon: 'wrench.svg',
      title: `${index + 1}. ${call.toolName || 'tool'}`,
      status: call.status || 'running',
      body: buildToolCallTraceBody(call)
    }, true));
  });
  details.append(summary, list);
  return details;
}

function buildToolCallTraceBody(call = {}) {
  return [
    call.clientName ? `服务：${call.clientName}` : '',
    `参数：\n${JSON.stringify(call.args || {}, null, 2)}`,
    call.result ? `结果：\n${call.result}` : '',
    Array.isArray(call.attachments) && call.attachments.length
      ? `附件：\n${call.attachments.map(item => item.name || item.mime || item.type || '附件').join('\n')}`
      : ''
  ].filter(Boolean).join('\n\n');
}

function createTraceDetails(item, collapsed) {
  const details = document.createElement('details');
  details.className = `tool-trace-card is-${item.status || 'running'}`;
  details.open = !collapsed && item.status === 'error';
  const summary = createTraceSummary(item);
  const body = document.createElement('pre');
  body.textContent = item.body || '';
  details.append(summary, body);
  return details;
}

function createTraceSummary(item) {
  const summary = document.createElement('summary');
  const icon = document.createElement('img');
  icon.alt = '';
  icon.src = item.icon?.endsWith('.png') ? `src/_logo/emoji/${item.icon}` : `src/_logo/icons/${item.icon || 'wrench.svg'}`;
  const title = document.createElement('strong');
  title.textContent = item.title;
  const status = document.createElement('span');
  status.textContent = item.statusLabel || traceStatusLabel(item.status);
  summary.append(icon, title, status);
  return summary;
}

function traceStatusLabel(status) {
  if (status === 'success' || status === 'done') return '完成';
  if (status === 'error') return '异常';
  return '运行中';
}

function createVoiceNoticeNode(notice) {
  const row = document.createElement('div');
  row.className = `voice-notice${notice.level === 'error' ? ' is-error' : ''}`;
  row.textContent = notice.text || '';
  return row;
}

function isVoiceReplyMessage(message) {
  return message?.meta?.voiceReply === true && getMessageVoiceAttachment(message);
}

function getMessageVoiceAttachment(message) {
  return (message?.attachments || []).find(item => item.type === 'audio' && (item.dataRef || item.dataUrl || item.url || item.path)) || null;
}

function createVoiceBubble(message, attachmentOverride = null, playbackId = '') {
  const attachment = attachmentOverride || getMessageVoiceAttachment(message);
  const voiceId = playbackId || message.id;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'voice-bubble';
  button.dataset.voiceMessageId = voiceId;
  button.setAttribute('aria-label', `播放 ${message.speakerName || '角色'} 的语音回复`);
  const icon = document.createElement('img');
  icon.src = 'src/_logo/icons/volume-2.svg';
  icon.alt = '';
  const duration = document.createElement('span');
  duration.className = 'voice-bubble__duration';
  const initialDuration = Math.max(1, Math.ceil(Number(attachment?.duration) || 0));
  button.dataset.voiceDuration = String(initialDuration);
  duration.textContent = formatVoiceSeconds(initialDuration);
  const bars = document.createElement('span');
  bars.className = 'voice-bubble__bars';
  bars.innerHTML = '<i></i><i></i><i></i>';
  button.append(icon, bars, duration);
  button.addEventListener('click', () => toggleVoicePlayback(voiceId, attachment));
  updateVoiceBubblePlaybackState(button, voiceId);
  return button;
}

async function saveAttachmentToUserDevice(attachment = {}) {
  let dataUrl = '';
  try {
    dataUrl = await resolveAttachmentDataUrl(attachment, { fetchRemote: true });
  } catch (error) {
    console.warn('[ui] attachment data resolve failed, falling back to direct link', error);
  }
  const fileName = safeDownloadName(attachment.name || `mcp-attachment${fileExtensionForMime(attachment.mime)}`);
  if (dataUrl) {
    const blob = dataUrlToBlob(dataUrl);
    if (window.showDirectoryPicker) {
      const directory = await window.showDirectoryPicker({ mode: 'readwrite' });
      const fileHandle = await directory.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }
    if (window.showSaveFilePicker) {
      const fileHandle = await window.showSaveFilePicker({ suggestedName: fileName });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }
    triggerBrowserDownload(dataUrl, fileName);
    return;
  }
  const url = attachment.url || attachment.uri || '';
  if (!url) throw new Error('附件没有可保存的数据。');
  triggerBrowserDownload(url, fileName);
}

async function resolveAttachmentDataUrl(attachment = {}, options = {}) {
  if (attachment.dataRef) return getMediaDataUrl(attachment.dataRef);
  if (attachment.dataUrl) return attachment.dataUrl;
  if (attachment.path && window.__FRITIA_NATIVE_FILE__?.readFile) {
    const file = await window.__FRITIA_NATIVE_FILE__.readFile({
      path: attachment.path,
      mime: attachment.mime || '',
      name: attachment.name || ''
    });
    const dataUrl = file?.dataUrl || file?.data_url || '';
    if (dataUrl) return dataUrl;
    const dataBase64 = file?.dataBase64 || file?.data_base64 || file?.base64 || '';
    if (dataBase64) return base64ToDataUrl(dataBase64, file?.mime || attachment.mime || 'application/octet-stream');
  }
  const url = String(attachment.url || attachment.uri || '').trim();
  if (options.fetchRemote && /^(https?:|blob:|data:)/i.test(url)) return fetchAttachmentUrlAsDataUrl(url, attachment.mime || '');
  return '';
}

async function fetchAttachmentUrlAsDataUrl(url, fallbackMime = '') {
  if (String(url || '').startsWith('data:')) return url;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`附件下载失败 (${response.status})`);
  const blob = await response.blob();
  if (!blob.size) return '';
  return blobToDataUrl(blob, fallbackMime);
}

function blobToDataUrl(blob, fallbackMime = '') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      if (!fallbackMime || !result.startsWith('data:application/octet-stream')) {
        resolve(result);
        return;
      }
      resolve(result.replace(/^data:application\/octet-stream/, `data:${fallbackMime}`));
    };
    reader.onerror = () => reject(reader.error || new Error('附件读取失败。'));
    reader.readAsDataURL(blob);
  });
}

function base64ToDataUrl(data, mime = 'application/octet-stream') {
  const source = String(data || '');
  if (!source) return '';
  if (source.startsWith('data:')) return source;
  return `data:${mime || 'application/octet-stream'};base64,${source}`;
}

function dataUrlToBlob(dataUrl) {
  const [meta, payload = ''] = String(dataUrl || '').split(',');
  const mime = /^data:([^;,]+)/.exec(meta)?.[1] || 'application/octet-stream';
  const binary = meta.includes(';base64') ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

function triggerBrowserDownload(url, fileName) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function safeDownloadName(name) {
  const cleaned = String(name || 'mcp-attachment.bin').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').trim();
  return cleaned || 'mcp-attachment.bin';
}

function fileExtensionForMime(mime = '') {
  const lower = String(mime || '').toLowerCase();
  if (lower.includes('png')) return '.png';
  if (lower.includes('jpeg') || lower.includes('jpg')) return '.jpg';
  if (lower.includes('gif')) return '.gif';
  if (lower.includes('webp')) return '.webp';
  if (lower.includes('mpeg') || lower.includes('mp3')) return '.mp3';
  if (lower.includes('wav')) return '.wav';
  if (lower.includes('ogg')) return '.ogg';
  if (lower.includes('mp4')) return '.mp4';
  if (lower.includes('webm')) return '.webm';
  if (lower.includes('quicktime')) return '.mov';
  if (lower.includes('json')) return '.json';
  if (lower.includes('pdf')) return '.pdf';
  if (lower.includes('text')) return '.txt';
  return '.bin';
}

async function toggleVoicePlayback(messageId, attachment) {
  if (!attachment) return;
  if (state.voicePlayback.messageId === messageId && state.voicePlayback.audio) {
    stopVoicePlayback();
    return;
  }
  stopVoicePlayback();
  try {
    const dataUrl = await resolveAttachmentDataUrl(attachment);
    const audioSource = dataUrl || attachment.url || attachment.uri || '';
    if (!audioSource) throw new Error('语音文件不存在或已损坏。');
    const audio = new Audio(audioSource);
    const fallbackDuration = Math.max(1, Math.ceil(Number(attachment.duration) || 0));
    state.voicePlayback = {
      messageId,
      audio,
      remaining: fallbackDuration
    };
    audio.addEventListener('loadedmetadata', () => {
      if (state.voicePlayback.messageId !== messageId) return;
      state.voicePlayback.remaining = Math.max(1, Math.ceil(audio.duration || fallbackDuration));
      updateVoicePlaybackDom();
    }, { once: true });
    audio.addEventListener('ended', stopVoicePlayback, { once: true });
    await audio.play();
    updateVoicePlaybackDom();
    voicePlaybackTimer = window.setInterval(() => {
      if (state.voicePlayback.messageId !== messageId || !state.voicePlayback.audio) return;
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : fallbackDuration;
      state.voicePlayback.remaining = Math.max(0, Math.ceil(duration - audio.currentTime));
      updateVoicePlaybackDom();
      if (audio.ended || state.voicePlayback.remaining <= 0) stopVoicePlayback();
    }, 500);
  } catch (error) {
    console.warn('[ui] voice playback failed', error);
    showVoiceNotice({
      conversationId: getActiveConversation()?.id || '',
      level: 'error',
      text: `语音播放失败：${error?.message || '未知错误'}`
    });
  }
}

function stopVoicePlayback() {
  if (voicePlaybackTimer) {
    clearInterval(voicePlaybackTimer);
    voicePlaybackTimer = 0;
  }
  if (state.voicePlayback.audio) {
    state.voicePlayback.audio.pause();
    state.voicePlayback.audio.removeAttribute('src');
  }
  const previousId = state.voicePlayback.messageId;
  state.voicePlayback = { messageId: '', audio: null, remaining: 0 };
  if (previousId) updateVoicePlaybackDom(previousId);
}

function updateVoicePlaybackDom(previousId = '') {
  document.querySelectorAll('.voice-bubble').forEach(button => {
    const id = button.dataset.voiceMessageId || '';
    updateVoiceBubblePlaybackState(button, id, previousId);
  });
}

function updateVoiceBubblePlaybackState(button, messageId, previousId = '') {
  const active = state.voicePlayback.messageId === messageId && state.voicePlayback.audio;
  if (!active && previousId && previousId !== messageId) return;
  button.classList.toggle('is-playing', Boolean(active));
  const duration = button.querySelector('.voice-bubble__duration');
  if (duration && active) duration.textContent = formatVoiceSeconds(state.voicePlayback.remaining);
  if (duration && !active) duration.textContent = formatVoiceSeconds(button.dataset.voiceDuration);
}

function formatVoiceSeconds(value) {
  const seconds = Math.max(1, Math.ceil(Number(value) || 0));
  return `${seconds}s`;
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
  setImageSource(avatar, icon);
  setImageSource(headAvatar, icon);
  name.textContent = title;
  headTitle.textContent = title;
  if (conversation.type === 'private') {
    const character = getCharacterById(state.store.characters, conversation.memberIds[0]);
    description.textContent = character?.description || '角色私聊';
    headSubtitle.textContent = character?.description || '私聊';
    tags.innerHTML = (character?.tags || []).map(item => `<span class="tag">${escapeHtml(item)}</span>`).join('');
    renderDetailCharacterAction(character);
  } else {
    description.textContent = `${conversation.memberIds.length} 位角色 · 圆桌密语群聊`;
    headSubtitle.textContent = conversation.memberIds
      .map(id => getCharacterById(state.store.characters, id)?.name)
      .filter(Boolean)
      .join('、');
    tags.innerHTML = '<span class="tag">群聊</span><span class="tag">圆桌密语</span>';
    renderDetailCharacterAction(null);
  }
}

function renderDetailCharacterAction(character) {
  const button = document.getElementById('detail-character-action');
  const icon = document.getElementById('detail-character-action-icon');
  const label = document.getElementById('detail-character-action-label');
  const editable = isEditableCharacter(character);
  if (button) {
    button.dataset.panelOpen = editable ? 'character-edit-panel' : 'character-import-panel';
    button.title = editable ? '编辑角色' : '导入角色';
  }
  if (icon) icon.src = editable ? 'src/_logo/icons/pencil.svg' : 'src/_logo/icons/user-plus.svg';
  if (label) label.textContent = editable ? '编辑角色' : '导入角色';
}

function getActivePrivateCharacter() {
  const conversation = getActiveConversation();
  if (!conversation || conversation.type !== 'private') return null;
  return getCharacterById(state.store.characters, conversation.memberIds[0]);
}

function isEditableCharacter(character) {
  return Boolean(character && character.source === 'custom');
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

function renderVoiceErrorIndicator() {
  const button = document.getElementById('voice-error-btn');
  const popover = document.getElementById('voice-error-popover');
  const title = document.getElementById('voice-error-title');
  const detail = document.getElementById('voice-error-detail');
  if (!button || !popover) return;
  const conversation = getActiveConversation();
  const error = state.voiceError;
  const visible = Boolean(
    conversation?.type === 'private'
    && error
    && (!error.conversationId || error.conversationId === conversation.id)
  );
  if (!visible) state.voiceErrorPopoverOpen = false;
  button.classList.toggle('hidden', !visible);
  popover.classList.toggle('hidden', !visible || !state.voiceErrorPopoverOpen);
  if (title) title.textContent = error?.title || '语音生成异常';
  if (detail) {
    const time = error?.createdAt ? `发生时间：${formatTime(error.createdAt)}` : '';
    detail.textContent = [time, error?.detail || error?.text || ''].filter(Boolean).join('\n\n');
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
    setImageSource(image, att.dataRef || att.dataUrl);
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
      deleteSticker(sticker.id).catch(error => console.warn('[ui] delete sticker failed', error));
    });
    item.append(preview, name, meta, deleteButton);
    grid.appendChild(item);
  }
}

function resolveStickerAttachmentMeta(attachment) {
  if (!attachment || attachment.type !== 'image') return null;
  if (attachment.source === 'sticker') return attachment;
  return listStickers().find(item => {
    if (attachment.dataRef && item.dataRef) return item.dataRef === attachment.dataRef;
    return item.dataUrl && attachment.dataUrl && item.dataUrl === attachment.dataUrl;
  }) || null;
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
  setImageSource(image, sticker.dataRef || sticker.dataUrl);
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
      <img alt="">
      <span class="member-text"><strong>${escapeHtml(character.name)}</strong><small>${escapeHtml(character.description || character.source)}</small></span>
    `;
    setImageSource(item.querySelector('img'), characterAvatar(character));
    item.addEventListener('click', () => {
      if (selected.has(character.id)) selected.delete(character.id);
    else selected.add(character.id);
      renderGroupMemberPicker();
    });
    container.appendChild(item);
  }
  if (!characters.length) {
    container.innerHTML = '<div class="member-empty">没有匹配的角色。</div>';
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
  syncMobileBackAvailability();
}

function closeGroupInfoPanel() {
  document.getElementById('group-info-panel')?.classList.add('hidden');
  document.getElementById('group-info-backdrop')?.classList.add('hidden');
  state.groupInfoEditing = false;
  syncMobileBackAvailability();
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
  setText('group-info-name-label', conversation.title || conversationTitle(conversation));
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
      <img alt="">
      <span>${escapeHtml(compactLabel(character.name, 4))}</span>
    `;
    setImageSource(item.querySelector('img'), characterAvatar(character));
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
      <img alt="">
      <span><strong>${escapeHtml(character.name)}</strong><small>${escapeHtml(character.description || character.source)}</small></span>
    `;
    setImageSource(item.querySelector('img'), characterAvatar(character));
    item.addEventListener('click', () => {
      if (selected.has(character.id)) selected.delete(character.id);
      else selected.add(character.id);
      renderGroupInfoMemberEditor();
    });
    list.appendChild(item);
  }
  if (!characters.length) {
    list.innerHTML = '<div class="member-empty">没有匹配的角色。</div>';
  }
  if (save) {
    const count = selected.size;
    save.disabled = count < 2;
    save.title = `保存成员(${count})`;
    save.setAttribute('aria-label', `保存成员(${count})`);
  }
}

function getGroupMembers(conversation) {
  return conversation.memberIds
    .map(id => getCharacterById(state.store.characters, id))
    .filter(Boolean);
}

function renameActiveGroupConversation() {
  const conversation = getActiveConversation();
  if (!conversation || conversation.type !== 'group') return;
  const currentTitle = conversation.title || conversationTitle(conversation);
  const nextTitle = window.prompt('修改群聊名称', currentTitle);
  if (nextTitle === null) return;
  const title = nextTitle.trim();
  if (!title || title === currentTitle) return;
  updateStore(updateGroupConversation(state.store, conversation.id, { title }));
  renderGroupInfoPanel();
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
      <img alt="">
      <span><strong>@${escapeHtml(candidate.name)}</strong><small>${escapeHtml(candidate.description || '群成员')}</small></span>
    `;
    setImageSource(row.querySelector('img'), candidate.avatar);
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
  container.innerHTML = renderMarkdownDocument(text);
  enhanceMarkdownMentions(container);
}

function enhanceMarkdownMentions(container) {
  const pattern = /[@＠][^\s@＠，。！？、：:；;<>()[\]{}]+/g;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.closest('a, code, pre, button, textarea, input, script, style')) {
        return NodeFilter.FILTER_REJECT;
      }
      pattern.lastIndex = 0;
      return pattern.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    replaceMentionTextNode(node, pattern);
  }
}

function replaceMentionTextNode(node, pattern) {
  const source = node.nodeValue || '';
  pattern.lastIndex = 0;
  let lastIndex = 0;
  const fragment = document.createDocumentFragment();
  for (const match of source.matchAll(pattern)) {
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(source.slice(lastIndex, match.index)));
    }
    const mention = document.createElement('button');
    mention.className = 'message-mention';
    mention.type = 'button';
    mention.textContent = match[0];
    mention.addEventListener('click', () => insertMentionText(match[0].slice(1)));
    fragment.appendChild(mention);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < source.length) {
    fragment.appendChild(document.createTextNode(source.slice(lastIndex)));
  }
  node.replaceWith(fragment);
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

function enhanceCustomSelects(root = document) {
  root.querySelectorAll('select').forEach(enhanceCustomSelect);
}

function enhanceCustomSelect(select) {
  if (!select || select.dataset.customSelectBound === 'true') return;
  select.dataset.customSelectBound = 'true';
  select.classList.add('native-custom-select');
  const custom = document.createElement('div');
  custom.className = 'custom-select';
  custom.innerHTML = `
    <button class="custom-select-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
      <span></span>
      <img src="src/_logo/icons/chevron-down.svg" alt="">
    </button>
    <div class="custom-select-menu" role="listbox"></div>
  `;
  select.insertAdjacentElement('afterend', custom);
  custom.querySelector('.custom-select-trigger')?.addEventListener('click', event => {
    event.stopPropagation();
    const willOpen = !custom.classList.contains('is-open');
    closeCustomSelects();
    custom.classList.toggle('is-open', willOpen);
    custom.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', String(willOpen));
  });
  select.addEventListener('change', () => updateCustomSelect(select));
  updateCustomSelect(select);
}

function updateCustomSelect(select) {
  enhanceCustomSelect(select);
  const custom = select.nextElementSibling?.classList?.contains('custom-select') ? select.nextElementSibling : null;
  if (!custom) return;
  const triggerText = custom.querySelector('.custom-select-trigger span');
  const menu = custom.querySelector('.custom-select-menu');
  const selected = select.selectedOptions?.[0] || select.options?.[select.selectedIndex];
  if (triggerText) triggerText.textContent = selected?.textContent || '';
  if (!menu) return;
  menu.innerHTML = '';
  [...select.options].forEach(option => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `custom-select-option${option.value === select.value ? ' is-selected' : ''}`;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(option.value === select.value));
    item.textContent = option.textContent;
    item.addEventListener('click', event => {
      event.stopPropagation();
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      closeCustomSelects();
    });
    menu.appendChild(item);
  });
}

function closeCustomSelects() {
  document.querySelectorAll('.custom-select.is-open').forEach(custom => {
    custom.classList.remove('is-open');
    custom.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
  });
}

function showModelProviderTab(tab = 'chat') {
  const nextTab = ['chat', 'tts', 'defaults'].includes(tab) ? tab : 'chat';
  state.modelProviderTab = nextTab;
  document.querySelectorAll('[data-model-tab]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.modelTab === nextTab);
  });
  document.querySelectorAll('[data-model-pane]').forEach(pane => {
    pane.classList.toggle('is-active', pane.dataset.modelPane === nextTab);
  });
}

function renderModelSettings(settings = getSettings()) {
  const chatProviders = settings.chatProviders || [];
  const ttsProviders = settings.ttsProviders || [];
  if (!chatProviders.some(provider => provider.id === state.selectedChatProviderId)) {
    state.selectedChatProviderId = settings.defaultChatProviderId || chatProviders[0]?.id || '';
  }
  if (!ttsProviders.some(provider => provider.id === state.selectedTtsProviderId)) {
    state.selectedTtsProviderId = settings.defaultTtsProviderId || ttsProviders[0]?.id || '';
  }
  renderModelProviderGroup('chat', chatProviders, state.selectedChatProviderId);
  renderModelProviderGroup('tts', ttsProviders, state.selectedTtsProviderId);
  fillProviderSelect('default-chat-provider', chatProviders, settings.defaultChatProviderId);
  fillProviderSelect('default-tts-provider', ttsProviders, settings.defaultTtsProviderId);
  fillProviderSelect('default-image-caption-provider', chatProviders, settings.defaultImageCaptionProviderId);
  showModelProviderTab(state.modelProviderTab);
}

function renderModelProviderGroup(kind, providers, selectedId) {
  const provider = providers.find(item => item.id === selectedId) || providers[0] || null;
  if (provider) {
    if (kind === 'chat') state.selectedChatProviderId = provider.id;
    else state.selectedTtsProviderId = provider.id;
  }
  renderModelProviderList(kind, providers, provider?.id || '');
  fillProviderSelect(`model-${kind}-provider-select`, providers, provider?.id || '');
  fillModelProviderForm(kind, provider);
}

function renderModelProviderList(kind, providers, selectedId) {
  const container = document.getElementById(`model-${kind}-provider-list`);
  if (!container) return;
  const icon = kind === 'chat' ? 'bot.svg' : 'mic.svg';
  container.innerHTML = '';
  for (const provider of providers) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `model-provider-item${provider.id === selectedId ? ' is-active' : ''}`;
    item.innerHTML = `
      <img src="src/_logo/icons/${icon}" alt="">
      <span><strong>${escapeHtml(provider.id)}</strong><small>${escapeHtml(provider.baseUrl)}</small></span>
    `;
    item.addEventListener('click', () => selectModelProvider(kind, provider.id));
    container.appendChild(item);
  }
}

function fillProviderSelect(id, providers, selectedId) {
  const select = document.getElementById(id);
  if (!select) return;
  select.innerHTML = providers
    .map(provider => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.id)}</option>`)
    .join('');
  select.value = providers.some(provider => provider.id === selectedId) ? selectedId : (providers[0]?.id || '');
  updateCustomSelect(select);
}

function fillModelProviderForm(kind, provider) {
  const prefix = kind === 'chat' ? 'chat' : 'tts';
  if (!provider) return;
  setValue(`${prefix}-provider-id`, provider.id);
  setValue(`${prefix}-provider-api-key`, provider.apiKey);
  setValue(`${prefix}-provider-base-url`, provider.baseUrl);
  setValue(`${prefix}-provider-model`, provider.model);
  if (kind === 'tts') {
    setValue('tts-provider-speed', provider.speed);
    setText('tts-provider-speed-value', `${Number(provider.speed || 1).toFixed(2)}x`);
  }
  updateModelDraftHeader(kind);
}

function updateModelDraftHeader(kind) {
  const prefix = kind === 'chat' ? 'chat' : 'tts';
  setText(`model-${kind}-title`, document.getElementById(`${prefix}-provider-id`)?.value || (kind === 'chat' ? 'openai' : 'mimo-tts'));
  setText(`model-${kind}-subtitle`, document.getElementById(`${prefix}-provider-base-url`)?.value || (kind === 'chat' ? 'https://api.openai.com/v1' : 'https://api.xiaomimimo.com/v1'));
}

function selectModelProvider(kind, id) {
  if (kind === 'chat') state.selectedChatProviderId = id;
  else state.selectedTtsProviderId = id;
  renderModelSettings(getSettings());
}

function addModelProvider(kind) {
  const settings = getSettings();
  const defaults = normalizeDefaultModelSelection(readDefaultModelSelection(), settings);
  if (kind === 'chat') {
    const id = createUniqueProviderId('openai', settings.chatProviders);
    state.selectedChatProviderId = id;
    saveSettings({
      chatProviders: [
        ...settings.chatProviders,
        { id, apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' }
      ],
      ...defaults
    });
    return;
  }
  const id = createUniqueProviderId('mimo-tts', settings.ttsProviders);
  state.selectedTtsProviderId = id;
  saveSettings({
    ttsProviders: [
      ...settings.ttsProviders,
      { id, apiKey: '', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-tts-voiceclone', speed: 1 }
    ],
    ...defaults
  });
}

function deleteModelProvider(kind) {
  const settings = getSettings();
  const defaults = normalizeDefaultModelSelection(readDefaultModelSelection(), settings);
  const providers = kind === 'chat' ? settings.chatProviders : settings.ttsProviders;
  const selectedId = kind === 'chat' ? state.selectedChatProviderId : state.selectedTtsProviderId;
  const nextProviders = providers.filter(provider => provider.id !== selectedId);
  const fallback = nextProviders[0] || (kind === 'chat'
    ? { id: 'openai', apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' }
    : { id: 'mimo-tts', apiKey: '', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-tts-voiceclone', speed: 1 });
  if (!nextProviders.length) nextProviders.push(fallback);
  if (kind === 'chat') {
    state.selectedChatProviderId = fallback.id;
    saveSettings({
      chatProviders: nextProviders,
      ...remapProviderDefaults(defaults, kind, selectedId, fallback.id)
    });
    return;
  }
  state.selectedTtsProviderId = fallback.id;
  saveSettings({
    ttsProviders: nextProviders,
    ...remapProviderDefaults(defaults, kind, selectedId, fallback.id)
  });
}

function saveCurrentModelProvider(kind, options = {}) {
  const settings = getSettings();
  const selectedId = kind === 'chat' ? state.selectedChatProviderId : state.selectedTtsProviderId;
  const provider = readModelProviderForm(kind);
  const defaults = remapProviderDefaults(
    normalizeDefaultModelSelection(options.defaultSelection || readDefaultModelSelection(), settings),
    kind,
    selectedId,
    provider.id
  );
  if (kind === 'chat') {
    const saved = saveSettings({
      chatProviders: replaceProvider(settings.chatProviders, selectedId, provider),
      ...defaults
    });
    state.selectedChatProviderId = provider.id;
    if (!options.skipRender) renderModelSettings(saved);
    return saved;
  }
  const saved = saveSettings({
    ttsProviders: replaceProvider(settings.ttsProviders, selectedId, provider),
    ...defaults
  });
  state.selectedTtsProviderId = provider.id;
  if (!options.skipRender) renderModelSettings(saved);
  return saved;
}

function saveModelSettings({ closeAfterSave = false } = {}) {
  const defaults = readDefaultModelSelection();
  if (state.modelProviderTab === 'chat') {
    const selectedId = state.selectedChatProviderId;
    const provider = readModelProviderForm('chat');
    saveCurrentModelProvider('chat', { skipRender: true, defaultSelection: defaults });
    if (defaults.defaultChatProviderId === selectedId) defaults.defaultChatProviderId = provider.id;
    if (defaults.defaultImageCaptionProviderId === selectedId) defaults.defaultImageCaptionProviderId = provider.id;
  }
  if (state.modelProviderTab === 'tts') {
    const selectedId = state.selectedTtsProviderId;
    const provider = readModelProviderForm('tts');
    saveCurrentModelProvider('tts', { skipRender: true, defaultSelection: defaults });
    if (defaults.defaultTtsProviderId === selectedId) defaults.defaultTtsProviderId = provider.id;
  }
  const saved = saveSettings(defaults);
  renderModelSettings(saved);
  if (closeAfterSave) closePanel('settings-panel');
  return saved;
}

function readDefaultModelSelection() {
  return {
    defaultChatProviderId: document.getElementById('default-chat-provider')?.value,
    defaultTtsProviderId: document.getElementById('default-tts-provider')?.value,
    defaultImageCaptionProviderId: document.getElementById('default-image-caption-provider')?.value
  };
}

function normalizeDefaultModelSelection(defaults = {}, settings = getSettings()) {
  return {
    defaultChatProviderId: defaults.defaultChatProviderId || settings.defaultChatProviderId,
    defaultTtsProviderId: defaults.defaultTtsProviderId || settings.defaultTtsProviderId,
    defaultImageCaptionProviderId: defaults.defaultImageCaptionProviderId || settings.defaultImageCaptionProviderId || settings.defaultChatProviderId
  };
}

function remapProviderDefaults(defaults, kind, previousId, nextId) {
  const next = { ...defaults };
  if (!previousId || !nextId) return next;
  if (kind === 'chat') {
    if (next.defaultChatProviderId === previousId) next.defaultChatProviderId = nextId;
    if (next.defaultImageCaptionProviderId === previousId) next.defaultImageCaptionProviderId = nextId;
  }
  if (kind === 'tts' && next.defaultTtsProviderId === previousId) {
    next.defaultTtsProviderId = nextId;
  }
  return next;
}

function readModelProviderForm(kind) {
  if (kind === 'chat') {
    return {
      id: document.getElementById('chat-provider-id')?.value || state.selectedChatProviderId || 'openai',
      apiKey: document.getElementById('chat-provider-api-key')?.value || '',
      baseUrl: document.getElementById('chat-provider-base-url')?.value || 'https://api.openai.com/v1',
      model: document.getElementById('chat-provider-model')?.value || 'gpt-4.1-mini'
    };
  }
  return {
    id: document.getElementById('tts-provider-id')?.value || state.selectedTtsProviderId || 'mimo-tts',
    apiKey: document.getElementById('tts-provider-api-key')?.value || '',
    baseUrl: document.getElementById('tts-provider-base-url')?.value || 'https://api.xiaomimimo.com/v1',
    model: document.getElementById('tts-provider-model')?.value || 'mimo-v2.5-tts-voiceclone',
    speed: Number(document.getElementById('tts-provider-speed')?.value || 1)
  };
}

function replaceProvider(providers, selectedId, provider) {
  const next = providers.map(item => (item.id === selectedId ? provider : item));
  if (!next.some(item => item.id === provider.id)) next.push(provider);
  return next;
}

function createUniqueProviderId(prefix, providers) {
  const used = new Set(providers.map(provider => provider.id));
  if (!used.has(prefix)) return prefix;
  let index = 2;
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function syncSettingsToForm() {
  const settings = getSettings();
  const advanced = getAdvancedSettings();
  const memory = getLongTermMemorySettings();
  renderModelSettings(settings);
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
  const settings = getSettings();
  const selectedChat = settings.chatProviders.find(provider => provider.id === state.selectedChatProviderId)
    || settings.chatProviders.find(provider => provider.id === settings.defaultChatProviderId)
    || settings.chatProviders[0];
  const draft = {
    ...settings,
    model: document.getElementById('chat-provider-model')?.value || selectedChat?.model || settings.model,
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
  closeMainMenu();
  closePluginSourceMenu();
  closeQuickCreateMenu();
  closeMcpPicker();
  if (id === 'character-edit-panel') {
    openCharacterEditPanel();
    syncMobileBackAvailability();
    return;
  }
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
  if (id === 'archive-panel') renderArchivePanel();
  if (id === 'tool-call-panel') renderToolCallPanel();
  if (id === 'plugin-store-panel') {
    renderPluginStorePanel();
    loadRolePluginCatalog({ force: true });
    if (state.pluginStoreSection === 'mcp' && !state.pluginStore.items.length && !state.pluginStore.loading) {
      checkModelScopeLoginStatus();
      loadPluginStorePage();
    }
  }
  if (id === 'plugin-detail-panel') renderPluginDetail();
  syncMobileBackAvailability();
}

function closePanel(id) {
  if (id === 'memory-node-panel') {
    closeMemoryNodePanel();
    syncMobileBackAvailability();
    return;
  }
  if (id === 'character-edit-panel') {
    clearCharacterEditTransientUrls();
    state.characterEdit.characterId = '';
  }
  if (id === 'archive-panel') {
    state.archiveConfigOpen = false;
  }
  if (id === 'plugin-store-panel' || id === 'plugin-detail-panel' || id === 'plugin-source-login-panel' || id === 'plugin-official-browser-panel') {
    closePluginSourceMenu();
  }
  if (id === 'plugin-official-browser-panel') {
    document.getElementById('plugin-official-frame')?.setAttribute('src', 'about:blank');
  }
  if (id === 'tool-other-files-panel') {
    state.toolOtherFiles = { messageId: '', attachments: [] };
    renderToolOtherFilesPanel();
  }
  document.getElementById(id)?.classList.add('hidden');
  syncMobileBackAvailability();
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
  syncMobileBackAvailability();
}

function updateStore(store) {
  state.store = store || loadAppStore();
  renderAll();
}

function updateStoreFromToolReply(store, meta = {}) {
  state.store = store || loadAppStore();
  if (meta.source === 'tool' && state.activeToolRun) {
    if (meta.messageId) state.activeToolRun.messageId = meta.messageId;
    if ((meta.status === 'sent' || meta.status === 'error') && (!meta.messageId || state.activeToolRun.messageId === meta.messageId)) {
      state.activeToolRun = null;
    }
  }
  renderMessages();
  syncMobileBackAvailability();
  if (meta.status === 'sent' || meta.status === 'error') {
    renderConversationList();
    renderMcpPicker();
    updateConversationChrome(getActiveConversation());
    renderRoundtableErrorIndicator();
    renderVoiceErrorIndicator();
    scheduleRoundtableIdle();
  }
}

function closeDetailPane() {
  document.getElementById('app')?.classList.remove('is-detail-open');
  syncMobileBackAvailability();
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

function messagePreviewText(message) {
  if (isVoiceReplyMessage(message)) return '[语音]';
  return message?.text || attachmentSummary(message?.attachments || []);
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
  syncMobileBackAvailability();
}

function togglePrivateVoiceReply() {
  const conversation = getActiveConversation();
  if (!conversation || conversation.type !== 'private') return;
  const character = getCharacterById(state.store.characters, conversation.memberIds[0]);
  const enabled = conversation.voiceReplyEnabled !== true;
  const conversations = state.store.conversations.map(item => item.id === conversation.id
    ? { ...item, voiceReplyEnabled: enabled }
    : item);
  const nextStore = saveAppStore({ ...state.store, conversations });
  updateStore(nextStore);
  showVoiceNotice({
    conversationId: conversation.id,
    level: 'info',
    text: `现在 ${character?.name || conversationTitle(conversation)} 会使用${enabled ? '语音' : '文字'}进行回复。`
  });
}

function showVoiceNotice(notice = {}) {
  if (voiceNoticeTimer) {
    clearTimeout(voiceNoticeTimer);
    voiceNoticeTimer = 0;
  }
  const createdAt = now();
  state.voiceNotice = {
    conversationId: notice.conversationId || getActiveConversation()?.id || '',
    level: notice.level || 'info',
    text: notice.text || '',
    createdAt
  };
  if (state.voiceNotice.level === 'error') {
    state.voiceError = {
      conversationId: state.voiceNotice.conversationId,
      title: notice.title || '语音生成异常',
      text: state.voiceNotice.text,
      detail: notice.detail || state.voiceNotice.text,
      createdAt
    };
    state.voiceErrorPopoverOpen = false;
    renderVoiceErrorIndicator();
  }
  renderMessages();
  voiceNoticeTimer = window.setTimeout(() => {
    if (state.voiceNotice?.createdAt !== createdAt) return;
    state.voiceNotice = null;
    renderMessages();
  }, 5200);
}

function updateConversationChrome(conversation) {
  const app = document.getElementById('app');
  const infoButton = document.getElementById('chat-info-btn');
  const voiceButton = document.getElementById('voice-reply-toggle-btn');
  const toolButton = document.getElementById('external-tools-toggle-btn');
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
    if (icon) icon.src = isPrivate ? 'src/_logo/icons/role-card.svg' : 'src/_logo/icons/users.svg';
  }
  if (voiceButton) {
    const enabled = Boolean(isPrivate && conversation?.voiceReplyEnabled === true);
    voiceButton.classList.toggle('hidden', !isPrivate);
    voiceButton.classList.toggle('is-active', enabled);
    voiceButton.setAttribute('aria-pressed', String(enabled));
    voiceButton.title = enabled ? '关闭语音回复' : '开启语音回复';
  }
  if (toolButton) {
    const enabled = Boolean(isPrivate && isMcpEnabledForConversation(conversation?.id || ''));
    toolButton.classList.toggle('hidden', !isPrivate);
    toolButton.classList.toggle('is-active', enabled);
    toolButton.setAttribute('aria-pressed', String(enabled));
    toolButton.title = enabled ? '外部工具已启用' : '调用外部工具';
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
    strip.innerHTML = '';
    if (selectedCharacters.length) {
      selectedCharacters.forEach(character => {
        const image = document.createElement('img');
        image.alt = character.name;
        image.title = character.name;
        setImageSource(image, characterAvatar(character));
        strip.appendChild(image);
      });
    } else {
      strip.innerHTML = '<span>选择至少 2 位角色</span>';
    }
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

function formatCompactFileSize(size) {
  const bytes = Math.max(0, Number(size) || 0);
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
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
