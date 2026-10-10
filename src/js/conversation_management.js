import { deleteSelectedPrivateMessages } from './conversation_management_data.js';
import { initConversationManagementDesktop } from './conversation_management_desktop.js';
import { initConversationManagementMobile } from './conversation_management_mobile.js';
import { copyConversationImage, saveConversationImage } from './conversation_share.js';

export function initConversationManagement({ getStore, getConversation, closeDetail, closePopovers, isBusy, onDelete }) {
  let conversationId = '';
  let selected = new Set();
  let busy = false;
  let generation = null;
  let preview = null;
  let previewUrl = '';
  let returnFocus = null;
  const app = document.getElementById('app');
  const list = document.getElementById('message-list');
  const actions = document.getElementById('conversation-management-actions');
  const hint = document.getElementById('conversation-management-hint');
  const remove = document.getElementById('conversation-management-delete');
  const share = document.getElementById('conversation-management-share');
  const confirm = document.getElementById('conversation-delete-panel');
  const imagePanel = document.getElementById('conversation-share-panel');
  const status = document.getElementById('conversation-share-status');
  const image = document.getElementById('conversation-share-image');
  const copy = document.getElementById('conversation-share-copy');
  const save = document.getElementById('conversation-share-save');
  const cancel = document.getElementById('conversation-delete-cancel');
  const accept = document.getElementById('conversation-delete-confirm');

  function update() {
    const current = getConversation();
    if (conversationId && (current?.id !== conversationId || current.type !== 'private')) exit();
    const active = Boolean(conversationId);
    const messages = getStore().messages?.[conversationId] || [];
    selected = new Set([...selected].filter(id => messages.some(message => message.id === id)));
    app.classList.toggle('is-conversation-management', active);
    document.querySelector('.composer').setAttribute('aria-hidden', String(active));
    actions.classList.toggle('hidden', !active);
    hint.classList.toggle('hidden', !active);
    const entry = document.getElementById('detail-conversation-management');
    entry.classList.toggle('hidden', current?.type !== 'private');
    remove.disabled = !selected.size || busy || isBusy() || Object.values(getStore().messages || {}).flat().some(message => message.status === 'typing');
    remove.title = selected.size ? (remove.disabled ? '等待当前对话处理结束后删除' : `删除 ${selected.size} 条对话`) : '请先选择对话';
    share.disabled = !selected.size || busy || messages.some(message => selected.has(message.id) && message.status === 'typing');
    share.title = selected.size ? `分享 ${selected.size} 条对话` : '请先选择对话';
    for (const row of list.querySelectorAll('[data-message-id]')) {
      const checked = active && selected.has(row.dataset.messageId);
      row.classList.toggle('is-management-selectable', active);
      row.classList.toggle('is-management-selected', checked);
      row.querySelector('.message-selection-control')?.remove();
      if (!active) {
        row.removeAttribute('role'); row.removeAttribute('aria-checked'); row.removeAttribute('tabindex'); row.removeAttribute('aria-label');
        continue;
      }
      row.setAttribute('role', 'checkbox'); row.setAttribute('aria-checked', String(checked)); row.tabIndex = 0;
      const message = messages.find(item => item.id === row.dataset.messageId);
      row.setAttribute('aria-label', `${message?.speakerName || '对话'}：${message?.text?.slice(0, 80) || '附件或语音'}${checked ? '，已选中' : ''}`);
      const control = document.createElement('span'); control.className = 'message-selection-control'; control.setAttribute('aria-hidden', 'true');
      row.querySelector('.message-content')?.appendChild(control);
    }
  }

  function enter() {
    const conversation = getConversation();
    if (conversation?.type !== 'private') return;
    conversationId = conversation.id; selected.clear();
    closeDetail(); closePopovers();
    document.activeElement?.blur();
    update(); document.getElementById('conversation-management-close').focus();
  }

  function hideConfirm() { confirm.classList.add('hidden'); returnFocus?.focus(); }
  function closePreview() {
    generation?.abort(); generation = null;
    imagePanel.classList.add('hidden'); image.removeAttribute('src');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = ''; preview = null;
    returnFocus?.focus();
  }
  function exit({ keepPreview = false } = {}) {
    conversationId = ''; selected.clear();
    confirm.classList.add('hidden');
    if (!keepPreview) closePreview();
    update();
  }
  function toggle(row) {
    if (!conversationId || busy) return;
    const id = row.dataset.messageId;
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    update();
  }
  list.addEventListener('click', event => {
    if (!conversationId) return;
    const row = event.target.closest('[data-message-id]');
    if (!row) return;
    event.preventDefault(); event.stopImmediatePropagation(); toggle(row);
  }, true);
  list.addEventListener('keydown', event => {
    if (!conversationId || ![' ', 'Enter'].includes(event.key)) return;
    const row = event.target.closest('[data-message-id]');
    if (row) { event.preventDefault(); event.stopImmediatePropagation(); toggle(row); }
  }, true);
  document.getElementById('detail-conversation-management').addEventListener('click', enter);
  document.getElementById('conversation-management-close').addEventListener('click', () => { exit(); document.getElementById('chat-info-btn').focus(); });
  remove.addEventListener('click', () => {
    if (remove.disabled) return;
    returnFocus = remove;
    document.getElementById('conversation-delete-count').textContent = `删除选中的 ${selected.size} 条对话？`;
    document.getElementById('conversation-delete-error').textContent = '';
    confirm.classList.remove('hidden'); cancel.focus();
  });
  cancel.addEventListener('click', hideConfirm);
  document.getElementById('conversation-delete-close').addEventListener('click', hideConfirm);
  accept.addEventListener('click', async () => {
    if (!conversationId || !selected.size || busy) return;
    busy = true; accept.disabled = true; update();
    const targetId = conversationId;
    const ids = [...selected];
    try {
      const result = await deleteSelectedPrivateMessages(targetId, ids, getStore(), isBusy);
      onDelete?.(targetId, ids, result);
      if (conversationId === targetId) exit();
    } catch (error) { document.getElementById('conversation-delete-error').textContent = error.message; }
    finally { busy = false; accept.disabled = false; update(); }
  });
  share.addEventListener('click', async () => {
    if (share.disabled) return;
    const targetId = conversationId;
    returnFocus = share;
    generation = new AbortController(); const task = generation;
    busy = true; preview = null; copy.disabled = save.disabled = true;
    image.removeAttribute('src'); status.textContent = '正在生成聊天记录图…';
    imagePanel.classList.remove('hidden'); document.getElementById('conversation-share-close').focus(); update();
    try {
      const { renderConversationImage } = await import('./conversation_share.js');
      const rows = [...list.querySelectorAll('[data-message-id]')].filter(row => selected.has(row.dataset.messageId));
      const result = await renderConversationImage({ rows, header: document.querySelector('.chat-head'), signal: task.signal,
        onProgress: progress => { if (generation === task) status.textContent = `正在生成聊天记录图… ${progress}%`; } });
      task.signal.throwIfAborted();
      preview = { ...result, filename: `海姆休息室-${getConversation().title.replace(/[\\/:*?"<>|]/g, '_')}-${Date.now()}.png` };
      previewUrl = URL.createObjectURL(result.blob); image.src = previewUrl;
      status.textContent = `${result.width} × ${result.height} · PNG`;
      copy.disabled = save.disabled = false;
      if (conversationId === targetId) exit({ keepPreview: true });
    } catch (error) { if (!task.signal.aborted) status.textContent = `生成失败：${error.message}`; }
    finally { if (generation === task) generation = null; busy = false; update(); }
  });
  copy.addEventListener('click', async () => {
    if (!preview || copy.disabled) return;
    copy.disabled = true;
    try { await copyConversationImage(preview.blob); status.textContent = '已复制图片到剪贴板'; }
    catch (error) { status.textContent = `复制失败：${error.message}`; }
    finally { copy.disabled = !preview; }
  });
  save.addEventListener('click', async () => {
    if (!preview || save.disabled) return;
    save.disabled = true;
    try { const download = await saveConversationImage(preview.blob, preview.filename);
      if (download !== null) status.textContent = download ? '已交给浏览器下载；当前环境不支持目录选择器' : '聊天记录图已保存'; }
    catch (error) { if (error.name !== 'AbortError') status.textContent = `保存失败：${error.message}`; }
    finally { save.disabled = !preview; }
  });
  document.getElementById('conversation-share-close').addEventListener('click', closePreview);
  for (const panel of [confirm, imagePanel]) {
    panel.addEventListener('click', event => { if (event.target === panel) panel === confirm ? hideConfirm() : closePreview(); });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const nodes = [...panel.querySelectorAll('button:not(:disabled), [tabindex="0"]')];
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }
  function back() {
    if (!imagePanel.classList.contains('hidden')) { closePreview(); return true; }
    if (!confirm.classList.contains('hidden')) { hideConfirm(); return true; }
    if (conversationId) { exit(); return true; }
    return false;
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && back()) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('pagehide', () => exit());
  window.addEventListener('storage', event => {
    if (event.key === 'fritia_next_chat_store' && conversationId) exit();
  });
  initConversationManagementDesktop({ exit, update, imagePanel });
  initConversationManagementMobile({ exit, imagePanel });
  update();
  return { update, exit, back, closePreview, active: () => Boolean(conversationId) };
}
