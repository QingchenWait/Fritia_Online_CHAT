import TurndownService from '../vendor/turndown/turndown.js';
import { initAnnouncementDesktopLayout } from './announcements_desktop.js';
import { initAnnouncementMobileLayout } from './announcements_mobile.js';

export const ANNOUNCEMENT_URL = 'https://chat.fritia.online/api/downloads/fritia-online-source/public/announcement.json?token=cyandust_workshop';
const DATABASE = 'fritia_announcement_board';
const FILE_NAME = 'announcement.json';
const converter = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });

export function normalizeAnnouncementFile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('公告文件格式无效');
  const entries = Object.entries(raw).map(([id, entry]) => {
    if (!/^-?(?:0|[1-9]\d*)$/.test(id) || id === '-0' || !entry
      || ['title', 'date', 'version', 'content'].some(key => typeof entry[key] !== 'string')) {
      throw new Error('公告条目格式无效');
    }
    return [id, { title: entry.title, date: entry.date, version: entry.version, content: entry.content }];
  });
  return Object.fromEntries(entries);
}

export function sortedAnnouncementIds(announcements) {
  return Object.keys(announcements).sort((a, b) => BigInt(a) > BigInt(b) ? -1 : BigInt(a) < BigInt(b) ? 1 : 0);
}

export function mergeAnnouncementFile(previous, raw) {
  const announcements = normalizeAnnouncementFile(raw);
  const unread = new Set(previous.unreadIds);
  for (const id of Object.keys(announcements)) {
    if (!Object.hasOwn(previous.announcements, id)) unread.add(id);
  }
  return { fileName: FILE_NAME, announcements, unreadIds: [...unread].filter(id => Object.hasOwn(announcements, id)) };
}

export function announcementContentToMarkdown(content) {
  const source = content.replace(/\r\n?/g, '\n');
  if (!/<\/?[a-z][^>]*>/i.test(source)) return source;
  // A template stays inert: announcement HTML is never attached to the page.
  const template = document.createElement('template');
  template.innerHTML = source;
  template.content.querySelectorAll('script,style,noscript,iframe,object,embed,form,input,button,svg,math,template,link,meta,base').forEach(node => node.remove());
  template.content.querySelectorAll('a,img').forEach(node => {
    const attribute = node.tagName === 'A' ? 'href' : 'src';
    try {
      const url = new URL(node.getAttribute(attribute) || '', ANNOUNCEMENT_URL);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported URL');
      node.setAttribute(attribute, url.href.replace(/\(/g, '%28').replace(/\)/g, '%29'));
      node.removeAttribute('title');
    } catch {
      node.replaceWith(...node.childNodes);
    }
  });
  return converter.turndown(template.content);
}

async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function cachedFile(next) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('files', next ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('files');
      const request = next ? store.put(next, FILE_NAME) : store.get(FILE_NAME);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error || new Error('无法保存公告'));
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export function initAnnouncementBoard({ renderMarkdown, requestClose }) {
  const panel = document.getElementById('announcement-panel');
  const trigger = document.getElementById('announcement-btn');
  const badge = document.getElementById('announcement-unread-count');
  const scroll = document.getElementById('announcement-scroll');
  const cards = document.getElementById('announcement-cards');
  const status = document.getElementById('announcement-status');
  const closeButton = panel.querySelector('[data-panel-close]');
  let file = { fileName: FILE_NAME, announcements: {}, unreadIds: [] };
  let highlighted = new Set();
  let opened = false;
  let loading = true;
  let loadError = false;
  let storageError = false;
  let previousFocus;
  let writes = Promise.resolve();

  initAnnouncementDesktopLayout({ panel, scroll });
  initAnnouncementMobileLayout({ panel });

  function renderStatus() {
    const hasCards = Object.keys(file.announcements).length > 0;
    status.textContent = loading ? (hasCards ? '正在检查新公告…' : '正在获取公告…')
      : loadError ? (hasCards ? '暂时无法更新，正在显示本机保存的公告。' : '暂时无法获取公告，请下次打开 APP 时重试。')
        : storageError ? '公告无法保存到本机，下次启动可能再次显示未读。'
          : hasCards ? '' : '暂无公告';
    status.classList.toggle('hidden', !status.textContent);
    scroll.setAttribute('aria-busy', String(loading));
  }

  function renderBadge() {
    badge.textContent = String(file.unreadIds.length);
    badge.classList.toggle('hidden', file.unreadIds.length === 0);
    trigger.setAttribute('aria-label', file.unreadIds.length ? `公告板，${file.unreadIds.length} 条未读公告` : '公告板');
  }

  function persist() {
    const snapshot = structuredClone(file);
    writes = writes.then(() => cachedFile(snapshot)).then(() => {
      storageError = false;
    }).catch(error => {
      storageError = true;
      console.warn('[announcements] cache write failed', error);
    }).then(renderStatus);
    return writes;
  }

  function markVisibleRead(entries) {
    if (!opened || document.hidden) return;
    const visible = new Set(entries.filter(entry => entry.isIntersecting && entry.intersectionRatio >= 0.6)
      .map(entry => entry.target.dataset.announcementId));
    const unreadIds = file.unreadIds.filter(id => !visible.has(id));
    if (unreadIds.length === file.unreadIds.length) return;
    file = { ...file, unreadIds };
    renderBadge();
    void persist();
  }

  const observer = new IntersectionObserver(markVisibleRead, { root: scroll, threshold: 0.6 });

  function observeCards() {
    observer.disconnect();
    if (opened) cards.querySelectorAll('.announcement-card-head').forEach(header => observer.observe(header));
  }

  function render() {
    observer.disconnect();
    cards.replaceChildren();
    for (const id of sortedAnnouncementIds(file.announcements)) {
      const entry = file.announcements[id];
      const card = document.createElement('article');
      card.className = 'announcement-card';
      card.classList.toggle('is-unread', opened ? highlighted.has(id) : file.unreadIds.includes(id));
      card.dataset.announcementId = id;
      const header = document.createElement('header');
      header.className = 'announcement-card-head';
      header.dataset.announcementId = id;
      const title = document.createElement('h3');
      title.textContent = entry.title;
      const meta = document.createElement('p');
      meta.className = 'announcement-meta';
      meta.textContent = `${entry.date} | ${entry.version}`;
      header.append(title, meta);
      const content = document.createElement('div');
      content.className = 'announcement-content';
      content.innerHTML = renderMarkdown(announcementContentToMarkdown(entry.content), { preserveBreaks: true });
      content.querySelectorAll('a').forEach(link => {
        try {
          const url = new URL(link.getAttribute('href'), ANNOUNCEMENT_URL);
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported URL');
          link.href = url.href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        } catch {
          link.replaceWith(...link.childNodes);
        }
      });
      card.append(header, content);
      cards.append(card);
    }
    renderStatus();
    renderBadge();
    observeCards();
  }

  async function refreshOnce() {
    try {
      const cached = await cachedFile();
      if (cached) {
        const announcements = normalizeAnnouncementFile(cached.announcements);
        file = { fileName: FILE_NAME, announcements,
          unreadIds: Array.isArray(cached.unreadIds) ? [...new Set(cached.unreadIds)].filter(id => Object.hasOwn(announcements, id)) : [] };
        if (opened) highlighted = new Set(file.unreadIds);
        render();
      }
    } catch (error) {
      storageError = true;
      console.warn('[announcements] cache read failed', error);
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(ANNOUNCEMENT_URL, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
      if (!response.ok) throw new Error(`公告下载失败 (${response.status})`);
      const raw = await response.json();
      file = mergeAnnouncementFile(file, raw);
      if (opened) file.unreadIds.forEach(id => highlighted.add(id));
      await persist();
    } catch (error) {
      loadError = true;
      console.warn('[announcements] refresh failed', error);
    } finally {
      window.clearTimeout(timeout);
      loading = false;
      render();
    }
  }

  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); requestClose(); }
    if (event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('button,a[href],[tabindex="0"]')];
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  document.addEventListener('visibilitychange', observeCards);
  render();
  void refreshOnce();

  return {
    open() {
      previousFocus = document.activeElement;
      opened = true;
      highlighted = new Set(file.unreadIds);
      trigger.setAttribute('aria-expanded', 'true');
      render();
      scroll.scrollTop = 0;
      closeButton.focus({ preventScroll: true });
    },
    close() {
      opened = false;
      observer.disconnect();
      trigger.setAttribute('aria-expanded', 'false');
      previousFocus?.focus({ preventScroll: true });
    }
  };
}
