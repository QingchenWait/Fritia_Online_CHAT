export function positionDeepSeekWebDesktop(popover) {
  const style = getComputedStyle(popover);
  const inset = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  const available = Math.max(0, Math.min(popover.getBoundingClientRect().bottom, window.innerHeight) - inset - 12);
  popover.style.setProperty('--chat-model-available-height', `${available}px`);
}
