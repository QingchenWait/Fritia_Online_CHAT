export function initConversationManagementMobile({ imagePanel }) {
  const mobile = matchMedia('(max-width: 760px)');
  const sync = () => {
    if (mobile.matches) imagePanel.style.setProperty('--management-viewport', `${window.visualViewport?.height || window.innerHeight}px`);
    else imagePanel.style.removeProperty('--management-viewport');
  };
  window.visualViewport?.addEventListener('resize', sync);
  window.addEventListener('resize', sync);
  mobile.addEventListener('change', sync);
  sync();
}
