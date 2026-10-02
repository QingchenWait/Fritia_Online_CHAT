let timeout;
export function showSettingsNotice(text) {
  let notice = document.getElementById('model-settings-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'model-settings-notice';
    notice.className = 'model-settings-notice';
    notice.setAttribute('role', 'status');
    document.body.appendChild(notice);
  }
  notice.textContent = text;
  notice.hidden = false;
  clearTimeout(timeout);
  timeout = setTimeout(() => { notice.hidden = true; }, 2600);
}
