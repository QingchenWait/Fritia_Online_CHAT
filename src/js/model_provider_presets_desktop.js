export function positionProviderMenuDesktop(menu, trigger) {
  const rect = trigger.getBoundingClientRect();
  const width = menu.getBoundingClientRect().width;
  menu.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.maxHeight = `${Math.max(0, window.innerHeight - rect.bottom - 12)}px`;
}
