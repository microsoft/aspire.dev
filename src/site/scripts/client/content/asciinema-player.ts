// Ported from src/frontend/src/components/AsciinemaPlayer.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed. The player (asciinema-player) is a lazy chunk, and its
// stylesheet is copied by build-client.mjs to /assets/js/vendor/asciinema-player.css and linked on demand.

function ensurePlayerStylesheet(): void {
  if (document.querySelector('link[data-asciinema-player-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/assets/js/vendor/asciinema-player.css';
  link.setAttribute('data-asciinema-player-css', '');
  document.head.append(link);
}

let themeObserver: MutationObserver | undefined;

async function initAsciinemaPlayer() {
  try {
    const containers = document.querySelectorAll('.asciinema-player-container');
    themeObserver?.disconnect();
    themeObserver = undefined;
    if (containers.length === 0) return;

    ensurePlayerStylesheet();
    const { create } = await import('asciinema-player');

    function createPlayers() {
      containers.forEach((container) => {
        const src = container.getAttribute('data-src');

        if (src && container instanceof HTMLElement) {
          // Clear existing player if any
          container.innerHTML = '';

          // Helper function to get attribute value with proper type conversion
          const getAttr = (name: string) => container.getAttribute(name);
          const getNumAttr = (name: string) => {
            const val = getAttr(name);
            return val ? parseFloat(val) : undefined;
          };
          const getBoolAttr = (name: string) => {
            const val = getAttr(name);
            return val === 'true' ? true : val === 'false' ? false : undefined;
          };

          // Get the current theme from the html data-theme attribute
          const htmlElement = document.documentElement;
          const currentTheme = htmlElement.getAttribute('data-theme');
          const autoTheme = currentTheme === 'light' ? 'nord' : 'dracula';

          // Build options object, only including defined values
          const options: any = {};

          // Terminal size options
          const cols = getNumAttr('data-cols');
          if (cols !== undefined) options.cols = cols;

          const rows = getNumAttr('data-rows');
          if (rows !== undefined) options.rows = rows;

          // Playback control options
          const autoPlay = getBoolAttr('data-autoplay');
          if (autoPlay !== undefined) options.autoPlay = autoPlay;

          const preload = getBoolAttr('data-preload');
          if (preload !== undefined) options.preload = preload;

          const loopAttr = getAttr('data-loop');
          if (loopAttr) {
            // loop can be boolean or number
            const loopNum = parseFloat(loopAttr);
            options.loop = isNaN(loopNum) ? loopAttr === 'true' : loopNum;
          }

          const startAt = getAttr('data-startat');
          if (startAt) {
            // startAt can be number or string (time format)
            const startAtNum = parseFloat(startAt);
            options.startAt = isNaN(startAtNum) ? startAt : startAtNum;
          }

          const speed = getNumAttr('data-speed');
          if (speed !== undefined) options.speed = speed;

          const idleTimeLimit = getNumAttr('data-idletimelimit');
          if (idleTimeLimit !== undefined) options.idleTimeLimit = idleTimeLimit;

          // Appearance options
          const themeAttr = getAttr('data-theme');
          options.theme = themeAttr || autoTheme;

          const poster = getAttr('data-poster');
          if (poster) options.poster = poster;

          const fit = getAttr('data-fit');
          if (fit) options.fit = fit === 'false' || fit === 'none' ? false : fit;

          const controls = getAttr('data-controls');
          if (controls) {
            options.controls =
              controls === 'auto'
                ? 'auto'
                : controls === 'true'
                  ? true
                  : controls === 'false'
                    ? false
                    : controls;
          }

          // Audio options
          const audioUrl = getAttr('data-audiourl');
          if (audioUrl) options.audioUrl = audioUrl;

          // Marker options
          const markersStr = getAttr('data-markers');
          if (markersStr) {
            try {
              options.markers = JSON.parse(markersStr);
            } catch (e) {
              console.error('Failed to parse markers:', e);
            }
          }

          const pauseOnMarkers = getBoolAttr('data-pauseonmarkers');
          if (pauseOnMarkers !== undefined) options.pauseOnMarkers = pauseOnMarkers;

          // Font options
          const terminalFontSize = getAttr('data-terminalfontsize');
          if (terminalFontSize) options.terminalFontSize = terminalFontSize;

          const terminalFontFamily = getAttr('data-terminalfontfamily');
          if (terminalFontFamily) options.terminalFontFamily = terminalFontFamily;

          const terminalLineHeight = getNumAttr('data-terminallineheight');
          if (terminalLineHeight !== undefined) options.terminalLineHeight = terminalLineHeight;

          // Debug options
          const loggerEnabled = getBoolAttr('data-logger');
          if (loggerEnabled) options.logger = console;

          // Apply defaults for backward compatibility
          if (options.autoPlay === undefined) options.autoPlay = false;
          if (options.fit === undefined) options.fit = 'none';
          if (options.idleTimeLimit === undefined) options.idleTimeLimit = 1.5;
          if (options.loop === undefined) options.loop = true;
          if (options.preload === undefined) options.preload = true;
          if (options.rows === undefined) options.rows = 15;
          if (options.speed === undefined) options.speed = 1.5;
          if (options.terminalFontFamily === undefined)
            options.terminalFontFamily = 'var(--__sl-font-mono)';
          if (options.terminalFontSize === undefined)
            options.terminalFontSize = 'var(--ec-codeFontSize)';
          if (options.poster === undefined) options.poster = 'npt:0:4';

          create(src, container, options);

          // Fix accessibility issues in the rendered player
          setTimeout(() => {
            const timer = container.querySelector('.ap-timer');
            if (timer && !timer.hasAttribute('aria-label')) {
              timer.setAttribute('aria-label', 'Playback timer');
            }
          }, 100);
        }
      });
    }

    createPlayers();

    themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'data-theme' &&
          mutation.target === document.documentElement
        ) {
          createPlayers();
        }
      });
    });

    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  } catch (error) {
    console.error('Failed to load asciinema player:', error);
  }
}

initAsciinemaPlayer();
export {};
