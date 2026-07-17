const MOBILE_QUERY = '(max-width: 760px), (orientation: portrait)';

export function initOnboardingMobileLayout({ welcomePanel, setupPanel } = {}) {
  const media = window.matchMedia(MOBILE_QUERY);
  const viewport = window.visualViewport;

  function syncLayout() {
    const active = media.matches;
    document.documentElement.classList.toggle('onboarding-layout-mobile', active);
    if (active) document.documentElement.dataset.onboardingLayout = 'mobile';
    else if (document.documentElement.dataset.onboardingLayout === 'mobile') {
      delete document.documentElement.dataset.onboardingLayout;
    }
    syncViewportHeight();
  }

  function syncViewportHeight() {
    if (!media.matches) return;
    const height = viewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--onboarding-viewport-height', Math.round(height) + 'px');
  }

  function resetActiveScroll() {
    if (!media.matches) return;
    welcomePanel?.querySelector('.onboarding-welcome-scroll')?.scrollTo({ top: 0 });
    setupPanel?.querySelector('.quick-setup-scroll')?.scrollTo({ top: 0 });
  }

  function revealFocusedInput(event) {
    if (!media.matches || event.target?.id !== 'quick-setup-key-input') return;
    window.setTimeout(() => event.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
  }

  media.addEventListener('change', syncLayout);
  viewport?.addEventListener('resize', syncViewportHeight);
  viewport?.addEventListener('scroll', syncViewportHeight);
  document.addEventListener('fritia-onboarding-step-changed', resetActiveScroll);
  document.addEventListener('focusin', revealFocusedInput);
  syncLayout();

  return {
    destroy() {
      media.removeEventListener('change', syncLayout);
      viewport?.removeEventListener('resize', syncViewportHeight);
      viewport?.removeEventListener('scroll', syncViewportHeight);
      document.removeEventListener('fritia-onboarding-step-changed', resetActiveScroll);
      document.removeEventListener('focusin', revealFocusedInput);
      document.documentElement.classList.remove('onboarding-layout-mobile');
      document.documentElement.style.removeProperty('--onboarding-viewport-height');
    }
  };
}
