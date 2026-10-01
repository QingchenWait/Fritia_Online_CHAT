import { bindDesktopChatViewport } from './chat_scroll_desktop.js';
import { bindMobileChatViewport } from './chat_scroll_mobile.js';

// Shared scroll invariant for both layouts: the last message ends above the
// actual composer, and a reader's visible message stays anchored during updates.
export function createChatScrollController(container, composer) {
  let conversationId = null;
  let following = true;
  let anchor = null;
  let frame = 0;
  let expectedTop = container.scrollTop;
  let scrollHeight = container.scrollHeight;
  let clientHeight = container.clientHeight;
  let touchY = null;
  const observed = new Set();

  function rememberAnchor() {
    const top = container.getBoundingClientRect().top;
    const row = [...container.children].find(node => node.dataset.messageId && node.getBoundingClientRect().bottom > top);
    anchor = row ? { id: row.dataset.messageId, offset: row.getBoundingClientRect().top - top } : null;
  }

  function sync() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (!container.clientHeight) return;
    const bounds = container.getBoundingClientRect();
    const composerTop = composer?.getBoundingClientRect().top ?? bounds.bottom;
    const gap = parseFloat(getComputedStyle(container).getPropertyValue('--chat-composer-gap')) || 16;
    const clearance = Math.max(0, bounds.bottom - composerTop) + gap;
    container.style.setProperty('--chat-bottom-clearance', `${clearance}px`);
    if (following) {
      container.scrollTop = container.scrollHeight;
    } else if (anchor) {
      const row = [...container.children].find(node => node.dataset.messageId === anchor.id);
      if (row) container.scrollTop += row.getBoundingClientRect().top - bounds.top - anchor.offset;
    }
    expectedTop = container.scrollTop;
    scrollHeight = container.scrollHeight;
    clientHeight = container.clientHeight;
    rememberAnchor();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(sync);
  }

  container.addEventListener('scroll', () => {
    // Layout changes and our own corrections are not user navigation.
    if (Math.abs(container.scrollTop - expectedTop) < 1) return;
    if (container.scrollHeight !== scrollHeight || container.clientHeight !== clientHeight) {
      schedule();
      return;
    }
    following = container.scrollHeight - container.clientHeight - container.scrollTop <= 24;
    expectedTop = container.scrollTop;
    rememberAnchor();
  }, { passive: true });
  container.addEventListener('wheel', event => {
    if (event.deltaY < 0) {
      following = false;
      rememberAnchor();
    }
  }, { passive: true });
  container.addEventListener('touchstart', event => {
    touchY = event.touches[0]?.clientY ?? null;
  }, { passive: true });
  container.addEventListener('touchmove', event => {
    if (touchY !== null && Math.abs((event.touches[0]?.clientY ?? touchY) - touchY) > 2) {
      following = false;
      rememberAnchor();
    }
  }, { passive: true });
  container.addEventListener('touchend', () => {
    touchY = null;
    if (container.scrollHeight - container.clientHeight - container.scrollTop <= 24) {
      following = true;
      schedule();
    }
  }, { passive: true });
  container.addEventListener('keydown', event => {
    if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) {
      following = false;
      rememberAnchor();
    }
  });
  container.addEventListener('load', schedule, true);
  container.addEventListener('loadedmetadata', schedule, true);
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  observer?.observe(container);
  if (composer) observer?.observe(composer);
  bindDesktopChatViewport(schedule);
  bindMobileChatViewport(container.closest('.chat-pane'), schedule);

  return {
    beforeRender(nextConversationId) {
      if (nextConversationId !== conversationId) {
        conversationId = nextConversationId;
        following = true;
        anchor = null;
      } else if (!following) {
        rememberAnchor();
      }
    },
    afterRender() {
      for (const node of observed) {
        if (node.parentElement !== container) {
          observer?.unobserve(node);
          observed.delete(node);
        }
      }
      for (const node of container.children) {
        if (!observed.has(node)) {
          observer?.observe(node);
          observed.add(node);
        }
      }
      sync();
      schedule();
    },
    followLatest() {
      following = true;
      anchor = null;
    }
  };
}
