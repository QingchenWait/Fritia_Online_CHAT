import { chooseFileDestination } from './archive_io.js';
import { initThirdPartyDesktopLayout } from './third_party_cards_desktop.js';
import { initThirdPartyMobileLayout } from './third_party_cards_mobile.js';
import { THIRD_PARTY_ISSUES_URL, downloadCharacterAttachment, fetchApprovedCharacterCards, fetchCurrentCharacterCard, installThirdPartyCharacter, isThirdPartyCardInstalled } from './third_party_cards_data.js';

const DISCLAIMER_KEY = 'fritia_third_party_cards_disclaimer_dismissed';
const ICON = 'src/_logo/icons/';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function initThirdPartyCards({ renderMarkdown } = {}) {
  const panel = document.getElementById('third-party-cards');
  if (!panel) return null;
  const get = id => document.getElementById(`third-party-${id}`);
  const content = get('content'), list = get('list'), grid = get('grid'), listScroll = get('list-scroll'), detail = get('detail'), detailScroll = get('detail-scroll');
  const disclaimer = get('disclaimer'), status = get('status');
  let items = [], selected = null, page = 1, columns = 1, loading = false, active = false, error = '', acknowledged = false;
  let installId = null, downloading = false, loadController, thumbnailController, urls = [], listScrollTop = 0;
  let detailController, readyResources = new Map();
  const hasFileExtension = attachment => /\.(png|jpe?g|webp|txt|mp3|wav)$/i.test(attachment?.name || '');
  function resetDetailResources() {
    detailController?.abort();
    readyResources.clear();
  }
  function renderDownloadButtons() {
    for (const kind of ['avatar', 'prompt', 'voice']) {
      const attachment = selected?.[kind];
      get(`download-${kind}`).disabled = !attachment || downloading || installId !== null || (!hasFileExtension(attachment) && !readyResources.has(attachment.url));
    }
  }

  function clearThumbnails() {
    thumbnailController?.abort();
    urls.forEach(url => URL.revokeObjectURL(url));
    urls = [];
  }
  function hideDisclaimer() {
    disclaimer.hidden = true;
    content.inert = false;
    panel.classList.remove('needs-disclaimer');
  }
  function showDisclaimer() {
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISCLAIMER_KEY) === '1'; } catch { /* Remind if storage is unavailable. */ }
    if (acknowledged || dismissed) return;
    disclaimer.hidden = false;
    content.inert = true;
    panel.classList.add('needs-disclaimer');
    get('acknowledge').focus();
  }
  get('acknowledge').addEventListener('click', () => {
    if (get('dont-remind').checked) {
      try { localStorage.setItem(DISCLAIMER_KEY, '1'); } catch { /* Still allow acknowledgement for this session. */ }
    }
    acknowledged = true;
    hideDisclaimer();
    get('search').focus();
  });
  disclaimer.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const first = get('dont-remind'), last = get('acknowledge');
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  function filteredItems() {
    const query = get('search').value.trim().toLocaleLowerCase();
    const direction = get('sort').value === 'oldest' ? 1 : -1;
    return items.filter(item => [item.name, item.description, item.author].some(value => value.toLocaleLowerCase().includes(query)))
      .sort((a, b) => direction * (a.createdAt - b.createdAt || a.issueNumber - b.issueNumber));
  }
  function renderPagination(total) {
    const max = Math.max(1, Math.ceil(total / (columns * 10)));
    page = Math.min(page, max);
    get('prev').disabled = loading || page <= 1;
    get('next').disabled = loading || page >= max;
    get('page-label').textContent = `${page} / ${max}`;
    const nearby = [...new Set([1, page - 1, page, page + 1, max].filter(number => number >= 1 && number <= max))].sort((a, b) => a - b);
    get('pages').innerHTML = nearby.map((number, index) => `${index && number - nearby[index - 1] > 1 ? '<span>…</span>' : ''}<button type="button" data-card-page="${number}" ${number === page ? 'aria-current="page" class="is-active"' : ''} ${loading ? 'disabled' : ''}>${number}</button>`).join('');
  }
  function renderInstalled() {
    grid.querySelectorAll('[data-card-id]').forEach(button => {
      const item = items.find(card => card.issueId === Number(button.dataset.cardId));
      button.querySelector('.third-party-installed').hidden = !item || !isThirdPartyCardInstalled(item);
    });
    if (selected) {
      const installed = isThirdPartyCardInstalled(selected);
      get('install').disabled = installed || installId !== null || downloading;
      get('install-label').textContent = installed ? '已安装' : installId === selected.issueId ? '安装中' : '一键安装';
    }
  }
  function renderList({ preserveScroll = false } = {}) {
    const scrollTop = preserveScroll ? listScroll.scrollTop : 0;
    clearThumbnails();
    panel.style.setProperty('--third-party-columns', columns);
    const results = filteredItems();
    renderPagination(results.length);
    get('refresh').disabled = loading;
    status.textContent = loading ? '正在读取 GitHub 角色卡…' : error ? '' : `共 ${results.length} 张角色卡`;
    if (loading) {
      grid.innerHTML = '<div class="third-party-empty" role="status"><span class="third-party-spinner" aria-hidden="true"></span><span>正在加载角色卡…</span></div>';
    } else if (error) {
      grid.innerHTML = `<div class="third-party-empty third-party-error"><img src="${ICON}circle-alert.svg" alt=""><p>第三方角色卡托管在 <a href="${THIRD_PARTY_ISSUES_URL}" target="_blank" rel="noopener noreferrer">GitHub</a> 上，请确认网络访问能力。</p><small>${escape(error)}</small></div>`;
    } else if (!results.length) {
      grid.innerHTML = `<div class="third-party-empty"><img src="${ICON}search.svg" alt=""><span>${items.length ? '没有找到匹配的角色卡。' : '暂无通过初审的角色卡。'}</span></div>`;
    } else {
      const displayed = results.slice((page - 1) * columns * 10, page * columns * 10);
      grid.innerHTML = displayed.map(item => `<button class="third-party-card" type="button" data-card-id="${item.issueId}">
        <img class="third-party-avatar" src="${ICON}role-card.svg" alt="" data-avatar-id="${item.issueId}">
        <span class="third-party-card-info"><span class="third-party-card-title"><strong>${escape(item.name)}</strong><span class="third-party-installed" ${isThirdPartyCardInstalled(item) ? '' : 'hidden'}>已安装</span></span><span class="third-party-author">@${escape(item.author)}</span><span class="third-party-description">${escape(item.description)}</span></span>
      </button>`).join('');
      thumbnailController = new AbortController();
      const signal = thumbnailController.signal;
      for (const item of displayed) {
        if (!item.avatar) continue;
        void downloadCharacterAttachment(item.avatar, 'avatar', { signal }).then(resource => {
          if (signal.aborted) return;
          const image = grid.querySelector(`[data-avatar-id="${item.issueId}"]`);
          if (!image) return;
          const url = URL.createObjectURL(resource.blob);
          urls.push(url);
          image.src = url;
        }).catch(() => {});
      }
    }
    listScroll.scrollTop = scrollTop;
  }
  async function refresh() {
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    items = []; selected = null; page = 1; error = ''; loading = true;
    resetDetailResources();
    list.hidden = false; detail.hidden = true;
    renderList();
    try {
      const fresh = await fetchApprovedCharacterCards({ signal: controller.signal });
      if (controller.signal.aborted || !active) return;
      items = fresh;
    } catch (failure) {
      if (controller.signal.aborted || !active) return;
      error = failure.message || '无法连接 GitHub。';
    } finally {
      if (!controller.signal.aborted && active) { loading = false; renderList(); }
    }
  }
  function showDetail(card) {
    resetDetailResources();
    detailController = new AbortController();
    const signal = detailController.signal;
    selected = card;
    listScrollTop = listScroll.scrollTop;
    list.hidden = true; detail.hidden = false;
    get('detail-name').textContent = card.name;
    get('detail-intro').textContent = card.description;
    const description = get('detail-description');
    const markdown = card.detailedDescription || '';
    description.classList.toggle('is-empty', !markdown);
    if (markdown && renderMarkdown) description.innerHTML = renderMarkdown(markdown, { baseUrl: card.url, preserveBreaks: true });
    else description.textContent = markdown || '作者暂未填写详细描述。';
    get('original').href = card.url;
    get('detail-status').textContent = '';
    detailScroll.scrollTop = 0;
    renderDownloadButtons();
    // GitHub's opaque asset URLs have no filename/MIME. Identify these in memory
    // before a click, so the save picker can still open during user activation.
    for (const kind of ['avatar', 'voice']) {
      const attachment = card[kind];
      if (!attachment || hasFileExtension(attachment)) continue;
      get('detail-status').textContent = '正在识别附件格式…';
      void downloadCharacterAttachment(attachment, kind, { signal }).then(resource => {
        if (signal.aborted || selected?.issueId !== card.issueId) return;
        readyResources.set(attachment.url, resource);
        renderDownloadButtons();
        if (get('detail-status').textContent === '正在识别附件格式…') get('detail-status').textContent = '';
      }).catch(failure => {
        if (!signal.aborted && selected?.issueId === card.issueId) get('detail-status').textContent = `附件识别失败：${failure.message}，请返回后重试。`;
      });
    }
    renderInstalled();
    get('back').focus();
  }
  get('back').addEventListener('click', () => {
    resetDetailResources();
    const id = selected?.issueId;
    selected = null; list.hidden = false; detail.hidden = true;
    renderList();
    listScroll.scrollTop = listScrollTop;
    grid.querySelector(`[data-card-id="${id}"]`)?.focus({ preventScroll: true });
  });
  grid.addEventListener('click', event => {
    const button = event.target.closest('[data-card-id]');
    const card = items.find(item => item.issueId === Number(button?.dataset.cardId));
    if (card) showDetail(card);
  });
  get('pages').addEventListener('click', event => {
    const button = event.target.closest('[data-card-page]');
    if (button && !loading) { page = Number(button.dataset.cardPage); renderList(); }
  });
  get('prev').addEventListener('click', () => { page -= 1; renderList(); });
  get('next').addEventListener('click', () => { page += 1; renderList(); });
  get('search').addEventListener('input', () => { page = 1; renderList(); });
  get('sort').addEventListener('change', () => { page = 1; renderList(); });
  get('refresh').addEventListener('click', () => void refresh());

  for (const kind of ['avatar', 'prompt', 'voice']) {
    get(`download-${kind}`).addEventListener('click', async () => {
      const card = selected;
      if (!card?.[kind] || downloading || installId !== null) return;
      downloading = true;
      get('detail-status').textContent = '请选择保存位置…';
      renderInstalled();
      for (const key of ['avatar', 'prompt', 'voice']) get(`download-${key}`).disabled = true;
      try {
        const attachment = card[kind];
        const prepared = readyResources.get(attachment.url);
        const extension = /\.(png|jpe?g|webp|txt|mp3|wav)$/i.exec(prepared?.filename || attachment.name)?.[1]?.toLowerCase() || ({ avatar: 'png', prompt: 'txt', voice: 'mp3' }[kind]);
        const mime = prepared?.mime || { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain', mp3: 'audio/mpeg', wav: 'audio/wav' }[extension];
        // Select a destination before awaiting any network operation, retaining user activation.
        const name = /\.(png|jpe?g|webp|txt|mp3|wav)$/i.test(attachment.name) ? attachment.name : `${card.name.replace(/[\\/:*?"<>|]/g, '_')}.${extension}`;
        const save = await chooseFileDestination(name, mime);
        if (!save) { get('detail-status').textContent = ''; return; }
        get('detail-status').textContent = '正在核对投稿并下载附件…';
        const current = await fetchCurrentCharacterCard(card);
        if (current[kind]?.url !== attachment.url) throw new Error('投稿附件发生变化，请刷新后重试。');
        const resource = prepared || await downloadCharacterAttachment(current[kind], kind);
        if (resource.mime !== mime) throw new Error('附件格式与投稿文件名不一致，请刷新后重试。');
        const result = await save(resource.blob);
        get('detail-status').textContent = result?.browserDownload ? '已交给浏览器下载；保存位置由浏览器下载设置决定。' : '附件已保存。';
      } catch (failure) { get('detail-status').textContent = `下载失败：${failure.message}`; }
      finally {
        downloading = false;
        renderDownloadButtons();
        renderInstalled();
      }
    });
  }
  get('install').addEventListener('click', async () => {
    const card = selected;
    if (!card || installId !== null || downloading || isThirdPartyCardInstalled(card)) return;
    installId = card.issueId;
    renderInstalled();
    for (const kind of ['avatar', 'prompt', 'voice']) get(`download-${kind}`).disabled = true;
    try {
      await installThirdPartyCharacter(card, { onProgress: message => { if (selected?.issueId === card.issueId) get('detail-status').textContent = message; } });
      if (selected?.issueId === card.issueId) get('detail-status').textContent = `${card.name} 已安装到角色列表。`;
    } catch (failure) {
      if (selected?.issueId === card.issueId) get('detail-status').textContent = `安装失败：${failure.message}`;
    } finally {
      installId = null;
      renderDownloadButtons();
      renderInstalled();
    }
  });
  document.addEventListener('fritia-next-chat-store-updated', () => { if (active) renderInstalled(); });
  window.addEventListener('storage', event => { if (active && event.key === 'fritia_next_chat_store') renderInstalled(); });
  const setColumns = next => {
    if (next === columns) return;
    const firstIndex = (page - 1) * columns * 10;
    columns = next; page = Math.floor(firstIndex / (columns * 10)) + 1;
    if (active) renderList();
  };
  initThirdPartyDesktopLayout({ panel, scroll: listScroll, setColumns });
  initThirdPartyMobileLayout({ panel, setColumns });
  return {
    open() { active = true; void refresh(); showDisclaimer(); },
    close() { active = false; loadController?.abort(); clearThumbnails(); resetDetailResources(); items = []; selected = null; grid.replaceChildren(); hideDisclaimer(); }
  };
}
