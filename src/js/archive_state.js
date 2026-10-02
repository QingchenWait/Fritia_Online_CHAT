// Separate from exported user databases: target-scoped baselines, immutable
// blob cache and recovery snapshots must not recursively sync themselves.
export const RECOVERY_LIMITS = Object.freeze([5, 10, 20, 40]);
const RECOVERY_LIMIT_KEY = 'recovery-limit';
const RECOVERY_ID = /^recovery-\d+-[a-f0-9-]{36}$/;
function normalizeRecoveryLimit(value) {
  if (value === undefined) return 20;
  if (!RECOVERY_LIMITS.includes(value)) throw new Error('恢复副本数量设置无效，未执行清理；请重新选择数量');
  return value;
}

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
  let id;
  const db = await openState();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      const store = tx.objectStore('state');
      const request = store.get('recoveries'), limitRequest = store.get(RECOVERY_LIMIT_KEY);
      let failure;
      const abort = message => {
        failure = message instanceof Error ? message : new Error(message);
        try { tx.abort(); } catch { /* Already aborted. */ }
      };
      limitRequest.onsuccess = () => {
        try {
          const at = Date.now();
          id = `recovery-${at}-${crypto.randomUUID()}`;
          const entry = { id, at, label, snapshots };
          const previous = request.result ?? [];
          if (!Array.isArray(previous)) throw new Error('恢复副本索引无效，未删除数据');
          const seen = new Set([id]);
          for (const item of previous) {
            if (!item || typeof item.id !== 'string' || !RECOVERY_ID.test(item.id) || seen.has(item.id)
              || !Number.isSafeInteger(item.at) || item.at < 0) throw new Error('恢复副本索引标识或时间异常，未删除数据');
            seen.add(item.id);
          }
          const list = [{ id, at: entry.at, label }, ...previous];
          // Stable ordering: equal timestamps keep the newest insertion first.
          const oldest = [...list].sort((a,b) => b.at - a.at).slice(normalizeRecoveryLimit(limitRequest.result));
          if (oldest.some(item => item.id === id)) throw new Error('设备时间早于已有恢复副本，无法安全清理；未删除数据，请校正时间后重试');
          const removals = new Set(oldest.map(item => item.id));
          const commit = () => {
            try {
              // The new snapshot and every deletion either all commit or all roll back.
              store.put(entry, id);
              store.put(list.filter(item => !removals.has(item.id)), 'recoveries');
            } catch (error) { abort(error); }
          };
          if (!oldest.length) { commit(); return; }
          let next = 0;
          // Read one snapshot at a time: old recovery payloads can be large.
          const removeNext = () => {
            const item = oldest[next++];
            const read = store.get(item.id);
            read.onsuccess = () => {
              const value = read.result;
              if (!value || value.id !== item.id || value.at !== item.at
                || !value.snapshots || typeof value.snapshots !== 'object' || Array.isArray(value.snapshots)) {
                abort('最旧恢复副本的索引与快照不一致，未删除数据'); return;
              }
              try {
                store.delete(item.id);
                read.onsuccess = null;
                if (next === oldest.length) commit();
                else removeNext();
              } catch (error) { abort(error); }
            };
          };
          removeNext();
        } catch (error) { abort(error); }
      };
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(failure || tx.error || new Error('无法保存恢复副本，已停止修改本地数据'));
    });
  } finally { db.close(); }
  notifyRecoveriesChanged();
  return id;
}

export async function getRecoveryLimit() {
  return normalizeRecoveryLimit(await archiveState(RECOVERY_LIMIT_KEY));
}

export async function setRecoveryLimit(value) {
  const limit = Number(value);
  if (!RECOVERY_LIMITS.includes(limit)) throw new Error('最大恢复副本数量只能为 5、10、20 或 40');
  await archiveState(RECOVERY_LIMIT_KEY, limit);
  notifyRecoveriesChanged();
  return limit;
}

function notifyRecoveriesChanged() {
  if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('fritia-archive-recoveries-updated'));
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
  if (typeof id !== 'string' || !RECOVERY_ID.test(id)) throw new Error('恢复副本标识无效，未删除数据');
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
