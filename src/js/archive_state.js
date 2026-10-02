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
