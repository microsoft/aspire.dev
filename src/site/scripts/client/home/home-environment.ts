// Ported from src/frontend/src/components/home/HomeEnvironment.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
import { loadLazyImagesNearViewport } from './lazy-images';
import { createViewportActivationObserver } from './viewport-activation';

export function initHomeEnvironment(): void {
  function initializeHomeEnvironments() {
    const root = document.querySelector<HTMLElement>('[data-home-environments]');
    if (!root || root.dataset.environmentInitialized === 'true') return;

    const triggers = Array.from(
      root.querySelectorAll<HTMLButtonElement>('[data-environment-trigger]')
    );
    const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-environment-panel]'));
    const stageLabel = root.querySelector<HTMLElement>('[data-environment-stage-label]');
    const stage = root.querySelector<HTMLElement>('.environment-stage');
    const motionControl = root.querySelector<HTMLButtonElement>(
      '[data-environment-motion-control]'
    );
    const pauseIcon = motionControl?.querySelector<HTMLElement>('[data-environment-control-pause]');
    const playIcon = motionControl?.querySelector<HTMLElement>('[data-environment-control-play]');
    if (!stage || !motionControl || !pauseIcon || !playIcon) return;

    root.dataset.environmentInitialized = 'true';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let activeId = root.dataset.environmentState ?? 'local';
    let stageVisible = false;
    let manuallyPaused = false;

    const updateControl = () => {
      motionControl.hidden = reducedMotion.matches;
      const label = manuallyPaused
        ? (motionControl.dataset.labelPlay ?? 'Play environment animation')
        : (motionControl.dataset.labelPause ?? 'Pause environment animation');
      motionControl.setAttribute('aria-label', label);
      motionControl.setAttribute('title', label);
      motionControl.setAttribute('aria-pressed', String(manuallyPaused));
      pauseIcon.hidden = manuallyPaused;
      playIcon.hidden = !manuallyPaused;
    };

    const syncMotion = () => {
      const motionAvailable = stageVisible && !reducedMotion.matches;
      root.toggleAttribute('data-environment-motion-active', motionAvailable);
      root.toggleAttribute(
        'data-environment-paused',
        motionAvailable && (manuallyPaused || document.hidden)
      );
      updateControl();
    };

    const settlePanels = () => {
      panels.forEach((panel) => {
        const selected = panel.dataset.environmentPanel === activeId;
        panel.hidden = !selected;
        panel.setAttribute('aria-hidden', String(!selected));
        delete panel.dataset.transition;
      });
    };

    const selectEnvironment = (id: string, allowTransition = true) => {
      const nextIndex = triggers.findIndex((trigger) => trigger.dataset.environmentTrigger === id);
      if (nextIndex < 0) return;

      const previousId = activeId;
      const previousPanel = panels.find((panel) => panel.dataset.environmentPanel === previousId);
      const nextPanel = panels.find((panel) => panel.dataset.environmentPanel === id);
      panels.forEach((panel) => delete panel.dataset.transition);
      activeId = id;
      root.dataset.environmentState = id;
      triggers.forEach((trigger) => {
        const selected = trigger.dataset.environmentTrigger === id;
        trigger.setAttribute('aria-pressed', String(selected));
      });

      const selected = triggers.find((trigger) => trigger.dataset.environmentTrigger === id);
      if (stageLabel && selected) {
        stageLabel.textContent = selected.textContent?.trim().replace(/^\d+/, '') ?? '';
      }

      const shouldTransition =
        allowTransition &&
        previousId !== id &&
        previousPanel !== undefined &&
        nextPanel !== undefined &&
        stageVisible &&
        !manuallyPaused &&
        !document.hidden &&
        !reducedMotion.matches;
      if (shouldTransition && previousPanel && nextPanel) {
        panels.forEach((panel) => {
          panel.hidden = panel !== nextPanel;
          panel.setAttribute('aria-hidden', String(panel !== nextPanel));
        });
        void nextPanel.offsetWidth;
        nextPanel.dataset.transition = 'fade-in';
        // getAnimations() flushes style so the fade starts now; a click-time timer could
        // otherwise remove the attribute before a delayed frame ever started the animation.
        const fade = nextPanel
          .getAnimations()
          .find(
            (animation) =>
              animation instanceof CSSAnimation &&
              animation.animationName === 'environment-panel-fade-in'
          );
        if (fade) {
          fade.finished.then(
            () => {
              if (activeId === id && nextPanel.dataset.transition) settlePanels();
            },
            () => {}
          );
        } else {
          settlePanels();
        }
      } else {
        settlePanels();
      }

      document.documentElement.dataset.aspireEnvironmentState = id;
      document.dispatchEvent(new CustomEvent('aspire:environment-change', { detail: { id } }));
    };

    const handleClick = (event: Event) => {
      const trigger = event.currentTarget as HTMLButtonElement;
      if (trigger.dataset.environmentTrigger) {
        selectEnvironment(trigger.dataset.environmentTrigger);
      }
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = triggers.indexOf(event.currentTarget as HTMLButtonElement);
      let next = current;

      if (event.key === 'ArrowRight') next = (current + 1) % triggers.length;
      if (event.key === 'ArrowLeft') next = (current - 1 + triggers.length) % triggers.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = triggers.length - 1;

      triggers[next].focus();
      const id = triggers[next].dataset.environmentTrigger;
      if (id) selectEnvironment(id);
    };

    triggers.forEach((trigger) => {
      trigger.addEventListener('click', handleClick);
      trigger.addEventListener('keydown', handleKeydown);
    });

    const toggleMotion = () => {
      manuallyPaused = !manuallyPaused;
      if (manuallyPaused) settlePanels();
      syncMotion();
    };
    const handleMotionPreference = () => {
      if (reducedMotion.matches) {
        root.style.setProperty('--environment-scroll-factor', '0');
        root.removeAttribute('data-environment-stage-passed');
        settlePanels();
      }
      syncMotion();
    };
    const handleVisibility = () => {
      if (document.hidden) settlePanels();
      syncMotion();
    };
    motionControl.addEventListener('click', toggleMotion);
    reducedMotion.addEventListener('change', handleMotionPreference);
    document.addEventListener('visibilitychange', handleVisibility);
    selectEnvironment(activeId, false);

    // Panels that aren't displayed never start native lazy loading, so load their icons as the
    // section nears the viewport instead of when a visitor first selects a panel.
    const stopIconLoading = loadLazyImagesNearViewport(root);

    const motionObserver = createViewportActivationObserver((_, active) => {
      stageVisible = active;
      if (!stageVisible) settlePanels();
      syncMotion();
    });
    const scrollObserver =
      'IntersectionObserver' in window
        ? new IntersectionObserver(
            ([entry]) => {
              if (!entry) return;
              if (reducedMotion.matches) {
                root.style.setProperty('--environment-scroll-factor', '0');
                root.removeAttribute('data-environment-stage-passed');
                return;
              }
              const visibleProgress = Math.min(entry.intersectionRatio / 0.65, 1);
              root.style.setProperty(
                '--environment-scroll-factor',
                (1 - visibleProgress).toFixed(3)
              );
              root.toggleAttribute(
                'data-environment-stage-passed',
                entry.boundingClientRect.top < 0
              );
            },
            { threshold: Array.from({ length: 21 }, (_, index) => index / 20) }
          )
        : null;
    motionObserver.observe(stage);
    scrollObserver?.observe(stage);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeHomeEnvironments, { once: true });
  } else {
    initializeHomeEnvironments();
  }
}
