export function bindDesktopChatViewport(schedule) {
  const desktop = window.matchMedia('(min-width: 761px)');
  window.addEventListener('resize', () => { if (desktop.matches) schedule(); });
}
