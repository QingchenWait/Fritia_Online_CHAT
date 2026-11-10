export function initThirdPartyMobileLayout({ panel, setColumns }) {
  const media = window.matchMedia('(max-width: 760px), (orientation: portrait)');
  function sync() {
    if (!media.matches) return;
    panel.dataset.layout = 'mobile';
    setColumns(1);
  }
  media.addEventListener('change', sync);
  window.addEventListener('resize', sync);
  sync();
}
