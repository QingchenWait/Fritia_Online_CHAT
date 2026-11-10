export function initThirdPartyDesktopLayout({ panel, scroll, setColumns }) {
  const media = window.matchMedia('(min-width: 761px) and (orientation: landscape)');
  function sync() {
    if (!media.matches) return;
    if (panel.clientWidth === 0) return;
    panel.dataset.layout = 'desktop';
    setColumns(panel.clientWidth >= 560 ? 2 : 1);
  }
  const observer = new ResizeObserver(sync);
  observer.observe(panel);
  media.addEventListener('change', sync);
  panel.addEventListener('keydown', event => {
    if (!media.matches || event.target !== scroll) return;
    const direction = { PageDown: 1, PageUp: -1 }[event.key];
    if (direction) { event.preventDefault(); scroll.scrollBy({ top: direction * scroll.clientHeight * 0.85 }); }
  });
}
