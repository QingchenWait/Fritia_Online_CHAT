import { STORAGE_KEYS } from './storage.js';
import { isBuiltinCharacter } from './characters.js';
import { deleteMediaIfUnreferenced } from './media_store.js';
import { isFailedTurnMessage } from './failed_turns.js';

const textOf = value => JSON.stringify(value) || '';
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const validId = id => typeof id === 'string' && id.length > 0;
const provenRecordId = id => typeof id === 'string' && /^[a-zA-Z0-9:_-]+$/.test(id);

// Pure plan over raw records: no normalization, name matching, graph rebuild,
// filesystem deletion, database clearing or deletion of archive snapshots.
export function planCharacterDeletion(app, memory, characterId, otherData = []) {
  if (!validId(characterId) || !Array.isArray(app?.characters) || !Array.isArray(app.conversations)
    || !app.messages || typeof app.messages !== 'object' || Array.isArray(app.messages)) throw new Error('角色存储结构异常，未执行删除。');
  const matches = app.characters.filter(item => item?.id === characterId);
  if (matches.length !== 1) throw new Error('角色不存在或 ID 重复，无法安全区分，未执行删除。');
  const character = matches[0];
  if (isBuiltinCharacter(character)) throw new Error('内置角色不能删除。');
  const conversationIds = new Set();
  for (const conversation of app.conversations) {
    if (!validId(conversation?.id) || conversationIds.has(conversation.id)) throw new Error('会话 ID 缺失或重复，未执行删除。');
    conversationIds.add(conversation.id);
  }
  const owned = app.conversations.filter(item => Array.isArray(item.memberIds) && item.memberIds.includes(characterId));
  if (owned.some(item => item.type !== 'private' || item.memberIds.length !== 1)) {
    throw new Error('此角色仍被群聊或共享会话引用。请先从这些会话中移除该角色，再删除；未修改任何数据。');
  }
  const ids = new Set(owned.map(item => item.id));
  // A canonical bucket assigned to somebody else is ambiguous legacy data.
  if (hasOwn(app.messages, `private:${characterId}`) && !ids.has(`private:${characterId}`)) throw new Error('角色私聊归属不明确，未执行删除。');
  for (const id of ids) {
    if (hasOwn(app.messages, id) && !Array.isArray(app.messages[id])) throw new Error('私聊消息结构异常，未执行删除。');
  }
  const nextApp = structuredClone(app);
  nextApp.characters = nextApp.characters.filter(item => item.id !== characterId);
  nextApp.conversations = nextApp.conversations.filter(item => !ids.has(item.id));
  for (const id of ids) delete nextApp.messages[id];
  if (ids.has(nextApp.activeConversationId)) nextApp.activeConversationId = nextApp.conversations[0]?.id || '';
  if (Object.values(nextApp.messages).some(list => Array.isArray(list) && list.some(item => item?.speakerId === characterId))) {
    throw new Error('其他会话仍包含此角色发言，无法安全解耦，未执行删除。');
  }
  // Surviving records may reference an entire conversation. Keep the role and
  // its bucket if that relationship cannot be separated without editing them.
  const survivors = textOf(nextApp);
  if (survivors.includes(textOf(characterId))) throw new Error('其他记录仍引用此角色，无法安全解耦，未执行删除。');
  if ([...ids].some(id => survivors.includes(id))) throw new Error('其他记录仍引用此私聊，无法安全解耦，未执行删除。');
  const selected = owned.flatMap(item => app.messages[item.id] || []);
  const selectedIds = new Set(selected.map(item => item?.id).filter(validId));
  const remainingIds = new Set(Object.values(nextApp.messages).flatMap(list => Array.isArray(list) ? list.map(item => item?.id) : []));
  const protectedText = textOf([nextApp, ...otherData]);
  const nextMemory = memory ? structuredClone(memory) : memory;
  const candidates = new Set();
  const edgesToDelete = new Set();
  if (Array.isArray(memory?.memories) && Array.isArray(memory.edges)
    && (memory.deletedIds === undefined || Array.isArray(memory.deletedIds))) {
    const records = [...memory.memories, ...memory.edges];
    const counts = new Map();
    for (const record of records) counts.set(record?.id, (counts.get(record?.id) || 0) + 1);
    const { memories, edges, deletedIds, ...metadata } = memory;
    const protectedRecords = protectedText + textOf(metadata);
    for (const item of memories) {
      const sources = item?.sourceMessageIds;
      if (provenRecordId(item?.id) && counts.get(item.id) === 1 && item.characterId === characterId
        && item.scope === `private:${characterId}` && ['daily', 'private'].includes(item.source)
        && Array.isArray(sources) && sources.length > 0 && sources.length < 30
        && sources.every(id => selectedIds.has(id) && !remainingIds.has(id))
        && !protectedRecords.includes(item.id)) candidates.add(item.id);
    }
    // Unknown provenance and links to surviving records always win. Iterate
    // to closure so chains/cycles cannot leave dangling retained references.
    let changed = true;
    while (changed) {
      const before = textOf([...candidates]);
      edgesToDelete.clear();
      for (const edge of edges) {
        if (provenRecordId(edge?.id) && counts.get(edge.id) === 1 && edge.scope === `private:${characterId}`
          && edge.characterId === characterId && Array.isArray(edge.sourceMemoryIds) && edge.sourceMemoryIds.length > 0
          && edge.sourceMemoryIds.length < 30 && edge.sourceMemoryIds.every(id => candidates.has(id))
          && !protectedRecords.includes(edge.id)) edgesToDelete.add(edge.id);
      }
      const retained = records.filter(item => !candidates.has(item?.id) && !edgesToDelete.has(item?.id));
      const retainedText = textOf(retained);
      if (edges.some(edge => !Array.isArray(edge?.sourceMemoryIds) || !edge.sourceMemoryIds.length)) candidates.clear();
      for (const id of candidates) if (retainedText.includes(id)) candidates.delete(id);
      // An edge can itself be referenced by another retained record.
      for (const edge of edges) if (edgesToDelete.has(edge?.id) && retainedText.includes(edge.id)) {
        for (const id of edge.sourceMemoryIds) candidates.delete(id);
      }
      changed = before !== textOf([...candidates]);
    }
    if (candidates.size) {
      nextMemory.memories = memories.filter(item => !candidates.has(item?.id));
      nextMemory.edges = edges.filter(item => !edgesToDelete.has(item?.id));
      nextMemory.deletedIds = [...new Set([...(Array.isArray(deletedIds) ? deletedIds : []), ...candidates, ...edgesToDelete])];
      nextMemory.updatedAt = Date.now();
    }
  }
  const refs = new Set();
  collectMediaRefs([character, owned, selected, memory?.memories?.filter(item => candidates.has(item?.id)), memory?.edges?.filter(item => edgesToDelete.has(item?.id))], refs);
  const retainedText = textOf([nextApp, nextMemory, ...otherData]);
  return { app: nextApp, memory: nextMemory, conversationIds: [...ids], messageIds: [...selectedIds], memoryCount: candidates.size,
    mediaRefs: [...refs].filter(ref => !retainedText.includes(ref)), count: selected.length };
}

function collectMediaRefs(value, refs) {
  if (typeof value === 'string') {
    // Do not accept a prefix of an unknown/custom ID (foo.bar must never cause
    // deletion of the unrelated media key foo). Quoted tool-result references
    // are supported; ambiguous bare prose is deliberately left on disk.
    if (/^idb-media:[a-zA-Z0-9_-]+$/.test(value)) refs.add(value);
    for (const match of value.matchAll(/["'](idb-media:[a-zA-Z0-9_-]+)["']/g)) refs.add(match[1]);
  } else if (Array.isArray(value)) value.forEach(item => collectMediaRefs(item, refs));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => collectMediaRefs(item, refs));
}

function localRecords() {
  const result = new Map();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    result.set(key, localStorage.getItem(key));
  }
  return result;
}

// Read existing stores only. Unknown databases or a read failure mean retaining
// all ancillary records. Archive snapshots/cache contain their own media copies.
async function readProtectedDatabases() {
  if (!indexedDB.databases) throw new Error('无法完整核对共享数据');
  const names = (await indexedDB.databases()).map(item => item.name);
  const known = ['fritia_media_store', 'fritia_knowledge_base_db', 'fritia_archive_state', 'fritia_attachment_inputs', 'fritia_announcement_board'];
  if (names.some(name => !known.includes(name))) throw new Error('存在未知数据存储');
  const values = [];
  for (const name of names.filter(name => name !== 'fritia_archive_state')) {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => { request.transaction.abort(); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      values.push(...await new Promise((resolve, reject) => {
        const tx = db.transaction([...db.objectStoreNames], 'readonly');
        const reads = [...db.objectStoreNames].map(store => tx.objectStore(store).getAll());
        tx.oncomplete = () => resolve(reads.flatMap(read => read.result));
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('共享数据读取失败'));
      }));
    } finally { db.close(); }
  }
  return values;
}

export async function deleteSelectedCharacter(characterId, expectedCharacter, getRuntime, isBusy) {
  const remove = async () => {
    if (isBusy()) throw new Error('请等待正在进行的对话、语音或工具调用结束，再删除角色。');
    let protectedDb = [], verified = true;
    try { protectedDb = await readProtectedDatabases(); } catch { verified = false; }
    if (isBusy()) throw new Error('请等待当前对话结束后再删除角色。');
    const originals = localRecords();
    const app = JSON.parse(originals.get(STORAGE_KEYS.app) || 'null');
    if (textOf(app?.characters?.find(item => item.id === characterId)) !== textOf(expectedCharacter)) throw new Error('角色信息已变化，请关闭窗口后重新选择。');
    const memoryRaw = originals.get(STORAGE_KEYS.longTermMemory);
    let memory = null;
    try { memory = memoryRaw ? JSON.parse(memoryRaw) : null; } catch { verified = false; }
    if (memoryRaw && (!Array.isArray(memory?.memories) || !Array.isArray(memory?.edges)
      || (memory.deletedIds !== undefined && !Array.isArray(memory.deletedIds)))) verified = false;
    // Exclude just the explicitly owned per-conversation MCP selections. Global
    // MCP logs lack provenance and must stay intact, including same-name calls.
    const mcpKey = 'fritia_mcp_tool_config';
    const runtime = getRuntime();
    if (runtime?.characters?.some(item => !app?.characters?.some(record => record.id === item.id))
      || runtime?.conversations?.some(item => !app?.conversations?.some(record => record.id === item.id))) {
      throw new Error('角色或会话尚未保存或已变化，请刷新核对后再删除。');
    }
    // A runtime-only normal message is not disposable. A newer persisted store
    // can replace a stale view, but never erase an unsaved normal UI record.
    for (const [id, messages] of Object.entries(runtime?.messages || {})) {
      for (const message of Array.isArray(messages) ? messages : []) {
        if (!app?.messages?.[id]?.some(item => item.id === message.id) && !isFailedTurnMessage(message, id)) throw new Error('存在尚未保存的对话记录，请等待保存完成后再删除。');
      }
    }
    const preliminary = planCharacterDeletion(app, null, characterId);
    let mcp = null, mcpChanged = false;
    try {
      mcp = JSON.parse(originals.get(mcpKey) || 'null');
      for (const id of preliminary.conversationIds) if (mcp?.selectedClientIdsByConversation && hasOwn(mcp.selectedClientIdsByConversation, id)) {
        delete mcp.selectedClientIdsByConversation[id]; mcpChanged = true;
      }
    } catch { /* Retain unreadable global configuration. */ }
    const runtimeProtected = planCharacterDeletion(runtime, null, characterId).app;
    const others = [...originals].filter(([key]) => key !== STORAGE_KEYS.app && key !== STORAGE_KEYS.longTermMemory)
      .map(([key, value]) => key === mcpKey && mcpChanged ? mcp : value);
    const plan = planCharacterDeletion(app, verified ? memory : null, characterId, [...others, runtimeProtected, ...protectedDb]);
    if (!verified) plan.mediaRefs = [];
    // No await from this comparison through the localStorage commit. On quota
    // failure restore every completed write, before deleting any media.
    if (textOf([...localRecords()]) !== textOf([...originals])) throw new Error('数据已变化，未执行删除，请重新选择。');
    const writes = [];
    if (plan.memoryCount) writes.push([STORAGE_KEYS.longTermMemory, textOf(plan.memory)]);
    if (mcpChanged) writes.push([mcpKey, textOf(mcp)]);
    writes.push([STORAGE_KEYS.app, textOf(plan.app)]);
    const committed = [];
    try {
      for (const [key, value] of writes) { localStorage.setItem(key, value); committed.push(key); }
    } catch (error) {
      for (const key of committed.reverse()) localStorage.setItem(key, originals.get(key));
      throw error;
    }
    const nextRuntime = structuredClone(plan.app);
    for (const [id, messages] of Object.entries(runtime.messages || {})) {
      if (!Array.isArray(nextRuntime.messages[id])) continue;
      for (const message of messages) if (isFailedTurnMessage(message, id) && !nextRuntime.messages[id].some(item => item.id === message.id)) nextRuntime.messages[id].push(structuredClone(message));
    }
    document.dispatchEvent(new CustomEvent('fritia-next-chat-store-updated', { detail: nextRuntime }));
    if (plan.memoryCount) document.dispatchEvent(new CustomEvent('fritia-long-term-memory-updated'));
    if (mcpChanged) document.dispatchEvent(new CustomEvent('fritia-mcp-config-updated'));
    // Re-read DB references after notification listeners and before each exact
    // media-key removal. Failed verification means a retained orphan, never loss.
    let removedMedia = 0;
    for (const ref of plan.mediaRefs) {
      try {
        const protectedNow = await readProtectedDatabases();
        if (textOf(protectedNow).includes(ref)) continue;
        if (await deleteMediaIfUnreferenced(ref, () => !textOf([...localRecords(), getRuntime()]).includes(ref))) removedMedia++;
      } catch { /* Keep the original bytes if any guard fails. */ }
    }
    return { ...plan, removedMedia };
  };
  return navigator.locks ? navigator.locks.request('fritia-archive-sync', remove) : remove();
}
