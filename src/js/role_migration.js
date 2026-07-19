import {
  createId,
  loadAppStore,
  saveAppStore,
  structuredCloneSafe
} from './storage.js';
import {
  exportLongTermMemory,
  migrateLongTermMemoryCharacterData,
  removeLongTermMemoryCharacterData
} from './long_term_memory.js';
import { getMcpConfig, saveMcpConfig } from './mcp_tools.js';
import { exportArchiveZip, importArchiveZipFile } from './archive_sync.js';

export const ROLE_MIGRATION_EVENT = 'fritia-role-migration-updated';
export const ROLE_MIGRATION_STATE_KEY = 'fritia_role_migration_state';
export const ROLE_MIGRATION_PREFERENCE_KEY = 'fritia_role_migration_preferences';

const MAX_ERROR_LENGTH = 500;
let activeMigration = false;

export function getRoleMigrationState() {
  try {
    const raw = localStorage.getItem(ROLE_MIGRATION_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? normalizeMigrationState(parsed) : null;
  } catch (error) {
    console.warn('[role-migration] failed to load state', error);
    return null;
  }
}

export function getRoleMigrationPreferences() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROLE_MIGRATION_PREFERENCE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('[role-migration] failed to load preferences', error);
    return {};
  }
}

export function isRoleMigrationDismissed(sourceId, targetId) {
  const key = pairKey(sourceId, targetId);
  return Boolean(key && getRoleMigrationPreferences().neverPrompt?.[key]);
}

export function dismissRoleMigrationPrompt(sourceId, targetId, { never = false } = {}) {
  if (!never) return;
  const key = pairKey(sourceId, targetId);
  if (!key) return;
  const preferences = getRoleMigrationPreferences();
  savePreferences({
    ...preferences,
    neverPrompt: { ...(preferences.neverPrompt || {}), [key]: true }
  });
}

export function initializeRoleMigrationState() {
  const state = getRoleMigrationState();
  if (state?.status !== 'migrating') return state;
  try {
    return markRoleMigrationFailed('上次角色迁移未完成，系统未删除原角色。请使用迁移前自动导出的存档恢复数据。');
  } catch (error) {
    console.warn('[role-migration] failed to mark interrupted migration', error);
    return {
      ...state,
      status: 'failed',
      phase: 'failed',
      label: '角色迁移失败',
      errorMessage: '上次角色迁移未完成。请使用迁移前自动导出的 ZIP 存档恢复数据。',
      updatedAt: Date.now()
    };
  }
}

export function clearRoleMigrationState() {
  try {
    localStorage.removeItem(ROLE_MIGRATION_STATE_KEY);
  } catch (error) {
    console.warn('[role-migration] failed to clear state', error);
  }
  dispatchMigrationEvent(null);
}

export function findRoleMigrationCandidate(store = loadAppStore(), conversation = null) {
  if (!conversation || conversation.type !== 'private') return null;
  const sourceCharacter = store.characters.find(item => item.id === conversation.memberIds?.[0] && item.source === 'custom');
  if (!sourceCharacter) return null;
  const targetCharacter = store.characters.find(item => (
    item.source === 'preset'
    && normalizeCharacterName(item.name) === normalizeCharacterName(sourceCharacter.name)
    && item.id !== sourceCharacter.id
  ));
  if (!targetCharacter) return null;
  const sourceConversationIds = store.conversations
    .filter(item => item.type === 'private' && item.memberIds?.[0] === sourceCharacter.id)
    .map(item => item.id);
  const targetConversation = store.conversations.find(item => item.type === 'private' && item.memberIds?.[0] === targetCharacter.id);
  return {
    sourceCharacter,
    targetCharacter,
    sourceConversationIds,
    targetConversationId: targetConversation?.id || `private:${targetCharacter.id}`,
    pairKey: pairKey(sourceCharacter.id, targetCharacter.id)
  };
}

export function getMigrationStats(candidate, store = loadAppStore()) {
  if (!candidate) return emptyStats();
  const sourceIds = new Set(candidate.sourceConversationIds || []);
  const sourceMessages = [...sourceIds].flatMap(id => Array.isArray(store.messages?.[id]) ? store.messages[id] : []);
  const groupMessages = store.conversations
    .filter(item => item.type === 'group' && item.memberIds?.includes(candidate.sourceCharacter.id))
    .flatMap(item => Array.isArray(store.messages?.[item.id]) ? store.messages[item.id] : [])
    .filter(message => message.speakerId === candidate.sourceCharacter.id);
  const ltm = exportLongTermMemory();
  const sourceMemories = (ltm.memories || []).filter(item => isCharacterMemory(item, candidate.sourceCharacter.id));
  const sourceMemoryIds = new Set(sourceMemories.map(item => item.id));
  const sourceEdges = (ltm.edges || []).filter(item => (
    isCharacterMemory(item, candidate.sourceCharacter.id)
    || (item.sourceMemoryIds || []).some(id => sourceMemoryIds.has(id))
  ));
  const relevantMessages = [...sourceMessages, ...groupMessages];
  const toolCallCount = relevantMessages.reduce((count, message) => count + countToolCalls(message), 0);
  const attachmentCount = relevantMessages.reduce((count, message) => count + countMessageAttachments(message), 0);
  return {
    privateConversations: sourceIds.size,
    messages: sourceMessages.length + groupMessages.length,
    toolCalls: toolCallCount,
    attachments: attachmentCount,
    memories: sourceMemories.length,
    memoryEdges: sourceEdges.length,
    groupConversations: store.conversations.filter(item => item.type === 'group' && item.memberIds?.includes(candidate.sourceCharacter.id)).length
  };
}

export async function runRoleMigration(candidate, options = {}) {
  if (activeMigration) throw new Error('角色迁移正在进行中。');
  if (!candidate?.sourceCharacter?.id || !candidate?.targetCharacter?.id) throw new Error('迁移目标角色不存在。');
  activeMigration = true;
  const sourceId = candidate.sourceCharacter.id;
  const targetId = candidate.targetCharacter.id;
  let state = {
    status: 'migrating',
    sourceCharacterId: sourceId,
    sourceCharacterName: candidate.sourceCharacter.name,
    targetCharacterId: targetId,
    targetCharacterName: candidate.targetCharacter.name,
    pairKey: pairKey(sourceId, targetId),
    startedAt: Date.now(),
    updatedAt: Date.now(),
    progress: 0,
    phase: 'backup',
    label: '正在导出迁移前备份',
    errorMessage: '',
    stats: emptyStats()
  };
  let backupCompleted = false;
  try {
    const backup = await exportArchiveZip({ onProgress: progress => {
      const transient = {
        ...state,
        progress: Math.min(0.2, Number(progress?.progress ?? progress) * 0.2),
        label: progress?.label || state.label,
        updatedAt: Date.now()
      };
      dispatchMigrationEvent(transient);
      options.onProgress?.(transient);
    }});
    backupCompleted = true;
    state = {
      ...state,
      backupFilename: backup.filename,
      backupCreatedAt: Date.now(),
      backupSize: backup.size,
      progress: 0.2,
      phase: 'statistics',
      label: '正在统计需要迁移的数据'
    };
    persistMigrationState(state);
    const storeBefore = loadAppStore();
    const resolvedCandidate = findRoleMigrationCandidate(storeBefore, {
      type: 'private',
      memberIds: [sourceId]
    });
    if (!resolvedCandidate || resolvedCandidate.targetCharacter.id !== targetId) {
      throw new Error('迁移期间角色数据发生变化，已停止迁移。');
    }
    const stats = getMigrationStats(resolvedCandidate, storeBefore);
    state = { ...state, stats, progress: 0.3, phase: 'merge', label: '正在合并聊天、工具调用和长期记忆' };
    persistMigrationState(state);
    options.onProgress?.(state);

    const mergeResult = buildMergedAppStore(storeBefore, resolvedCandidate);
    const memoryResult = mergeLongTermMemory(resolvedCandidate, mergeResult.messageIdMap);
    mergeMcpConversationSelection(resolvedCandidate);
    state = { ...state, progress: 0.72, phase: 'verify', label: '正在校验迁移结果' };
    persistMigrationState(state);
    options.onProgress?.(state);

    saveAppStore(mergeResult.store);
    verifyMergedAppStore(loadAppStore(), resolvedCandidate, mergeResult);
    verifyMergedLongTermMemory(resolvedCandidate, memoryResult);
    cleanupMcpConversationSelection(resolvedCandidate);
    removeLongTermMemoryCharacterData(sourceId);
    verifyNoSourceData(resolvedCandidate);

    state = {
      ...state,
      status: 'completed',
      progress: 1,
      phase: 'completed',
      label: '角色迁移已完成',
      completedAt: Date.now(),
      updatedAt: Date.now()
    };
    persistMigrationState(state);
    options.onProgress?.(state);
    return state;
  } catch (error) {
    const failed = {
      ...state,
      status: 'failed',
      phase: 'failed',
      label: '角色迁移失败',
      errorMessage: String(error?.message || error || '未知错误').slice(0, MAX_ERROR_LENGTH),
      updatedAt: Date.now()
    };
    if (backupCompleted) {
      try {
        persistMigrationState(failed);
      } catch (persistError) {
        console.warn('[role-migration] failed to persist failure state', persistError);
        dispatchMigrationEvent(failed);
      }
    }
    options.onProgress?.(failed);
    throw error;
  } finally {
    activeMigration = false;
  }
}

export function markRoleMigrationFailed(message) {
  const previous = getRoleMigrationState() || {};
  const failed = {
    ...previous,
    status: 'failed',
    phase: 'failed',
    label: '角色迁移失败',
    errorMessage: String(message || '角色迁移未完成。').slice(0, MAX_ERROR_LENGTH),
    updatedAt: Date.now()
  };
  persistMigrationState(failed);
  return failed;
}

export async function recoverRoleMigration(file, options = {}) {
  if (!file) throw new Error('请选择迁移前自动导出的 ZIP 存档。');
  try {
    const manifest = await importArchiveZipFile(file, { onProgress: progress => {
      const fraction = Math.max(0, Math.min(1, Number(progress?.progress ?? progress) || 0));
      const state = getRoleMigrationState() || {};
      dispatchMigrationEvent({
        ...state,
        status: 'recovering',
        phase: 'recovery',
        label: '正在恢复迁移前存档',
        progress: 0.2 + fraction * 0.8,
        updatedAt: Date.now()
      });
      options.onProgress?.(fraction);
    }});
    clearRoleMigrationState();
    return manifest;
  } catch (error) {
    markRoleMigrationFailed(`存档恢复失败：${error?.message || 'ZIP 存档无效。'}`);
    throw error;
  }
}

function buildMergedAppStore(store, candidate) {
  const next = structuredCloneSafe(store);
  const sourceId = candidate.sourceCharacter.id;
  const targetId = candidate.targetCharacter.id;
  const sourceConversationIds = new Set(candidate.sourceConversationIds || []);
  const targetConversationId = candidate.targetConversationId;
  const targetConversation = next.conversations.find(item => item.id === targetConversationId);
  const sourceConversations = next.conversations.filter(item => sourceConversationIds.has(item.id));
  const targetMessages = targetConversation ? (next.messages[targetConversationId] || []) : [];
  const sourceMessages = sourceConversations.flatMap(item => next.messages[item.id] || []);
  const messageIdMap = new Map();
  const mergedMessages = mergeMessages(
    targetMessages,
    sourceMessages,
    sourceId,
    targetId,
    candidate.targetCharacter.name,
    messageIdMap
  );
  if (targetConversation) {
    targetConversation.title = candidate.targetCharacter.name;
    targetConversation.avatar = candidate.targetCharacter.avatar;
    targetConversation.memberIds = [targetId];
    targetConversation.updatedAt = Math.max(targetConversation.updatedAt || 0, ...mergedMessages.map(item => item.createdAt || 0));
    targetConversation.createdAt = Math.min(targetConversation.createdAt || Date.now(), ...sourceConversations.map(item => item.createdAt || Date.now()));
    targetConversation.voiceReplyEnabled = Boolean(targetConversation.voiceReplyEnabled || sourceConversations.some(item => item.voiceReplyEnabled));
  } else {
    next.conversations.unshift({
      id: targetConversationId,
      type: 'private',
      title: candidate.targetCharacter.name,
      avatar: candidate.targetCharacter.avatar,
      memberIds: [targetId],
      createdAt: Math.min(...sourceConversations.map(item => item.createdAt || Date.now()), Date.now()),
      updatedAt: Math.max(...mergedMessages.map(item => item.createdAt || 0), Date.now()),
      voiceReplyEnabled: sourceConversations.some(item => item.voiceReplyEnabled)
    });
  }
  next.messages[targetConversationId] = mergedMessages;
  next.conversations = next.conversations
    .filter(item => !sourceConversationIds.has(item.id) || item.id === targetConversationId)
    .map(conversation => {
      if (conversation.type !== 'group' || !conversation.memberIds?.includes(sourceId)) return conversation;
      const memberIds = [...new Set(conversation.memberIds.map(id => id === sourceId ? targetId : id))];
      return { ...conversation, memberIds, updatedAt: Date.now() };
    });
  const nextMessages = { ...next.messages };
  sourceConversationIds.forEach(id => {
    if (id !== targetConversationId) delete nextMessages[id];
  });
  for (const conversation of next.conversations) {
    if (conversation.type !== 'group') continue;
    const list = Array.isArray(nextMessages[conversation.id]) ? nextMessages[conversation.id] : [];
    nextMessages[conversation.id] = list.map(message => message.speakerId === sourceId
      ? { ...message, speakerId: targetId, speakerName: candidate.targetCharacter.name }
      : message);
  }
  next.messages = nextMessages;
  next.characters = next.characters.filter(item => item.id !== sourceId);
  next.activeConversationId = next.activeConversationId && sourceConversationIds.has(next.activeConversationId)
    ? targetConversationId
    : next.activeConversationId;
  return { store: next, messageIdMap };
}

function mergeMessages(targetMessages, sourceMessages, sourceId, targetId, targetName, messageIdMap) {
  const result = [];
  const byId = new Map();
  const sourceMessageSet = new Set(sourceMessages);
  for (const message of [...targetMessages, ...sourceMessages]) {
    const normalized = {
      ...structuredCloneSafe(message),
      ...(message.speakerId === sourceId ? { speakerId: targetId } : {}),
      ...(message.speakerId === sourceId ? { speakerName: targetName } : {})
    };
    const existing = byId.get(normalized.id);
    if (existing) {
      if (sameMessage(existing, normalized)) {
        if (sourceMessageSet.has(message)) messageIdMap.set(message.id, existing.id);
        continue;
      }
      normalized.id = `${normalized.id}_migrated_${createId('message').slice(-8)}`;
    }
    if (normalized.speakerId === targetId) normalized.speakerName = normalized.speakerName || targetName;
    byId.set(normalized.id, normalized);
    result.push(normalized);
    if (sourceMessageSet.has(message)) messageIdMap.set(message.id, normalized.id);
  }
  return result.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

function mergeLongTermMemory(candidate, messageIdMap) {
  const sourceId = candidate.sourceCharacter.id;
  const targetId = candidate.targetCharacter.id;
  return migrateLongTermMemoryCharacterData(
    sourceId,
    targetId,
    candidate.targetCharacter.name,
    messageIdMap
  );
}

function mergeMcpConversationSelection(candidate) {
  const config = getMcpConfig();
  const sourceIds = candidate.sourceConversationIds || [];
  const targetId = candidate.targetConversationId;
  const selected = new Set(config.selectedClientIdsByConversation?.[targetId] || []);
  sourceIds.forEach(id => (config.selectedClientIdsByConversation?.[id] || []).forEach(value => selected.add(value)));
  saveMcpConfig({
    ...config,
    selectedClientIdsByConversation: {
      ...(config.selectedClientIdsByConversation || {}),
      [targetId]: [...selected]
    }
  });
}

function cleanupMcpConversationSelection(candidate) {
  const config = getMcpConfig();
  const next = { ...(config.selectedClientIdsByConversation || {}) };
  (candidate.sourceConversationIds || []).forEach(id => {
    if (id !== candidate.targetConversationId) delete next[id];
  });
  saveMcpConfig({ ...config, selectedClientIdsByConversation: next });
}

function verifyMergedAppStore(store, candidate, mergeResult) {
  const sourceId = candidate.sourceCharacter.id;
  const targetId = candidate.targetCharacter.id;
  if (store.characters.some(item => item.id === sourceId)) throw new Error('原角色仍存在，迁移未完成。');
  const target = store.characters.find(item => item.id === targetId);
  if (!target || target.source !== 'preset') throw new Error('内置角色基础信息校验失败。');
  const protectedFields = ['name', 'description', 'avatar', 'voiceSample', 'prompt', 'examples', 'source'];
  if (protectedFields.some(key => target[key] !== candidate.targetCharacter[key])
    || JSON.stringify(target.tags || []) !== JSON.stringify(candidate.targetCharacter.tags || [])) {
    throw new Error('内置角色设定发生变化，迁移已停止。');
  }
  if ((store.messages[candidate.targetConversationId] || []).length !== mergeResult.store.messages[candidate.targetConversationId].length) {
    throw new Error('聊天记录校验失败。');
  }
  for (const conversation of store.conversations.filter(item => item.type === 'group')) {
    if (conversation.memberIds?.includes(sourceId)) throw new Error('群聊成员校验失败。');
  }
}

function verifyMergedLongTermMemory(candidate, memoryResult) {
  if (!memoryResult.memoryIds.length) return;
  const current = exportLongTermMemory();
  const currentIds = new Set((current.memories || []).map(item => item.id));
  if (memoryResult.memoryIds.some(id => !currentIds.has(id))) {
    throw new Error('长期记忆校验失败。');
  }
}

function verifyNoSourceData(candidate) {
  const sourceId = candidate.sourceCharacter.id;
  const current = exportLongTermMemory();
  if ((current.memories || []).some(item => isCharacterMemory(item, sourceId))) throw new Error('长期记忆清理校验失败。');
  const config = getMcpConfig();
  if ((candidate.sourceConversationIds || []).some(id => config.selectedClientIdsByConversation?.[id])) {
    throw new Error('工具调用配置校验失败。');
  }
}

function persistMigrationState(state) {
  const normalized = normalizeMigrationState(state);
  try {
    localStorage.setItem(ROLE_MIGRATION_STATE_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.warn('[role-migration] failed to persist state', error);
    throw new Error('无法保存迁移状态，已停止迁移以保护数据。');
  }
  dispatchMigrationEvent(normalized);
  return normalized;
}

function savePreferences(value) {
  try {
    localStorage.setItem(ROLE_MIGRATION_PREFERENCE_KEY, JSON.stringify(value));
  } catch (error) {
    console.warn('[role-migration] failed to persist preferences', error);
  }
}

function dispatchMigrationEvent(detail) {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(new CustomEvent(ROLE_MIGRATION_EVENT, { detail }));
}

function normalizeMigrationState(raw = {}) {
  return {
    ...raw,
    status: ['migrating', 'recovering', 'failed', 'completed'].includes(raw.status) ? raw.status : 'failed',
    progress: Math.max(0, Math.min(1, Number(raw.progress) || 0)),
    phase: String(raw.phase || ''),
    label: String(raw.label || ''),
    errorMessage: String(raw.errorMessage || '').slice(0, MAX_ERROR_LENGTH),
    updatedAt: Number(raw.updatedAt) || Date.now()
  };
}

function normalizeCharacterName(value) {
  return String(value || '').trim().toLocaleLowerCase('zh-CN');
}

function pairKey(sourceId, targetId) {
  return sourceId && targetId ? `${sourceId}::${targetId}` : '';
}

function isCharacterMemory(item, characterId) {
  return item?.characterId === characterId || item?.scope === `private:${characterId}`;
}

function countToolCalls(message) {
  const calls = message?.meta?.toolTrace?.calls;
  return Array.isArray(calls) ? calls.length : 0;
}

function countMessageAttachments(message) {
  return (Array.isArray(message?.attachments) ? message.attachments.length : 0)
    + (Array.isArray(message?.meta?.toolOtherAttachments) ? message.meta.toolOtherAttachments.length : 0);
}

function sameMessage(left, right) {
  return left.role === right.role
    && left.speakerId === right.speakerId
    && left.text === right.text
    && left.createdAt === right.createdAt
    && left.status === right.status
    && JSON.stringify(left.attachments || []) === JSON.stringify(right.attachments || [])
    && JSON.stringify(left.meta || {}) === JSON.stringify(right.meta || {});
}

function emptyStats() {
  return {
    privateConversations: 0,
    messages: 0,
    toolCalls: 0,
    attachments: 0,
    memories: 0,
    memoryEdges: 0,
    groupConversations: 0
  };
}
