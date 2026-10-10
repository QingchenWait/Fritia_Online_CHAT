import { STORAGE_KEYS } from './storage.js';
import { deleteMediaIfUnreferenced, isMediaRef } from './media_store.js';
import { isFailedTurnMessage } from './failed_turns.js';

// Work on raw records. Normalization/graph maintenance could rewrite unrelated
// data, so neither is part of this narrowly scoped deletion operation.
export function planMessageDeletion(app, memory, conversationId, messageIds, otherData = []) {
  const conversation = app.conversations?.find(item => item.id === conversationId && item.type === 'private');
  if (!conversation || !Array.isArray(app.messages?.[conversationId])) throw new Error('私聊记录不存在，未执行删除。');
  const requested = new Set(messageIds);
  const selected = app.messages[conversationId].filter(item => requested.has(item.id));
  const ids = new Set(selected.map(item => item.id));
  if (ids.size !== selected.length) throw new Error('选中记录存在重复消息 ID，无法安全区分，未执行删除。');
  const nextApp = structuredClone(app);
  nextApp.messages[conversationId] = nextApp.messages[conversationId].filter(item => !ids.has(item.id));
  const remaining = Object.values(nextApp.messages).flat();
  const ambiguousIds = new Set(remaining.map(item => item.id));
  const { memories: _memories, edges: _edges, deletedIds: _deleted, ...memoryMetadata } = memory || {};
  const protectedText = JSON.stringify([nextApp, memoryMetadata, ...otherData]);
  const memories = memory?.memories;
  const edges = memory?.edges;
  const candidates = new Set();
  if (Array.isArray(memories) && Array.isArray(edges)) {
    for (const item of memories) {
      const sources = item.sourceMessageIds;
      // The existing private-chat extractor normalizes source="private" to daily.
      if (item.id && ['daily', 'private'].includes(item.source) && item.characterId === conversation.memberIds?.[0]
        && item.scope === `private:${conversation.memberIds[0]}`
        // normalizeIdList historically caps provenance at 30; a full list
        // may have omitted older sources and is therefore not exclusive proof.
        && Array.isArray(sources) && sources.length > 0 && sources.length < 30
        && sources.every(id => ids.has(id) && !ambiguousIds.has(id))
        && !protectedText.includes(item.id)) candidates.add(item.id);
    }
    // A shared/unknown edge is kept in its entirety, together with its source
    // memories. Do not change the meaning of a surviving relationship.
    let changed = true;
    while (changed) {
      changed = false;
      const retainedRecords = JSON.stringify([memories.filter(item => !candidates.has(item.id)),
        edges.filter(edge => !Array.isArray(edge.sourceMemoryIds) || !edge.sourceMemoryIds.length || edge.sourceMemoryIds.some(id => !candidates.has(id)))]);
      for (const edge of edges) {
        const sources = edge.sourceMemoryIds;
        if (!Array.isArray(sources) || !sources.length) {
          // An older/unknown relationship has no provable ownership.
          if (candidates.size) { candidates.clear(); changed = true; }
          continue;
        }
        if (sources.some(id => !candidates.has(id)) || protectedText.includes(edge.id) || retainedRecords.includes(edge.id)) {
          for (const id of Array.isArray(sources) ? sources : []) {
            if (candidates.delete(id)) changed = true;
          }
        }
      }
      for (const item of memories) {
        if (candidates.has(item.id)) continue;
        const text = JSON.stringify(item);
        for (const id of candidates) if (text.includes(id)) { candidates.delete(id); changed = true; }
      }
      for (const id of candidates) if (retainedRecords.includes(id)) { candidates.delete(id); changed = true; }
    }
  }
  const nextMemory = memory ? structuredClone(memory) : null;
  const deletedEdges = Array.isArray(edges) ? edges.filter(edge => Array.isArray(edge.sourceMemoryIds)
    && edge.sourceMemoryIds.length && edge.sourceMemoryIds.every(id => candidates.has(id)) && !protectedText.includes(edge.id)) : [];
  if (candidates.size) {
    nextMemory.memories = memories.filter(item => !candidates.has(item.id));
    nextMemory.edges = edges.filter(item => !deletedEdges.includes(item));
    nextMemory.deletedIds = [...new Set([...(memory.deletedIds || []), ...candidates, ...deletedEdges.map(item => item.id)])];
    nextMemory.updatedAt = Date.now();
  }
  const refs = new Set();
  collectMediaRefs(selected, refs);
  const retainedText = JSON.stringify([nextApp, nextMemory, ...otherData]);
  return { app: nextApp, memory: nextMemory, count: selected.length, memoryCount: candidates.size,
    mediaRefs: [...refs].filter(ref => !retainedText.includes(ref)), retainedMediaCount: [...refs].filter(ref => retainedText.includes(ref)).length };
}

function collectMediaRefs(value, refs) {
  if (typeof value === 'string') {
    if (isMediaRef(value)) refs.add(value);
    // Tool results can contain JSON/text references outside attachment fields.
    for (const match of value.matchAll(/idb-media:[a-zA-Z0-9_-]+/g)) refs.add(match[0]);
  } else if (Array.isArray(value)) value.forEach(item => collectMediaRefs(item, refs));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => collectMediaRefs(item, refs));
}

function otherLocalData() {
  const values = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key !== STORAGE_KEYS.app && key !== STORAGE_KEYS.longTermMemory) values.push(localStorage.getItem(key));
  }
  return values;
}

export async function deleteSelectedPrivateMessages(conversationId, messageIds, runtimeStore, isBusy = () => false) {
  if (isBusy() || Object.values(runtimeStore?.messages || {}).flat().some(item => item.status === 'typing')) {
    throw new Error('请等待正在进行的对话、语音或工具调用结束，再删除消息。');
  }
  const appRaw = localStorage.getItem(STORAGE_KEYS.app);
  if (!appRaw) throw new Error('无法读取聊天存储，未执行删除。');
  const memoryRaw = localStorage.getItem(STORAGE_KEYS.longTermMemory);
  const app = JSON.parse(appRaw);
  // A damaged memory store is a reason to retain ancillary data, never to reset it.
  let memory = null;
  try { memory = memoryRaw ? JSON.parse(memoryRaw) : null; } catch { /* retain all media as well */ }
  const runtimeProtected = structuredClone(runtimeStore || app);
  const requested = new Set(messageIds);
  runtimeProtected.messages[conversationId] = (runtimeProtected.messages[conversationId] || []).filter(item => !requested.has(item.id));
  const plan = planMessageDeletion(app, memory, conversationId, messageIds, [...otherLocalData(), runtimeProtected]);
  if (memoryRaw && !memory) plan.mediaRefs = [];
  if (localStorage.getItem(STORAGE_KEYS.app) !== appRaw || localStorage.getItem(STORAGE_KEYS.longTermMemory) !== memoryRaw) {
    throw new Error('记录已发生变化，请重新选择后删除。');
  }
  // Synchronous commit; write failures restore the original records before any
  // media deletion or notifications. No archive, knowledge or filesystem wipe.
  const memoryChanged = plan.memoryCount > 0;
  if (memoryChanged) localStorage.setItem(STORAGE_KEYS.longTermMemory, JSON.stringify(plan.memory));
  try { localStorage.setItem(STORAGE_KEYS.app, JSON.stringify(plan.app)); }
  catch (error) {
    if (memoryChanged) localStorage.setItem(STORAGE_KEYS.longTermMemory, memoryRaw);
    throw error;
  }
  const selectedIds = new Set(messageIds);
  const runtime = structuredClone(plan.app);
  // Rebase on the latest persisted data; preserve only registered transient
  // failures from the UI so an older tab cannot replace newer surviving rows.
  for (const [id, messages] of Object.entries(runtimeStore?.messages || {})) {
    if (!runtime.messages[id]) continue;
    for (const message of messages) {
      if (id === conversationId && selectedIds.has(message.id)) continue;
      if (!runtime.messages[id].some(item => item.id === message.id) && isFailedTurnMessage(message, id)) runtime.messages[id].push(structuredClone(message));
    }
  }
  document.dispatchEvent(new CustomEvent('fritia-next-chat-store-updated', { detail: runtime }));
  if (memoryChanged) document.dispatchEvent(new CustomEvent('fritia-long-term-memory-updated'));
  let retained = plan.retainedMediaCount;
  for (const ref of plan.mediaRefs) {
    try {
      const removed = await deleteMediaIfUnreferenced(ref, () => {
        // Recheck immediately in the deletion transaction's task. Newly sent
        // messages, stickers, role media, memory and all other local records win.
        for (let index = 0; index < localStorage.length; index++) {
          if (localStorage.getItem(localStorage.key(index))?.includes(ref)) return false;
        }
        return !JSON.stringify(runtime.messages).includes(ref);
      });
      if (!removed) retained++;
    } catch (error) { retained++; console.warn('[conversation-management] retained media', error); }
  }
  return { ...plan, retainedMediaCount: retained, runtime };
}
