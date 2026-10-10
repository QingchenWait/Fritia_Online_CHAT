export function initConversationManagementDesktop({ imagePanel }) {
  const desktop = matchMedia('(min-width: 761px)');
  imagePanel.querySelector('.conversation-share-scroll').addEventListener('keydown', event => {
    if (!desktop.matches || !['PageDown', 'PageUp'].includes(event.key)) return;
    event.preventDefault();
    event.currentTarget.scrollBy({ top: event.currentTarget.clientHeight * (event.key === 'PageDown' ? 0.85 : -0.85), behavior: 'smooth' });
  });
}
