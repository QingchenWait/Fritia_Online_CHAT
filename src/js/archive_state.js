// Separate from exported user databases: target-scoped baselines, immutable
// blob cache and recovery snapshots must not recursively sync themselves.
function openState() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fritia_archive_state', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function archiveState(key, value) {
  const db = await openState();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('state', arguments.length > 1 ? 'readwrite' : 'readonly');
      const store = tx.objectStore('state');
      const request = arguments.length > 1 ? store.put(value, key) : store.get(key);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('同步恢复数据无法持久化'));
    });
  } finally { db.close(); }
}

export async function saveRecovery(snapshots, label) {
  const id = `recovery-${Date.now()}-${crypto.randomUUID()}`;
  const entry = { id, at: Date.now(), label, snapshots };
  const db = await openState();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      const store = tx.objectStore('state');
      const request = store.get('recoveries');
      request.onsuccess = () => {
        store.put(entry, id);
        store.put([{ id, at: entry.at, label }, ...(request.result || [])], 'recoveries');
      };
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('无法保存恢复副本，已停止修改本地数据'));
    });
  } finally { db.close(); }
  return id;
}

export async function getSyncDevice() {
  let device = await archiveState('device');
  if (!device) {
    device = { id: crypto.randomUUID(), name: /Android/i.test(navigator.userAgent) ? 'Android' : /Windows/i.test(navigator.userAgent) ? 'Windows' : '浏览器' };
    await archiveState('device', device);
  }
  return device;
}

// Recovery snapshots own their data; never remove live stores, sync caches or
// cloud files. Index membership and the stored identity must both match.
export async function deleteRecovery(id) {
  if (typeof id !== 'string' || !/^recovery-\d+-[a-f0-9-]{36}$/.test(id)) throw new Error('恢复副本标识无效，未删除数据');
  const db = await openState();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      const store = tx.objectStore('state');
      let deleted = false, failure;
      const index = store.get('recoveries');
      index.onsuccess = () => {
        if (!Array.isArray(index.result)) return;
        const matches = index.result.filter(item => item.id === id);
        if (!matches.length) return;
        const entry = store.get(id);
        entry.onsuccess = () => {
          if (matches.length !== 1 || !entry.result || entry.result.id !== id
            || entry.result.at !== matches[0].at || !entry.result.snapshots) {
            failure = new Error('恢复副本索引与数据不一致，未删除任何数据');
            tx.abort(); return;
          }
          try {
            store.delete(id);
            store.put(index.result.filter(item => item.id !== id), 'recoveries');
            deleted = true;
          } catch (error) {
            failure = error;
            try { tx.abort(); } catch { /* Already aborted. */ }
          }
        };
      };
      tx.oncomplete = () => resolve(deleted);
      tx.onerror = tx.onabort = () => reject(failure || tx.error || new Error('删除恢复副本失败，事务已回滚'));
    });
  } finally { db.close(); }
}
