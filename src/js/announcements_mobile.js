export function initAnnouncementMobileLayout({ panel }) {
  const media = window.matchMedia('(max-width: 760px), (orientation: portrait)');
  const viewport = window.visualViewport;
  function sync() {
    if (!media.matches) return;
    panel.dataset.layout = 'mobile';
    panel.style.setProperty('--announcement-viewport-height', `${Math.round(viewport?.height || window.innerHeight)}px`);
  }
  media.addEventListener('change', sync);
  viewport?.addEventListener('resize', sync);
  window.addEventListener('resize', sync);
  sync();
}
