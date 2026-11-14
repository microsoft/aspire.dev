// Ported from src/frontend/src/components/LoopingVideo.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
// @ts-nocheck -- Client-side DOM manipulation with runtime casts; suppress to avoid implicit any noise.
let themeObserver;

function getCurrentTheme() {
  const html = document.documentElement;
  return html.getAttribute('data-theme') || 'light';
}

function getThemeSources(sources, theme) {
  const themed = sources.filter((s) => s.theme === theme);
  if (themed.length > 0) return themed;
  return sources.filter((s) => !s.theme);
}

function updateVideoSource(video) {
  if (!(video instanceof HTMLVideoElement)) return;
  const sourcesAttr = video.getAttribute('data-sources');
  if (!sourcesAttr) return;
  let sources;
  try {
    sources = JSON.parse(sourcesAttr);
  } catch {
    return;
  }

  const currentTime = video.currentTime;
  const duration = video.duration;
  const playbackPercentage = duration > 0 ? currentTime / duration : 0;
  const wasPlaying = !video.paused;

  const theme = getCurrentTheme();
  const themeSources = getThemeSources(sources, theme);
  while (video.firstChild) video.removeChild(video.firstChild);
  themeSources.forEach(({ src, type, title }) => {
    const source = document.createElement('source');
    source.src = src;
    source.type = type;
    if (title) source.title = title;
    video.appendChild(source);
  });

  const restorePlayback = () => {
    if (video.duration > 0) {
      video.currentTime = video.duration * playbackPercentage;
      if (wasPlaying) {
        video.play().catch(() => {});
      }
    }
    video.removeEventListener('loadedmetadata', restorePlayback);
  };
  video.addEventListener('loadedmetadata', restorePlayback);
  video.load();
}

function updateAllLoopingVideos() {
  document.querySelectorAll('video.looping-video').forEach((el) => updateVideoSource(el));
}

function initButtons() {
  const prefersNoHover = window.matchMedia && window.matchMedia('(hover: none)').matches;
  document.querySelectorAll('.looping-video-wrapper').forEach((wrapper) => {
    if (wrapper.dataset.loopingVideoInitialized === 'true') return;

    const video = wrapper.querySelector('video.looping-video');
    const btn = wrapper.querySelector('.looping-video-toggle');
    if (!(video instanceof HTMLVideoElement) || !(btn instanceof HTMLButtonElement)) return;
    wrapper.dataset.loopingVideoInitialized = 'true';
    const srOnly = btn.querySelector('.sr-only');

    function syncButton() {
      const playing = !video.paused && !video.ended;
      btn.dataset.state = playing ? 'playing' : 'paused';
      btn.setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
      if (srOnly) srOnly.textContent = playing ? 'Pause video' : 'Play video';
    }

    let hideTimer = null;
    function showButtonTransient() {
      // Show (or keep) button visible briefly after interaction on all devices
      btn.classList.add('force-visible');
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        btn.classList.remove('force-visible');
        // Blur to prevent lingering focus style for mouse users
        if (!prefersNoHover && document.activeElement === btn) {
          btn.blur();
        }
      }, 1500);
    }

    function togglePlayback() {
      if (video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
      syncButton();
      showButtonTransient();
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePlayback();
    });

    if (prefersNoHover) {
      // Tap anywhere on video to toggle on mobile-like devices
      video.addEventListener('click', togglePlayback);
    }

    // Keyboard accessibility: toggle playback on Enter/Space when video is focused
    video.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        togglePlayback();
      }
    });

    // Show native controls when video receives keyboard focus (for a11y)
    const hasExplicitControls = video.hasAttribute('controls');
    video.addEventListener('focus', (e) => {
      // Only show controls if focus came from keyboard (not mouse click)
      if (e.target === video && !video.matches(':hover')) {
        video.setAttribute('controls', '');
      }
    });
    video.addEventListener('blur', () => {
      // Restore original controls state when focus leaves
      if (!hasExplicitControls) {
        video.removeAttribute('controls');
      }
    });

    video.addEventListener('play', syncButton);
    video.addEventListener('pause', syncButton);
    syncButton();
  });
}

function initLoopingVideos() {
  try {
    themeObserver?.disconnect();
    themeObserver = undefined;
    if (!document.querySelector('.looping-video-wrapper')) return;

    updateAllLoopingVideos();
    initButtons();

    themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'data-theme' &&
          mutation.target === document.documentElement
        ) {
          updateAllLoopingVideos();
        }
      }
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  } catch (error) {
    console.error('Failed to initialize looping videos:', error);
  }
}

if (document.readyState !== 'loading') initLoopingVideos();
export {};
