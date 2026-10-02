// Route ordinary links through the existing shell command, just like the
// settings' official-site buttons. Web browsers retain their native behavior.
export function bindExternalLinks() {
  function handle(event) {
    const invoke = window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
    if (!invoke || event.defaultPrevented || (event.type === 'click' && event.button !== 0) || (event.type === 'auxclick' && event.button !== 1)) return;
    const link = event.target?.closest?.('a[href]');
    if (!link || link.hasAttribute('download')) return;
    let url;
    try { url = new URL(link.href, location.href); } catch { return; }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin === location.origin) return;
    event.preventDefault();
    void invoke('open_external_url', { url: url.href }).catch(error => {
      console.warn('[external-link] failed to open system browser', error);
    });
  }
  document.addEventListener('click', handle);
  document.addEventListener('auxclick', handle);
}
