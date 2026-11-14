export function initCharacterDeletionMobile(panel) {
  const mobile = matchMedia('(max-width: 760px)');
  const sync = () => {
    if (mobile.matches) panel.style.setProperty('--character-delete-viewport', `${window.visualViewport?.height || window.innerHeight}px`);
    else panel.style.removeProperty('--character-delete-viewport');
  };
  mobile.addEventListener('change', sync);
  window.visualViewport?.addEventListener('resize', sync);
  window.addEventListener('resize', sync);
  sync();
}
