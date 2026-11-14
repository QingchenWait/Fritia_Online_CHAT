export function positionDeepSeekWebMobile(popover) {
  const viewport = window.visualViewport;
  const top = viewport?.offsetTop || 0;
  const bottom = top + (viewport?.height || window.innerHeight);
  const style = getComputedStyle(popover);
  const inset = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  const available = Math.max(0, Math.min(popover.getBoundingClientRect().bottom, bottom) - top - inset - 10);
  popover.style.setProperty('--chat-model-available-height', `${available}px`);
}
