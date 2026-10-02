// Stable JSON makes hashes independent of insertion order and display format.
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export async function digestText(text) {
  const bytes = new TextEncoder().encode(text);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function snapshotRecords(snapshot) {
  const records = {};
  for (const [key, value] of Object.entries(snapshot.localStorage || {})) {
    if (key === 'fritia_archive_sync') continue;
    let parsed;
    try { parsed = JSON.parse(value); } catch { /* opaque setting */ }
    if (key === 'fritia_next_chat_store' && parsed) {
      const { characters = [], conversations = [], messages = {}, activeConversationId, updatedAt, ...meta } = parsed;
      records['app/meta'] = meta;
      for (const item of characters) records[`app/characters/${encodeURIComponent(item.id)}`] = item;
      for (const item of conversations) records[`app/conversations/${encodeURIComponent(item.id)}`] = item;
      for (const [id, list] of Object.entries(messages)) for (const item of list) {
        // An unfinished response is device runtime state, not a completed record.
        if (item.status !== 'typing') records[`app/messages/${encodeURIComponent(id)}/${encodeURIComponent(item.id)}`] = item;
      }
    } else if (key === 'fritia_long_term_memory' && parsed) {
      const { memories = [], edges = [], deletedIds, updatedAt, ...meta } = parsed;
      records['memory/meta'] = meta;
      for (const item of memories) records[`memory/memories/${encodeURIComponent(item.id)}`] = item;
      for (const item of edges) records[`memory/edges/${encodeURIComponent(item.id)}`] = item;
      // Keep tombstones as records, but never let them erase another device's memory.
      records['memory/deletedIds'] = deletedIds || [];
    } else records[`local/${encodeURIComponent(key)}`] = value;
  }
  for (const [db, stores] of Object.entries(snapshot.indexedDb || {})) for (const [store, rows] of Object.entries(stores)) {
    records[`idb-meta/${db}/${store}`] = true;
    for (const row of rows) records[`idb/${db}/${store}/${encodeURIComponent(row.id ?? row.kbId)}`] = row;
  }
  return records;
}

export function recordsSnapshot(records, current = {}) {
  const snapshot = { version: 1, exportedAt: Date.now(), localStorage: {}, indexedDb: {} };
  let app = null, memory = null;
  let currentApp = {};
  try { currentApp = JSON.parse(current.localStorage?.fritia_next_chat_store || '{}'); } catch { /* empty */ }
  for (const [key, value] of Object.entries(records)) {
    const parts = key.split('/');
    if (parts[0] === 'local') snapshot.localStorage[decodeURIComponent(parts[1])] = value;
    if (parts[0] === 'app') {
      app ||= { characters: [], conversations: [], messages: {}, activeConversationId: currentApp.activeConversationId || '', updatedAt: Date.now() };
      if (parts[1] === 'meta') Object.assign(app, value);
      else if (parts[1] === 'messages') (app.messages[decodeURIComponent(parts[2])] ||= []).push(value);
      else app[parts[1]].push(value);
    }
    if (parts[0] === 'memory') {
      memory ||= { memories: [], edges: [], deletedIds: [], updatedAt: Date.now() };
      if (parts[1] === 'meta') Object.assign(memory, value);
      else if (parts[1] === 'deletedIds') memory.deletedIds = value;
      else memory[parts[1]].push(value);
    }
    if (parts[0] === 'idb' || parts[0] === 'idb-meta') {
      snapshot.indexedDb[parts[1]] ||= {};
      snapshot.indexedDb[parts[1]][parts[2]] ||= [];
      if (parts[0] === 'idb') snapshot.indexedDb[parts[1]][parts[2]].push(value);
    }
  }
  if (app) {
    for (const [id, messages] of Object.entries(app.messages)) {
      for (const item of currentApp.messages?.[id] || []) if (item.status === 'typing' && !messages.some(message => message.id === item.id)) messages.push(item);
      messages.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    }
    snapshot.localStorage.fritia_next_chat_store = JSON.stringify(app);
  }
  if (memory) {
    const live = new Set([...memory.memories, ...memory.edges].map(item => item.id));
    memory.deletedIds = memory.deletedIds.filter(id => !live.has(id));
    snapshot.localStorage.fritia_long_term_memory = JSON.stringify(memory);
  }
  return snapshot;
}

export function mergeRecords(base = {}, local = {}, remote = {}, choices = {}) {
  const records = {}, conflicts = [];
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const l = local[key], r = remote[key], b = base[key];
    if (r === undefined) records[key] = l;
    else if (l === undefined || stableJson(l) === stableJson(r)) records[key] = r;
    else if (b !== undefined && stableJson(l) === stableJson(b)) records[key] = r;
    else if (b !== undefined && stableJson(r) === stableJson(b)) records[key] = l;
    else {
      conflicts.push({ path: key, local: l, remote: r });
      records[key] = choices[key] === 'remote' ? r : l;
    }
  }
  return { records, conflicts };
}
