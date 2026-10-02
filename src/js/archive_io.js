const pending = new Map();

function androidCall(method, request) {
  const token = crypto.randomUUID();
  window.__FRITIA_ARCHIVE_CALLBACK__ ||= (id, raw) => {
    const call = pending.get(id);
    if (!call) return;
    pending.delete(id);
    try { const result = typeof raw === 'string' ? JSON.parse(raw) : raw; result.error ? call.reject(new Error(result.error)) : call.resolve(result); }
    catch (error) { call.reject(error); }
  };
  return new Promise((resolve, reject) => {
    pending.set(token, { resolve, reject });
    try { window.FritiaArchive[method](JSON.stringify({ token, ...request })); }
    catch (error) { pending.delete(token); reject(error); }
  });
}

function toBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
  return btoa(binary);
}

export async function archiveFetch(url, init) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
  if (!window.FritiaArchive?.request && (!invoke || window.FritiaAndroid)) return fetch(url, init);
  const body = init.body == null ? null : toBase64(new Uint8Array(await new Blob([init.body]).arrayBuffer()));
  const headers = new Headers(init.headers);
  const result = window.FritiaArchive?.request
    ? await androidCall('request', { url, method: init.method || 'GET', headers: Object.fromEntries(headers), body })
    : await invoke('proxy_fetch', { request: { url, method: init.method || 'GET', headers: [...headers].map(([name,value]) => ({name,value})), bodyBase64: body } });
  const bytes = Uint8Array.from(atob(result.body || result.bodyBase64 || result.body_base64 || ''), char => char.charCodeAt(0));
  return new Response([204, 205, 304].includes(result.status) ? null : bytes, { status: result.status, statusText: result.statusText || result.status_text || '', headers: Array.isArray(result.headers) ? result.headers.map(item => [item.name,item.value]) : result.headers });
}

// Call before collecting data, while the button's user activation is alive.
export async function chooseArchiveDestination(filename) {
  if (window.FritiaArchive?.chooseFile) {
    const chosen = await androidCall('chooseFile', { filename, mime: 'application/zip' });
    if (chosen.cancelled) return null;
    return async blob => androidCall('writeFile', { uri: chosen.uri, body: toBase64(new Uint8Array(await blob.arrayBuffer())) });
  }
  const dialog = window.__TAURI__?.dialog;
  const fs = window.__TAURI__?.fs;
  if (dialog?.save && fs?.writeFile) {
    const path = await dialog.save({ defaultPath: filename, filters: [{ name: 'ZIP', extensions: ['zip'] }] });
    return path ? blob => blob.arrayBuffer().then(data => fs.writeFile(path, new Uint8Array(data))) : null;
  }
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
  if (invoke && !window.FritiaAndroid) {
    const path = await invoke('choose_archive_file', { filename });
    return path ? async blob => invoke('write_archive_file', { path, body: toBase64(new Uint8Array(await blob.arrayBuffer())) }) : null;
  }
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: 'ZIP 备份', accept: { 'application/zip': ['.zip'] } }] });
      return async blob => { const writable = await handle.createWritable(); try { await writable.write(blob); await writable.close(); } catch (error) { await writable.abort().catch(() => {}); throw error; } };
    } catch (error) { if (error.name === 'AbortError') return null; throw error; }
  }
  // Browsers without the File System Access API cannot force a native path
  // picker. Preserve a real download and report that limitation in the UI.
  return async blob => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { browserDownload: true };
  };
}

export async function readClipboardText() {
  if (window.FritiaArchive?.clipboard) return (await androidCall('clipboard', {})).text || '';
  return navigator.clipboard.readText();
}
