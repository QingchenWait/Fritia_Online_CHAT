import { isBuiltinCharacter } from './characters.js';
import { deleteSelectedCharacter } from './character_deletion_data.js';
import { exportArchiveZip } from './archive_sync.js';
import { showSettingsNotice } from './settings_notice.js';
import { initCharacterDeletionDesktop } from './character_deletion_desktop.js';
import { initCharacterDeletionMobile } from './character_deletion_mobile.js';

export function initCharacterDeletion({ getStore, getCharacter, isBusy, onDeleted }) {
  const panel = document.getElementById('character-delete-panel');
  const entry = document.getElementById('detail-character-delete');
  const accept = document.getElementById('character-delete-confirm');
  const backup = document.getElementById('character-delete-backup');
  const cancel = document.getElementById('character-delete-cancel');
  const close = document.getElementById('character-delete-close');
  const error = document.getElementById('character-delete-error');
  let target = null, busy = false;

  function update() {
    const character = getCharacter();
    entry.classList.toggle('hidden', !character || isBuiltinCharacter(character));
    entry.disabled = busy;
    accept.disabled = busy || isBusy();
    accept.title = isBusy() ? '请等待正在进行的对话、语音或工具调用结束' : '永久删除选中角色';
    backup.disabled = cancel.disabled = close.disabled = busy;
  }
  function hide() {
    if (busy) return;
    panel.classList.add('hidden'); target = null;
    if (!entry.classList.contains('hidden')) entry.focus();
  }
  entry.addEventListener('click', () => {
    const character = getCharacter();
    if (!character || isBuiltinCharacter(character) || busy) return;
    // Capture the raw identity at opening; changing selection or syncing another
    // same-name card must never silently change the confirmation's target.
    let matches = [];
    try {
      const persisted = JSON.parse(localStorage.getItem('fritia_next_chat_store') || 'null');
      matches = Array.isArray(persisted?.characters) ? persisted.characters.filter(item => item?.id === character.id) : [];
    } catch { /* Never recover unreadable data by replacing it. */ }
    if (matches.length !== 1) { showSettingsNotice('角色 ID 异常，无法安全删除'); return; }
    target = structuredClone(matches[0]);
    document.getElementById('character-delete-name').textContent = `删除角色「${target.name}」？`;
    document.getElementById('character-delete-id').textContent = `角色 ID：${target.id}`;
    error.textContent = '';
    panel.classList.remove('hidden'); update(); cancel.focus();
  });
  backup.addEventListener('click', async () => {
    if (busy || !target) return;
    busy = true; update(); error.textContent = '';
    try {
      // The existing exporter opens the native picker before its first data read.
      const result = await exportArchiveZip({ noticeText: '备份已经保存' });
      if (!result.cancelled && result.browserDownload) error.textContent = '已交给浏览器下载；此浏览器不支持指定保存位置，请在下载列表确认文件。';
    } catch (failure) { if (failure.name !== 'AbortError') error.textContent = `备份失败：${failure.message}`; }
    finally { busy = false; update(); }
  });
  accept.addEventListener('click', async () => {
    if (!target || busy || isBusy()) return;
    const selected = target;
    busy = true; update(); error.textContent = '';
    try {
      const result = await deleteSelectedCharacter(selected.id, selected, getStore, isBusy);
      onDeleted?.(selected.id, result);
      busy = false; hide(); showSettingsNotice('角色已经删除');
    } catch (failure) { error.textContent = failure.message; }
    finally { busy = false; update(); }
  });
  cancel.addEventListener('click', hide); close.addEventListener('click', hide);
  panel.addEventListener('click', event => { if (event.target === panel) hide(); });
  panel.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const nodes = [...panel.querySelectorAll('button:not(:disabled), [tabindex="0"]')];
    const first = nodes[0], last = nodes.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  const back = () => {
    if (panel.classList.contains('hidden')) return false;
    hide(); return true;
  };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && back()) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  initCharacterDeletionDesktop(panel);
  initCharacterDeletionMobile(panel);
  update();
  return { update, back };
}
