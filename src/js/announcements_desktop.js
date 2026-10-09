export function initAnnouncementDesktopLayout({ panel, scroll }) {
  const media = window.matchMedia('(min-width: 761px) and (orientation: landscape)');
  function sync() {
    if (media.matches) panel.dataset.layout = 'desktop';
  }
  panel.addEventListener('keydown', event => {
    if (!media.matches || event.target !== scroll) return;
    const direction = { PageDown: 1, PageUp: -1 }[event.key];
    if (direction) {
      event.preventDefault();
      scroll.scrollBy({ top: direction * scroll.clientHeight * 0.85 });
    }
  });
  media.addEventListener('change', sync);
  sync();
}
