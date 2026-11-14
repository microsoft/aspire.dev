// Ported from src/frontend/src/components/DashboardCarousel.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
export function initDashboardCarousel(): void {
  (() => {
    function init() {
      const root = document.querySelector<HTMLElement>('[data-dashboard-carousel]');
      if (!root || root.dataset.initialized === 'true') return;
      root.dataset.initialized = 'true';

      const stage = root.querySelector<HTMLElement>('[data-stage]');
      const slides = Array.from(root.querySelectorAll<HTMLElement>('[data-slide]'));
      const dots = Array.from(root.querySelectorAll<HTMLElement>('[data-dot]'));
      const prevBtn = root.querySelector<HTMLElement>('[data-prev]');
      const nextBtn = root.querySelector<HTMLElement>('[data-next]');
      const n = slides.length;
      if (!stage || n === 0) {
        delete root.dataset.initialized;
        return;
      }

      // TypeScript doesn't carry the narrowing of `root` and `stage` into the hoisted function
      // declarations below, so those assert it (`root!`, `stage!`).

      const reduce =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const autoplay = root.dataset.autoplay !== 'false';
      const stagePresentation = root.dataset.presentation === 'stage';
      if (reduce) root.classList.add('reduced-motion');

      const MAX_VISIBLE = 2;
      let active = 0;
      let zoomOpen = false;
      let zoomIndex = 0;
      let zoomObserver: MutationObserver | null = null;
      let cleaned = false;
      const cleanupTasks: Array<() => void> = [];

      const focusableSelector = [
        'a[href]',
        'button',
        'input',
        'select',
        'textarea',
        '[tabindex]',
      ].join(',');

      type EventMapFor<T> = T extends Window
        ? WindowEventMap
        : T extends Document
          ? DocumentEventMap
          : HTMLElementEventMap;

      function addListener<T extends EventTarget, K extends keyof EventMapFor<T> & string>(
        target: T,
        type: K,
        handler: (event: EventMapFor<T>[K]) => void,
        options?: boolean | AddEventListenerOptions
      ) {
        target.addEventListener(type, handler as EventListener, options);
        cleanupTasks.push(() =>
          target.removeEventListener(type, handler as EventListener, options)
        );
      }

      function setSlideTabbable(slide: HTMLElement, tabbable: boolean) {
        if (tabbable) {
          slide.removeAttribute('aria-hidden');
        } else {
          slide.setAttribute('aria-hidden', 'true');
        }
        slide.querySelectorAll(focusableSelector).forEach((el) => {
          if (!(el instanceof HTMLElement)) return;
          if (tabbable) {
            if (el.dataset.carouselTabindex === undefined) return;
            if (el.dataset.carouselTabindex === '') {
              el.removeAttribute('tabindex');
            } else {
              el.setAttribute('tabindex', el.dataset.carouselTabindex);
            }
            delete el.dataset.carouselTabindex;
          } else {
            if (el.dataset.carouselTabindex === undefined) {
              el.dataset.carouselTabindex = el.getAttribute('tabindex') ?? '';
            }
            el.setAttribute('tabindex', '-1');
          }
        });
      }

      function cleanup() {
        if (cleaned) return;
        cleaned = true;
        stopPlayback();
        if (viewportRafId !== null) cancelAnimationFrame(viewportRafId);
        viewportRafId = null;
        clearViewportFailSafe();
        if (zoomObserver) zoomObserver.disconnect();
        cleanupTasks.splice(0).forEach((dispose) => dispose());
        root!.removeAttribute('data-viewport-active');
        delete root!.dataset.initialized;
      }

      addListener(window, 'pagehide', cleanup, { once: true });

      // Prevent the browser's native image drag/highlight ghost during swipe.
      slides.forEach((s) => {
        const img = s.querySelector('img');
        if (img) img.setAttribute('draggable', 'false');
      });

      // Shortest signed distance on the ring of slides (enables infinite coverflow).
      function ringOffset(i: number) {
        let o = i - active;
        if (o > n / 2) o -= n;
        if (o < -n / 2) o += n;
        return o;
      }

      // Per-offset coverflow tuning (index = absolute distance from center).
      // Neighbors step down in scale so the active slide reads larger; the far
      // edges recede, fade, and blur. The near slides stay fully opaque so they
      // cleanly occlude the far slide stacked behind them (no bleed-through);
      // only the outermost slides fade, and they sit over the page background.
      const STEP = 43; // percent of card width between neighbors
      const TUNE = [
        { scale: 1, tz: 0, rot: 0, op: 1, blur: 0 },
        { scale: 0.72, tz: -120, rot: 32, op: 1, blur: 1.3 },
        { scale: 0.58, tz: -230, rot: 42, op: 0.52, blur: 4.2 },
      ];

      function render() {
        for (let i = 0; i < n; i++) {
          const slide = slides[i];
          const o = ringOffset(i);
          const isActive = o === 0;

          if (stagePresentation) {
            const stageOffset = Math.max(-1, Math.min(1, o));
            slide.style.transform = `translate3d(${stageOffset * 3.5}%, 0, 0) scale(${
              isActive ? 1 : 0.985
            })`;
            slide.style.opacity = isActive ? '1' : '0';
            slide.style.zIndex = isActive ? '2' : '1';
            slide.style.filter = 'none';
            slide.style.pointerEvents = isActive ? 'auto' : 'none';
            slide.classList.toggle('is-active', isActive);
            setSlideTabbable(slide, isActive);
            if (isActive) {
              slide.setAttribute('aria-current', 'true');
            } else {
              slide.removeAttribute('aria-current');
            }
            continue;
          }

          const abs = Math.abs(o);
          const sign = Math.sign(o);
          const hidden = abs > MAX_VISIBLE;
          const t = TUNE[Math.min(abs, TUNE.length - 1)];

          const x = o * STEP; // percent of card width -> horizontal spacing / overlap
          const rotateY = o === 0 ? 0 : sign * -t.rot;

          slide.style.transform =
            `translate(-50%, -50%) translateX(${x}%) translateZ(${t.tz}px)` +
            ` rotateY(${rotateY}deg) scale(${t.scale})`;
          slide.style.opacity = hidden ? '0' : String(t.op);
          slide.style.zIndex = String(100 - abs);
          slide.style.filter = t.blur ? `blur(${t.blur}px)` : 'none';
          slide.style.pointerEvents = hidden ? 'none' : 'auto';
          slide.classList.toggle('is-active', o === 0);
          setSlideTabbable(slide, o === 0);
          if (o === 0) {
            slide.setAttribute('aria-current', 'true');
          } else {
            slide.removeAttribute('aria-current');
          }
        }
        dots.forEach((d, i) => d.setAttribute('aria-pressed', i === active ? 'true' : 'false'));
      }

      function setActive(i: number) {
        active = ((i % n) + n) % n;
        render();
      }

      function next() {
        setActive(active + 1);
      }
      function prev() {
        setActive(active - 1);
      }

      function measure() {
        // Round up so fractional responsive heights never clip the screenshot.
        const centered = slides[active];
        const h = centered.getBoundingClientRect().height;
        if (h) stage!.style.height = `${Math.ceil(h)}px`;
      }

      // --- Controls ---
      nextBtn && addListener(nextBtn, 'click', () => manualNav(next));
      prevBtn && addListener(prevBtn, 'click', () => manualNav(prev));
      dots.forEach((d) =>
        addListener(d, 'click', () => manualNav(() => setActive(Number(d.dataset.index) || 0)))
      );

      // Click a side slide to bring it to the center.
      slides.forEach((s) =>
        addListener(s, 'click', () => {
          if (!s.classList.contains('is-active'))
            manualNav(() => setActive(Number(s.dataset.index) || 0));
        })
      );

      // Keyboard navigation when the carousel has focus.
      root.setAttribute('tabindex', '0');
      addListener(root, 'keydown', (e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          manualNav(next);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          manualNav(prev);
        }
      });

      // Pointer / touch swipe. Works for mouse drag and finger swipe. We lock
      // onto the gesture only once horizontal movement dominates, so vertical
      // finger scrolling still pans the page normally.
      const SWIPE_THRESHOLD = 40; // px of travel required to change slides
      const INTENT_SLOP = 8; // px before we decide swipe vs. scroll
      let startX: number | null = null;
      let startY: number | null = null;
      let swiping = false; // horizontal gesture claimed
      let dragged = false; // moved enough to suppress the trailing click

      addListener(
        root,
        'pointerdown',
        (e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          startX = e.clientX;
          startY = e.clientY;
          swiping = false;
          dragged = false;
        },
        { passive: true }
      );

      addListener(
        root,
        'pointermove',
        (e) => {
          if (startX === null) return;
          const dx = e.clientX - startX;
          const dy = e.clientY - startY!;
          if (!swiping) {
            if (Math.abs(dx) < INTENT_SLOP && Math.abs(dy) < INTENT_SLOP) return;
            if (Math.abs(dx) > Math.abs(dy)) {
              swiping = true; // horizontal -> we own this gesture
            } else {
              startX = null; // vertical -> let the page scroll
              return;
            }
          }
          dragged = true;
          if (e.cancelable) e.preventDefault(); // block scroll/selection mid-swipe
        },
        { passive: false }
      );

      function endSwipe(e: PointerEvent) {
        if (startX === null) {
          swiping = false;
          return;
        }
        const dx = e.clientX - startX;
        const wasSwiping = swiping;
        startX = null;
        startY = null;
        swiping = false;
        if (wasSwiping && Math.abs(dx) > SWIPE_THRESHOLD) {
          manualNav(dx < 0 ? next : prev);
        }
      }
      addListener(root, 'pointerup', endSwipe);
      addListener(root, 'pointercancel', () => {
        startX = null;
        startY = null;
        swiping = false;
      });

      // A swipe must not also fire the trailing click (which would zoom the
      // active image or re-center a side slide). Swallow it in the capture
      // phase before the slide/zoom handlers see it.
      addListener(
        root,
        'click',
        (e) => {
          if (dragged) {
            e.stopPropagation();
            e.preventDefault();
            dragged = false;
          }
        },
        true
      );

      // --- Playback engine (rAF progress + optional visible controls) ---
      // A steady progress bar drives auto-advance. Visible playback UI (the
      // bottom-left play/pause button and the progress bar) is only shown for
      // the stage presentation; the coverflow presentation keeps the classic
      // silent hover-to-pause autoplay with no chrome.
      const DURATION = 7000; // ms spent on each slide while playing
      const toggleBtn = root.querySelector<HTMLElement>('[data-playback-toggle]');
      const progressFill = root.querySelector<HTMLElement>('[data-progress-fill]');
      const PLAY_LABEL = (toggleBtn && toggleBtn.dataset.labelPlay) || 'Play';
      const PAUSE_LABEL = (toggleBtn && toggleBtn.dataset.labelPause) || 'Pause';
      const controlsEnabled = stagePresentation && !reduce;
      root.dataset.playback = controlsEnabled ? 'on' : 'off';

      let isPlaying = autoplay && !reduce;
      let progress = 0; // 0..1 through the current slide
      let rafId: number | null = null;
      let lastTs = 0;
      let hovered = false;
      let focusWithin = false;
      let viewportActivated = !stagePresentation;
      let viewportActive = !stagePresentation;
      let viewportRafId: number | null = null;
      let viewportFailSafeTimer: number | null = null;
      let viewportFailSafeReady = false;

      function clearViewportFailSafe() {
        if (viewportFailSafeTimer !== null) clearTimeout(viewportFailSafeTimer);
        viewportFailSafeTimer = null;
        viewportFailSafeReady = false;
      }

      function revealHasSettled() {
        const reveal = root!.closest('[data-home-reveal]');
        if (!reveal) return true;
        if (!reveal.classList.contains('home-visible')) return false;

        const styles = getComputedStyle(reveal);
        if (Number.parseFloat(styles.opacity) < 0.995) return false;
        if (styles.transform === 'none') return true;

        try {
          const transform = new DOMMatrixReadOnly(styles.transform);
          return Math.abs(transform.m41) <= 2 && Math.abs(transform.m42) <= 2;
        } catch {
          return true;
        }
      }

      function evaluateViewport() {
        viewportRafId = null;
        if (!stagePresentation) return;

        const header = document.querySelector('header.header');
        const headerBounds = header && header.getBoundingClientRect();
        const viewportTop =
          headerBounds && headerBounds.top <= 0 && headerBounds.bottom > 0
            ? Math.min(headerBounds.bottom, window.innerHeight)
            : 0;
        const viewportBottom = window.innerHeight;
        const availableHeight = Math.max(0, viewportBottom - viewportTop);
        const bounds = stage!.getBoundingClientRect();
        const visibleTop = Math.max(bounds.top, viewportTop);
        const visibleBottom = Math.min(bounds.bottom, viewportBottom);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        const maximumVisibleHeight = Math.min(bounds.height, availableHeight);
        const intersects = visibleHeight > 2;
        const fullyPresented =
          maximumVisibleHeight > 0 && visibleHeight >= maximumVisibleHeight - 2;
        const failSafeEligible =
          maximumVisibleHeight > 0 && visibleHeight / maximumVisibleHeight >= 0.9;

        if (!viewportActivated) {
          if (
            revealHasSettled() &&
            (fullyPresented || (viewportFailSafeReady && failSafeEligible))
          ) {
            viewportActivated = true;
            clearViewportFailSafe();
            // Playback cannot advance before activation, so the active view is either the
            // first slide or one the reader chose; keep it rather than resetting to 0.
            progress = 0;
            updateProgressUI();
          } else if (failSafeEligible && viewportFailSafeTimer === null && !viewportFailSafeReady) {
            viewportFailSafeTimer = window.setTimeout(() => {
              viewportFailSafeTimer = null;
              viewportFailSafeReady = true;
              scheduleViewportEvaluation();
            }, 1000);
          } else if (!failSafeEligible) {
            clearViewportFailSafe();
          }
        }

        const nextActive = viewportActivated && intersects;
        if (nextActive === viewportActive) return;
        viewportActive = nextActive;
        root!.toggleAttribute('data-viewport-active', viewportActive);
        refreshPlayback();
      }

      function scheduleViewportEvaluation() {
        if (viewportRafId !== null) return;
        viewportRafId = requestAnimationFrame(evaluateViewport);
      }

      function handleViewportChange() {
        if (!viewportActivated) clearViewportFailSafe();
        scheduleViewportEvaluation();
      }

      function suspended() {
        if (!viewportActive || zoomOpen || document.hidden) return true;
        // In coverflow mode the pointer/focus pause keeps the marquee polite.
        // In stage mode the explicit button owns the play state, so hovering
        // must not fight the user's choice.
        if (!controlsEnabled && (hovered || focusWithin)) return true;
        return false;
      }

      function updateProgressUI() {
        if (!progressFill) return;
        const p = Math.max(0, Math.min(1, progress));
        progressFill.style.transform = `scaleX(${p})`;
      }

      function updateToggleUI() {
        if (!toggleBtn) return;
        toggleBtn.dataset.playing = isPlaying ? 'true' : 'false';
        toggleBtn.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
        toggleBtn.setAttribute('aria-label', isPlaying ? PAUSE_LABEL : PLAY_LABEL);
      }

      function stopRaf() {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        lastTs = 0;
      }

      function tick(ts: number) {
        rafId = null;
        if (!isPlaying || suspended()) return; // resume() restarts the loop
        if (lastTs === 0) lastTs = ts;
        const dt = ts - lastTs;
        lastTs = ts;
        progress += dt / DURATION;
        if (progress >= 1) {
          progress = 0;
          setActive(active + 1);
        }
        updateProgressUI();
        rafId = requestAnimationFrame(tick);
      }

      function resume() {
        if (!isPlaying || suspended() || rafId !== null) return;
        lastTs = 0;
        rafId = requestAnimationFrame(tick);
      }

      // Re-evaluate suspension after a hover/focus/visibility/zoom change.
      function refreshPlayback() {
        if (!isPlaying) return;
        if (suspended()) {
          stopRaf();
        } else {
          resume();
        }
      }

      function setPlaying(next: boolean) {
        if (isPlaying === next) return;
        isPlaying = next;
        updateToggleUI();
        if (isPlaying) {
          resume();
        } else {
          stopRaf();
        }
        updateProgressUI();
      }

      // Manual navigation resets the current slide's progress. In stage mode it
      // also drops into manual mode (paused); pressing play then resumes from
      // the start of whatever slide is now centered. Coverflow keeps playing.
      function manualNav(navFn: () => void) {
        navFn();
        progress = 0;
        if (controlsEnabled) {
          setPlaying(false);
        } else {
          lastTs = 0;
        }
        updateProgressUI();
      }

      toggleBtn && addListener(toggleBtn, 'click', () => setPlaying(!isPlaying));

      addListener(root, 'pointerenter', () => {
        hovered = true;
        refreshPlayback();
      });
      addListener(root, 'pointerleave', () => {
        hovered = false;
        refreshPlayback();
      });
      addListener(root, 'focusin', () => {
        focusWithin = true;
        refreshPlayback();
      });
      addListener(root, 'focusout', (e) => {
        if (root.contains(e.relatedTarget as Node | null)) return;
        focusWithin = false;
        refreshPlayback();
      });
      addListener(document, 'visibilitychange', refreshPlayback);
      if (stagePresentation) {
        addListener(window, 'scroll', handleViewportChange, { passive: true });
        addListener(window, 'resize', handleViewportChange, { passive: true });
        addListener(document, 'transitionend', scheduleViewportEvaluation, true);
      }

      function stopPlayback() {
        stopRaf();
      }

      // Pause autoplay while an image is zoomed open. starlight-image-zoom adds
      // the `starlight-image-zoom-opened` class to <body> for the duration.
      const body = document.body;

      // --- Zoom lightbox prev/next navigation ---------------------------------
      // starlight-image-zoom portals a `<dialog class="starlight-image-zoom-dialog">`
      // to <body> and clones the active slide's image into its <figure>. We add
      // prev/next arrows to that dialog so viewers can flip through every view
      // without unzooming. Clicks are kept from bubbling to the plugin's
      // document-level "click anywhere to close" handler.
      const zoomPrevLabel = (prevBtn && prevBtn.getAttribute('aria-label')) || 'Previous';
      const zoomNextLabel = (nextBtn && nextBtn.getAttribute('aria-label')) || 'Next';

      function fitZoomClone(clone: HTMLImageElement, natW: number, natH: number) {
        if (!natW || !natH) return;
        const maxW = Math.min(window.innerWidth, natW);
        const maxH = Math.min(window.innerHeight, natH);
        const scale = Math.min(maxW / natW, maxH / natH);
        const w = natW * scale;
        const h = natH * scale;
        clone.style.width = `${w}px`;
        clone.style.height = `${h}px`;
        clone.style.top = `${(window.innerHeight - h) / 2}px`;
        clone.style.left = `${(window.innerWidth - w) / 2}px`;
        clone.style.transform = '';
      }

      function zoomStep(dir: number) {
        if (n < 2) return;
        const dialog = document.querySelector('.starlight-image-zoom-dialog');
        if (!dialog) return;
        const clone = dialog.querySelector<HTMLImageElement>('figure img');
        if (!clone) return;
        zoomIndex = (((zoomIndex + dir) % n) + n) % n;
        const srcImg =
          slides[zoomIndex].querySelector<HTMLImageElement>('img.dashboard-shot') ||
          slides[zoomIndex].querySelector<HTMLImageElement>('img');
        if (!srcImg) return;
        const settle = () => {
          fitZoomClone(clone, srcImg.naturalWidth, srcImg.naturalHeight);
          requestAnimationFrame(() => clone.classList.remove('is-swapping'));
        };
        clone.classList.add('is-swapping');
        clone.srcset = srcImg.srcset || '';
        clone.sizes = srcImg.sizes || '';
        clone.src = srcImg.currentSrc || srcImg.src;
        clone.alt = srcImg.getAttribute('alt') || '';
        if (clone.complete && clone.naturalWidth) settle();
        else clone.addEventListener('load', settle, { once: true });
        const caption = dialog.querySelector('figcaption');
        if (caption) caption.textContent = clone.alt || slides[zoomIndex].dataset.slideLabel || '';
      }

      function injectZoomNav() {
        if (n < 2) return;
        const dialog = document.querySelector('.starlight-image-zoom-dialog');
        if (!dialog || dialog.querySelector('.carousel-zoom-nav')) return;
        const make = (dir: number, aria: string, path: string) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `carousel-zoom-nav ${dir < 0 ? 'is-prev' : 'is-next'}`;
          b.setAttribute('aria-label', aria);
          b.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"' +
            ` stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
          b.addEventListener('pointerdown', (e) => e.stopPropagation());
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            zoomStep(dir);
          });
          return b;
        };
        dialog.append(
          make(-1, zoomPrevLabel, '<polyline points="15 18 9 12 15 6"></polyline>'),
          make(1, zoomNextLabel, '<polyline points="9 18 15 12 9 6"></polyline>')
        );
      }

      addListener(document, 'keydown', (e) => {
        if (!zoomOpen) return;
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          zoomStep(1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          zoomStep(-1);
        }
      });

      zoomObserver = new MutationObserver(() => {
        const open = body.classList.contains('starlight-image-zoom-opened');
        if (open === zoomOpen) return;
        zoomOpen = open;
        if (open) {
          zoomIndex = active;
          injectZoomNav();
        } else if (zoomIndex !== active) {
          // Leave the carousel resting on the last view browsed in the lightbox.
          manualNav(() => setActive(zoomIndex));
        }
        refreshPlayback();
      });
      zoomObserver.observe(body, { attributes: true, attributeFilter: ['class'] });

      addListener(window, 'resize', measure);

      // Initial paint.
      root.classList.add('is-ready');
      requestAnimationFrame(() => {
        measure();
        render();
        updateToggleUI();
        updateProgressUI();
        scheduleViewportEvaluation();
        resume();
      });
    }

    if (document.readyState !== 'loading') init();
    else document.addEventListener('DOMContentLoaded', init, { once: true });
  })();
}
