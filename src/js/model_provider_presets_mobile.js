export function positionProviderMenuMobile(menu, trigger) {
  const rect = trigger.getBoundingClientRect();
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft || 0;
  const right = left + (viewport?.width || window.innerWidth);
  const bottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight);
  const width = menu.getBoundingClientRect().width;
  menu.style.left = `${Math.max(left + 8, Math.min(rect.right - width, right - width - 8))}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.maxHeight = `${Math.max(0, bottom - rect.bottom - 12)}px`;
}
