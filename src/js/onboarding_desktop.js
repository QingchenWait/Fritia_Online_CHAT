const DESKTOP_QUERY = '(min-width: 761px) and (orientation: landscape)';

export function initOnboardingDesktopLayout({ welcomePanel, setupPanel } = {}) {
  const media = window.matchMedia(DESKTOP_QUERY);

  function syncLayout() {
    const active = media.matches;
    document.documentElement.classList.toggle('onboarding-layout-desktop', active);
    if (active) document.documentElement.dataset.onboardingLayout = 'desktop';
    else if (document.documentElement.dataset.onboardingLayout === 'desktop') {
      delete document.documentElement.dataset.onboardingLayout;
    }
  }

  function resetActiveScroll() {
    if (!media.matches) return;
    welcomePanel?.querySelector('.onboarding-welcome-scroll')?.scrollTo({ top: 0 });
    setupPanel?.querySelector('.quick-setup-scroll')?.scrollTo({ top: 0 });
  }

  media.addEventListener('change', syncLayout);
  document.addEventListener('fritia-onboarding-step-changed', resetActiveScroll);
  syncLayout();

  return {
    destroy() {
      media.removeEventListener('change', syncLayout);
      document.removeEventListener('fritia-onboarding-step-changed', resetActiveScroll);
      document.documentElement.classList.remove('onboarding-layout-desktop');
    }
  };
}
