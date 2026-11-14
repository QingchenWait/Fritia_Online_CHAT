export function initCharacterDeletionDesktop(panel) {
  panel.querySelector('.character-delete-body').addEventListener('keydown', event => {
    if (!matchMedia('(min-width: 761px)').matches || !['PageUp', 'PageDown'].includes(event.key)) return;
    event.preventDefault();
    event.currentTarget.scrollBy({ top: event.currentTarget.clientHeight * (event.key === 'PageDown' ? .85 : -.85), behavior: 'smooth' });
  });
}
