// WebViews may resize the layout viewport for the keyboard; mobile browsers
// may resize only VisualViewport. Keep the composer inside either viewport.
export function bindMobileChatViewport(pane, schedule) {
  const mobile = window.matchMedia('(max-width: 760px)');
  const viewport = window.visualViewport;
  function syncViewport() {
    if (!pane) return;
    if (mobile.matches && viewport && Math.abs(viewport.scale - 1) < 0.01) {
      const height = Math.min(window.innerHeight, viewport.height + viewport.offsetTop - pane.getBoundingClientRect().top);
      pane.style.setProperty('--chat-viewport-height', `${Math.max(0, height)}px`);
    } else {
      pane.style.removeProperty('--chat-viewport-height');
    }
    schedule();
  }
  window.addEventListener('resize', syncViewport);
  viewport?.addEventListener('resize', syncViewport);
  viewport?.addEventListener('scroll', syncViewport);
  syncViewport();
}
