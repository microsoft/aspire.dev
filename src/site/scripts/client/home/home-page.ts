// Ported from src/frontend/src/components/home/HomePage.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
import { loadLazyImagesNearViewport } from './lazy-images';
import { createViewportActivationObserver } from './viewport-activation';

export function initHomePage(): void {
  type AppHostLanguage = 'csharp' | 'typescript';
  type ModelStoryStage = 'code' | 'topology' | 'dashboard';
  type TerminalStatus = 'checking' | 'building' | 'preparing' | 'connecting' | 'dashboard';

  function isAppHostLanguage(value: unknown): value is AppHostLanguage {
    return value === 'csharp' || value === 'typescript';
  }

  function randomizeLanguageOrder(page: HTMLElement) {
    const list = page.querySelector<HTMLElement>('[data-language-list]');
    if (!list || list.dataset.randomized === 'true') return;

    const items = Array.from(list.querySelectorAll<HTMLElement>(':scope > li'));
    for (let index = items.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [items[index], items[randomIndex]] = [items[randomIndex]!, items[index]!];
    }

    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      item.style.setProperty('--home-reveal-delay', `${index * 45}ms`);
      fragment.append(item);
    });
    list.append(fragment);
    list.dataset.randomized = 'true';
  }

  function createModelStory(root: HTMLElement, reducedMotion: boolean) {
    const command = root.querySelector<HTMLElement>('[data-terminal-command]');
    const toggle = root.querySelector<HTMLButtonElement>('[data-model-story-toggle]');
    const outputLines = Array.from(root.querySelectorAll<HTMLElement>('[data-terminal-output]'));
    const statusLine = root.querySelector<HTMLElement>('[data-terminal-status]');
    const statusText = root.querySelector<HTMLElement>('[data-terminal-status-text]');
    const summaryLines = Array.from(root.querySelectorAll<HTMLElement>('[data-terminal-summary]'));
    const appHostOutput = root.querySelector<HTMLElement>('[data-terminal-apphost]');
    const stageLabels = Array.from(root.querySelectorAll<HTMLElement>('[data-model-stage-label]'));
    const stageSurface = root.querySelector<HTMLElement>('[data-model-story-surface]');
    const graph = root.querySelector<HTMLElement>('[data-model-graph]');
    if (!command || !toggle || !statusLine || !statusText || !appHostOutput || !stageSurface) {
      return null;
    }

    const commandText = command.dataset.command ?? 'aspire run';
    const cycleDuration = 15_500;
    const commandStart = 280;
    const commandInterval = 58;
    const commandEnd = commandStart + Math.max(commandText.length - 1, 0) * commandInterval;
    const stageResumeAt: Record<ModelStoryStage, number> = {
      code: 1_250,
      topology: 5_050,
      dashboard: 9_650,
    };
    const timers = new Set<number>();
    let playing = false;
    let playbackAllowed = false;
    let manuallyPaused = false;
    let cycleElapsed = 0;
    let cycleStartedAt = 0;
    const initialLanguage = root.dataset.storyLanguage;
    let storyLanguage: AppHostLanguage = isAppHostLanguage(initialLanguage)
      ? initialLanguage
      : 'typescript';
    let activeStatus: TerminalStatus | null = null;

    const dashboard = root.querySelector<HTMLElement>('[data-model-dashboard]');
    const dashRows = dashboard
      ? Array.from(dashboard.querySelectorAll<HTMLElement>('[data-dash-row]'))
      : [];
    const dashCount = dashboard?.querySelector<HTMLElement>('[data-dash-count]') ?? null;
    const dashTimers = new Set<number>();
    let dashState: 'idle' | 'animating' | 'final' = 'idle';

    const clearDashTimers = () => {
      dashTimers.forEach((timer) => window.clearTimeout(timer));
      dashTimers.clear();
    };

    const setDashCount = (value: number) => {
      if (dashCount) dashCount.textContent = String(value);
    };

    const resetDashboard = () => {
      if (!dashboard || dashState === 'idle') return;
      clearDashTimers();
      dashState = 'idle';
      dashRows.forEach((row) => row.classList.remove('is-visible', 'is-online'));
      setDashCount(0);
    };

    const finalizeDashboard = () => {
      if (!dashboard) return;
      clearDashTimers();
      dashState = 'final';
      dashRows.forEach((row) => row.classList.add('is-visible', 'is-online'));
      setDashCount(dashRows.length);
    };

    const animateDashboard = () => {
      if (!dashboard || dashState === 'animating') return;
      clearDashTimers();
      dashState = 'animating';
      dashRows.forEach((row) => row.classList.remove('is-visible', 'is-online'));
      setDashCount(0);
      let online = 0;
      dashRows.forEach((row, index) => {
        const appearAt = 140 + index * 300;
        const onlineAt = appearAt + 900 + index * 160;
        const appearTimer = window.setTimeout(() => {
          dashTimers.delete(appearTimer);
          row.classList.add('is-visible');
        }, appearAt);
        dashTimers.add(appearTimer);
        const onlineTimer = window.setTimeout(() => {
          dashTimers.delete(onlineTimer);
          row.classList.add('is-online');
          online += 1;
          setDashCount(online);
        }, onlineAt);
        dashTimers.add(onlineTimer);
      });
    };

    const showDashboard = (animate: boolean) => {
      if (animate) animateDashboard();
      else finalizeDashboard();
    };

    const clearTimers = () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };

    const scheduleAt = (callback: () => void, timestamp: number) => {
      const delay = timestamp - cycleElapsed;
      if (delay < 0) return;

      const timer = window.setTimeout(() => {
        timers.delete(timer);
        if (playing) callback();
      }, delay);
      timers.add(timer);
    };

    const updateControl = () => {
      toggle.dataset.paused = String(manuallyPaused);
      toggle.setAttribute('aria-pressed', String(manuallyPaused));
      const playLabel = toggle.dataset.labelPlay ?? 'Play runtime story';
      const pauseLabel = toggle.dataset.labelPause ?? 'Pause runtime story';
      toggle.setAttribute('aria-label', manuallyPaused ? playLabel : pauseLabel);
    };

    const getAppHostFileName = () =>
      storyLanguage === 'typescript' ? 'apphost.mts' : 'apphost.cs';

    const getStatusText = (status: TerminalStatus) => {
      switch (status) {
        case 'checking':
          return `Checking project type... ${getAppHostFileName()}`;
        case 'building':
          return `Building AppHost... ${getAppHostFileName()}`;
        case 'preparing':
          return 'Preparing Aspire server...';
        case 'connecting':
          return 'Connecting to AppHost...';
        case 'dashboard':
          return 'Starting dashboard...';
      }
    };

    const syncTerminalLanguage = () => {
      appHostOutput.textContent = getAppHostFileName();
      if (activeStatus) {
        statusText.textContent = getStatusText(activeStatus);
      }
    };

    const showStatus = (status: TerminalStatus) => {
      activeStatus = status;
      syncTerminalLanguage();
      statusLine.hidden = false;
      statusLine.classList.add('is-visible');
      summaryLines.forEach((line) => line.classList.remove('is-visible'));
    };

    const showSummary = () => {
      activeStatus = null;
      statusLine.classList.remove('is-visible');
      statusLine.hidden = false;
      summaryLines.forEach((line) => line.classList.add('is-visible'));
    };

    const syncStageInteractivity = () => {
      const interactive =
        root.dataset.storySurface === 'visible' && root.dataset.storyFocus === 'stage';
      stageSurface.toggleAttribute('inert', !interactive);
      stageSurface.setAttribute('aria-hidden', String(!interactive));
    };

    const setSurfaceVisible = (visible: boolean) => {
      root.dataset.storySurface = visible ? 'visible' : 'hidden';
      syncStageInteractivity();
      graph?.toggleAttribute(
        'data-graph-active',
        playing && visible && root.dataset.storyStage === 'topology'
      );
    };

    const setFocus = (focus: 'terminal' | 'stage') => {
      const previousFocus = root.dataset.storyFocus;
      if (previousFocus && previousFocus !== focus) {
        root.dataset.storySwap = focus;
      }
      root.dataset.storyFocus = focus;
      syncStageInteractivity();
    };

    const setStage = (stage: ModelStoryStage) => {
      root.dataset.storyStage = stage;
      stageLabels.forEach((label) => {
        const active = label.dataset.modelStageLabel === stage;
        label.dataset.active = String(active);
        label.setAttribute('aria-pressed', String(active));
      });
      graph?.toggleAttribute(
        'data-graph-active',
        playing && root.dataset.storySurface === 'visible' && stage === 'topology'
      );
      if (stage === 'dashboard') {
        showDashboard(playing && !reducedMotion);
      } else {
        resetDashboard();
      }
    };

    const snapToStage = (stage: ModelStoryStage) => {
      manuallyPaused = true;
      updateControl();
      pause();
      command.textContent = commandText;
      root.removeAttribute('data-terminal-typing');
      if (stage === 'code') {
        showStatus(storyLanguage === 'typescript' ? 'preparing' : 'checking');
      } else if (stage === 'topology') {
        showStatus('connecting');
      } else {
        showSummary();
      }
      setStage(stage);
      setSurfaceVisible(true);
      setFocus('stage');
      graph?.toggleAttribute('data-graph-active', stage === 'topology');
      cycleElapsed = stageResumeAt[stage];
    };

    const handleStageClick = (event: Event) => {
      const stage = (event.currentTarget as HTMLElement).dataset.modelStageLabel;
      if (stage === 'code' || stage === 'topology' || stage === 'dashboard') {
        snapToStage(stage);
      }
    };

    const setLanguage = (language: AppHostLanguage) => {
      storyLanguage = language;
      root.dataset.storyLanguage = language;
      if (
        language === 'typescript' &&
        (activeStatus === 'checking' || activeStatus === 'building')
      ) {
        activeStatus = 'preparing';
      } else if (language === 'csharp' && activeStatus === 'preparing') {
        activeStatus = 'building';
      }
      syncTerminalLanguage();
    };

    const reset = () => {
      command.textContent = '';
      activeStatus = null;
      statusLine.hidden = false;
      outputLines.forEach((line) => line.classList.remove('is-visible'));
      root.setAttribute('data-terminal-typing', 'true');
      setStage('code');
      setSurfaceVisible(false);
      setFocus('terminal');
    };

    const pause = () => {
      if (playing) {
        cycleElapsed = Math.min(cycleDuration, performance.now() - cycleStartedAt);
      }
      playing = false;
      clearTimers();
      clearDashTimers();
      root.removeAttribute('data-terminal-typing');
      root.dataset.storyPlaying = 'false';
      graph?.removeAttribute('data-graph-active');
    };

    const showFinalState = () => {
      pause();
      command.textContent = commandText;
      showSummary();
      setStage('dashboard');
      setSurfaceVisible(true);
      setFocus('stage');
      cycleElapsed = cycleDuration;
    };

    const scheduleTimeline = () => {
      Array.from(commandText).forEach((_, index) => {
        scheduleAt(
          () => {
            command.textContent = commandText.slice(0, index + 1);
            if (index === commandText.length - 1) {
              root.removeAttribute('data-terminal-typing');
            }
          },
          commandStart + index * commandInterval
        );
      });

      scheduleAt(
        () => showStatus(storyLanguage === 'typescript' ? 'preparing' : 'checking'),
        1_250
      );
      scheduleAt(() => {
        if (storyLanguage === 'csharp') {
          showStatus('building');
        }
      }, 2_050);
      scheduleAt(() => {
        showStatus('connecting');
        setStage('code');
        setSurfaceVisible(true);
        setFocus('stage');
      }, 2_900);
      scheduleAt(() => setStage('topology'), 5_050);
      scheduleAt(() => setFocus('terminal'), 7_200);
      scheduleAt(() => showStatus('dashboard'), 7_600);
      scheduleAt(showSummary, 8_850);
      scheduleAt(() => {
        setStage('dashboard');
        setFocus('stage');
      }, 9_650);
      scheduleAt(() => {
        cycleElapsed = 0;
        cycleStartedAt = performance.now();
        reset();
        scheduleTimeline();
      }, cycleDuration);
    };

    const resume = () => {
      if (playing || reducedMotion || manuallyPaused || !playbackAllowed) return;

      if (cycleElapsed >= cycleDuration) {
        cycleElapsed = 0;
      }
      if (cycleElapsed === 0) {
        reset();
      }

      clearTimers();
      playing = true;
      cycleStartedAt = performance.now() - cycleElapsed;
      root.dataset.storyPlaying = 'true';
      root.toggleAttribute('data-terminal-typing', cycleElapsed < commandEnd);
      graph?.toggleAttribute(
        'data-graph-active',
        root.dataset.storySurface === 'visible' && root.dataset.storyStage === 'topology'
      );
      scheduleTimeline();
    };

    const syncPlayback = () => {
      if (playbackAllowed && !manuallyPaused) {
        resume();
      } else {
        pause();
      }
    };

    const setPlaybackAllowed = (allowed: boolean) => {
      playbackAllowed = allowed;
      syncPlayback();
    };

    const handleToggle = () => {
      manuallyPaused = !manuallyPaused;
      updateControl();
      syncPlayback();
    };

    const flowSvg = graph?.querySelector<SVGSVGElement>('.graph-flow') ?? null;
    const edgeSpecs = [
      {
        path: '.flow-1',
        from: '.resource-frontend .graph-handle-right',
        to: '.resource-api .graph-handle-left',
        label: '.label-discovery',
      },
      {
        path: '.flow-2',
        from: '.resource-api .graph-handle-right',
        to: '.resource-database .graph-handle-left',
        label: '.label-connection',
      },
      {
        path: '.flow-3',
        from: '.resource-frontend .graph-handle-right',
        to: '.resource-cache .graph-handle-left',
        label: '.label-cache',
      },
    ];

    const handleCenter = (el: Element, originX: number, originY: number) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - originX, y: r.top + r.height / 2 - originY };
    };

    const routeEdges = () => {
      if (!graph || !flowSvg) return;
      const rect = flowSvg.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      flowSvg.setAttribute('viewBox', `0 0 ${rect.width.toFixed(1)} ${rect.height.toFixed(1)}`);
      for (const spec of edgeSpecs) {
        const path = flowSvg.querySelector<SVGPathElement>(spec.path);
        const fromEl = graph.querySelector(spec.from);
        const toEl = graph.querySelector(spec.to);
        if (!path || !fromEl || !toEl) continue;
        const s = handleCenter(fromEl, rect.left, rect.top);
        const t = handleCenter(toEl, rect.left, rect.top);
        const k = Math.max(26, Math.abs(t.x - s.x) * 0.5);
        path.setAttribute(
          'd',
          `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} C ${(s.x + k).toFixed(1)} ${s.y.toFixed(1)}, ${(t.x - k).toFixed(1)} ${t.y.toFixed(1)}, ${t.x.toFixed(1)} ${t.y.toFixed(1)}`
        );
        const label = graph.querySelector<HTMLElement>(spec.label);
        if (label) {
          label.style.left = `${((s.x + t.x) / 2).toFixed(1)}px`;
          label.style.top = `${((s.y + t.y) / 2).toFixed(1)}px`;
          const arrow = label.querySelector<SVGElement>('.flow-arrow');
          if (arrow) {
            const angle = (Math.atan2(t.y - s.y, t.x - s.x) * 180) / Math.PI;
            arrow.style.transform = `rotate(${angle.toFixed(1)}deg)`;
          }
        }
      }
    };

    let routeRaf = 0;
    const routeTick = () => {
      routeEdges();
      routeRaf = requestAnimationFrame(routeTick);
    };
    const stopRouting = () => {
      if (routeRaf) {
        cancelAnimationFrame(routeRaf);
        routeRaf = 0;
      }
    };
    const startRouting = () => {
      stopRouting();
      routeRaf = reducedMotion
        ? requestAnimationFrame(() => {
            routeEdges();
            routeRaf = 0;
          })
        : requestAnimationFrame(routeTick);
    };
    const handleGraphActive = () => {
      if (graph?.hasAttribute('data-graph-active')) startRouting();
      else stopRouting();
    };

    let graphActiveObserver: MutationObserver | null = null;
    let graphResizeObserver: ResizeObserver | null = null;
    if (graph && flowSvg) {
      graphActiveObserver = new MutationObserver(handleGraphActive);
      graphActiveObserver.observe(graph, {
        attributes: true,
        attributeFilter: ['data-graph-active'],
      });
      if (typeof ResizeObserver !== 'undefined') {
        graphResizeObserver = new ResizeObserver(() => routeEdges());
        graphResizeObserver.observe(graph);
      }
      handleGraphActive();
    }

    const destroy = () => {
      pause();
      stopRouting();
      clearDashTimers();
      graphActiveObserver?.disconnect();
      graphResizeObserver?.disconnect();
      toggle.removeEventListener('click', handleToggle);
      stageLabels.forEach((label) => label.removeEventListener('click', handleStageClick));
    };

    toggle.addEventListener('click', handleToggle);
    stageLabels.forEach((label) => label.addEventListener('click', handleStageClick));
    updateControl();

    if (reducedMotion) {
      toggle.disabled = true;
      showFinalState();
    } else {
      reset();
      root.dataset.storyPlaying = 'false';
    }

    return { destroy, setLanguage, setPlaybackAllowed };
  }

  function initializeHomeReveals() {
    const page = document.querySelector<HTMLElement>('.aspire-home');
    if (!page || page.dataset.revealsInitialized === 'true') return;

    randomizeLanguageOrder(page);
    page.dataset.revealsInitialized = 'true';
    document.documentElement.dataset.homeJs = 'true';
    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-home-reveal]'));
    const modelStoryRoot = page.querySelector<HTMLElement>('[data-model-story]');
    const modelStoryActivationTarget =
      modelStoryRoot?.querySelector<HTMLElement>('.model-window') ?? null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const modelStory = modelStoryRoot
      ? createModelStory(modelStoryRoot, reducedMotion.matches)
      : null;
    // The icon of the language that isn't selected is `display: none`, which never starts native
    // lazy loading, so load it as the section nears the viewport instead of on the first toggle.
    const stopModelIconLoading = modelStoryRoot ? loadLazyImagesNearViewport(modelStoryRoot) : null;
    const selectedLanguage = page.querySelector<HTMLButtonElement>(
      '.home-hero-product .lang-toggle[aria-pressed="true"]'
    )?.dataset.lang;
    if (modelStory && isAppHostLanguage(selectedLanguage)) {
      modelStory.setLanguage(selectedLanguage);
    }

    const handleAppHostLanguageChange = (event: Event) => {
      const language = (event as CustomEvent<{ language?: unknown }>).detail?.language;
      if (modelStory && isAppHostLanguage(language)) {
        modelStory.setLanguage(language);
      }
    };
    document.addEventListener('aspire:apphost-language-change', handleAppHostLanguageChange);

    let modelStoryVisible = false;
    const revealItemsByTarget = new Map<HTMLElement, HTMLElement[]>();
    const entryRevealItemsByTarget = new Map<HTMLElement, HTMLElement[]>();
    items.forEach((item) => {
      const target =
        (item.dataset.homeRevealAnchor
          ? item.querySelector<HTMLElement>(item.dataset.homeRevealAnchor)
          : null) ?? item;
      const revealMap = item.hasAttribute('data-home-reveal-on-entry')
        ? entryRevealItemsByTarget
        : revealItemsByTarget;
      const revealItems = revealMap.get(target) ?? [];
      revealItems.push(item);
      revealMap.set(target, revealItems);
    });

    const revealItems = (revealMap: Map<HTMLElement, HTMLElement[]>, target: HTMLElement) => {
      revealMap.get(target)?.forEach((item) => item.classList.add('home-visible'));
      document.dispatchEvent(new Event('aspire:viewport-activation-refresh'));
    };
    const revealObserver = reducedMotion.matches
      ? null
      : createViewportActivationObserver(
          (target) => {
            revealItems(revealItemsByTarget, target);
          },
          { once: true, waitForReveal: false }
        );
    const entryRevealObserver = reducedMotion.matches
      ? null
      : createViewportActivationObserver(
          (target) => {
            revealItems(entryRevealItemsByTarget, target);
          },
          { once: true, requireComplete: false, waitForReveal: false }
        );
    if (reducedMotion.matches) {
      items.forEach((item) => item.classList.add('home-visible'));
    } else {
      revealItemsByTarget.forEach((_, target) => revealObserver?.observe(target));
      entryRevealItemsByTarget.forEach((_, target) => entryRevealObserver?.observe(target));
    }

    const updateModelStoryPlayback = () => {
      if (!modelStory || reducedMotion.matches) return;
      modelStory.setPlaybackAllowed(modelStoryVisible && !document.hidden);
    };

    const storyObserver =
      modelStoryRoot && modelStoryActivationTarget && modelStory && !reducedMotion.matches
        ? createViewportActivationObserver((_, active) => {
            modelStoryVisible = active;
            modelStoryRoot.toggleAttribute('data-story-viewport-active', active);
            updateModelStoryPlayback();
          })
        : null;
    if (modelStoryActivationTarget && storyObserver) {
      storyObserver.observe(modelStoryActivationTarget);
    } else if (modelStory && !reducedMotion.matches) {
      modelStoryVisible = true;
      updateModelStoryPlayback();
    }

    document.addEventListener('visibilitychange', updateModelStoryPlayback);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeHomeReveals, { once: true });
  } else {
    initializeHomeReveals();
  }
}
