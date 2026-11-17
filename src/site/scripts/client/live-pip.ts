// Ported from src/frontend/src/components/LivePip.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
import {
  dismissLiveNotification,
  getCurrent,
  isLiveNotificationDismissed,
  subscribe,
  type LiveSnapshot,
} from '@components/live-status.ts';
import { ASPIRE_YOUTUBE_CHANNEL_ID } from '@components/stream-embeds';

type DocumentPictureInPictureApi = {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  window?: Window | null;
};

type LivePipState = {
  pipWindow: Window | null;
  activeEmbedKey: string;
  open: boolean;
  selectedSource: LiveSource | null;
};

type LiveSource = 'twitch' | 'youtube';

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPictureApi;
    __aspireLivePipState?: LivePipState;
  }
  interface DocumentEventMap {
    'aspire:live-pip-change': CustomEvent<{ open: boolean }>;
  }
}

const DEFAULT_TWITCH_CHANNEL = 'aspiredotdev';
const DEFAULT_YOUTUBE_HANDLE = 'aspiredotdev';
const SOURCE_PICKER_ID = 'aspire-live-source-menu';
const NARROW_VIEWPORT_QUERY = '(max-width: 799px)';
const TOUCH_FIRST_QUERY = '(hover: none) and (pointer: coarse)';

let current = getCurrent();
let sourcePickerAnchor: HTMLElement | null = null;
let pickerListeners: AbortController | undefined;

function getState(): LivePipState {
  return (window.__aspireLivePipState ??= {
    pipWindow: null,
    activeEmbedKey: '',
    open: false,
    selectedSource: null,
  });
}

function getPipWindow(): Window | null {
  const state = getState();
  const nativeWindow = window.documentPictureInPicture?.window;
  if (nativeWindow && !nativeWindow.closed && state.pipWindow !== nativeWindow) {
    state.pipWindow = nativeWindow;
  }
  if (state.pipWindow?.closed) {
    state.pipWindow = null;
    state.activeEmbedKey = '';
    state.open = false;
    state.selectedSource = null;
  }
  return state.pipWindow;
}

function publishPipState(open: boolean): void {
  const state = getState();
  if (state.open === open) return;
  state.open = open;
  document.dispatchEvent(new CustomEvent('aspire:live-pip-change', { detail: { open } }));
}

function clearPipState(): void {
  const state = getState();
  state.pipWindow = null;
  state.activeEmbedKey = '';
  state.selectedSource = null;
  publishPipState(false);
}

function isModifiedClick(evt: MouseEvent): boolean {
  return (
    evt.defaultPrevented ||
    evt.button !== 0 ||
    evt.altKey ||
    evt.ctrlKey ||
    evt.metaKey ||
    evt.shiftKey
  );
}

function parentHost(): string {
  return window.location.hostname || 'localhost';
}

function documentPipAvailable(): boolean {
  return (
    !window.matchMedia(TOUCH_FIRST_QUERY).matches &&
    typeof window.documentPictureInPicture?.requestWindow === 'function'
  );
}

function getLiveSources(snapshot: LiveSnapshot): LiveSource[] {
  const sources: LiveSource[] = [];
  if (snapshot.youtube.live) sources.push('youtube');
  if (snapshot.twitch.live) sources.push('twitch');
  return sources;
}

function sourceIsLive(snapshot: LiveSnapshot, source: LiveSource | null): source is LiveSource {
  return source === 'youtube'
    ? snapshot.youtube.live
    : source === 'twitch'
      ? snapshot.twitch.live
      : false;
}

function chooseSource(
  snapshot: LiveSnapshot,
  requestedSource = getState().selectedSource
): LiveSource | null {
  if (sourceIsLive(snapshot, requestedSource)) {
    return requestedSource;
  }

  const liveSources = getLiveSources(snapshot);
  if (liveSources.length === 1) {
    return liveSources[0];
  }

  if (sourceIsLive(snapshot, snapshot.primarySource)) {
    return snapshot.primarySource;
  }

  return liveSources[0] ?? null;
}

function sourceUrl(snapshot: LiveSnapshot, source: LiveSource): string {
  if (source === 'youtube') {
    return snapshot.youtube.videoId
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(snapshot.youtube.videoId)}`
      : `https://www.youtube.com/@${DEFAULT_YOUTUBE_HANDLE}/live`;
  }

  return `https://www.twitch.tv/${encodeURIComponent(snapshot.twitch.channel ?? DEFAULT_TWITCH_CHANNEL)}`;
}

function getEmbed(
  snapshot: LiveSnapshot,
  source: LiveSource | null
): { key: string; url: string; allow: string; label: string; source: LiveSource } | null {
  if (source === 'twitch' && snapshot.twitch.live) {
    const channel = snapshot.twitch.channel ?? DEFAULT_TWITCH_CHANNEL;
    return {
      key: `twitch:${channel}`,
      url: `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(parentHost())}&autoplay=true&muted=true`,
      allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture',
      label: `Twitch live stream from ${channel}`,
      source,
    };
  }

  if (source === 'youtube' && snapshot.youtube.live) {
    const id = snapshot.youtube.videoId;
    return {
      key: id ? `youtube:${id}` : `youtube-channel:${ASPIRE_YOUTUBE_CHANNEL_ID}`,
      url: id
        ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&mute=1`
        : `https://www.youtube-nocookie.com/embed/live_stream?channel=${encodeURIComponent(ASPIRE_YOUTUBE_CHANNEL_ID)}&autoplay=1&mute=1`,
      allow: 'autoplay; encrypted-media; picture-in-picture',
      label: 'YouTube live stream',
      source,
    };
  }

  return null;
}

function renderPip(snapshot: LiveSnapshot): void {
  const pipWindow = getPipWindow();
  if (!pipWindow) {
    publishPipState(false);
    return;
  }

  if (!snapshot.isLive) {
    pipWindow.close();
    clearPipState();
    return;
  }

  const embed = getEmbed(snapshot, chooseSource(snapshot));
  if (!embed) return;
  const state = getState();
  if (state.activeEmbedKey === embed.key) {
    state.selectedSource = embed.source;
    publishPipState(true);
    return;
  }

  const doc = pipWindow.document;
  const iframe = doc.createElement('iframe');
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.src = embed.url;
  iframe.allow = embed.allow;
  iframe.setAttribute('aria-label', embed.label);
  doc.title = 'Aspire live stream';
  doc.head.replaceChildren();

  const style = doc.createElement('style');
  style.textContent = `
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: #000;
      overflow: hidden;
    }
    iframe {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
    }
  `;
  doc.head.append(style);
  doc.body.replaceChildren(iframe);
  state.activeEmbedKey = embed.key;
  state.selectedSource = embed.source;
  publishPipState(true);
}

async function openNativePip(source?: LiveSource): Promise<boolean> {
  if (!current.isLive || !documentPipAvailable()) return false;

  const selectedSource = chooseSource(current, source ?? null);
  if (!selectedSource) return false;
  const state = getState();
  state.selectedSource = selectedSource;

  const existingPipWindow = getPipWindow();
  if (existingPipWindow) {
    existingPipWindow.focus();
    renderPip(current);
    publishPipState(true);
    return true;
  }

  const pipWindow = await window.documentPictureInPicture!.requestWindow({
    width: 480,
    height: 270,
  });
  // Give the initial about:blank document the opener's URL so embeds send a Referer.
  // Do this before registering listeners: document.open() clears them.
  pipWindow.document.open();
  pipWindow.document.close();
  state.pipWindow = pipWindow;
  state.activeEmbedKey = '';
  pipWindow.addEventListener(
    'pagehide',
    () => {
      clearPipState();
    },
    { once: true }
  );
  renderPip(current);
  return true;
}

function getSourcePicker(): HTMLElement | null {
  return document.getElementById(SOURCE_PICKER_ID);
}

function setPipStatus(message = ''): void {
  const status = getSourcePicker()?.querySelector<HTMLElement>('[data-live-pip-status]');
  if (status) {
    status.textContent = message;
    status.hidden = message.length === 0;
  }
}

function closeSourcePicker(restoreFocus = false): void {
  const picker = getSourcePicker();
  const anchor = sourcePickerAnchor;
  sourcePickerAnchor = null;
  if (picker) {
    picker.hidden = true;
  }
  document.querySelectorAll<HTMLElement>('.live-btn').forEach((btn) => {
    btn.setAttribute('aria-expanded', 'false');
  });
  setPipStatus();
  if (restoreFocus && anchor?.isConnected) {
    const visible = anchor.getBoundingClientRect().width > 0 &&
      getComputedStyle(anchor).visibility !== 'hidden';
    (visible ? anchor : document.querySelector<HTMLElement>('starlight-menu-button button'))?.focus();
  }
}

function syncSourcePickerControls(): void {
  const picker = getSourcePicker();
  if (!picker) return;

  if (!current.isLive) {
    closeSourcePicker();
    return;
  }

  const liveSources = getLiveSources(current);
  const pipGroup = picker.querySelector<HTMLElement>('[data-live-pip-group]');
  const showPipChoices = documentPipAvailable() && liveSources.length > 0;
  if (pipGroup) {
    pipGroup.hidden = !showPipChoices;
  }

  picker.querySelectorAll<HTMLButtonElement>('[data-live-pip-choice]').forEach((button) => {
    const source = button.dataset.livePipChoice as LiveSource | undefined;
    const live = sourceIsLive(current, source ?? null);
    button.hidden = !showPipChoices || !live;
    button.disabled = !showPipChoices || !live;
  });

  const sourceLinks = Array.from(
    picker.querySelectorAll<HTMLAnchorElement>('[data-live-source-link]')
  );
  sourceLinks.forEach((link) => {
    const source = link.dataset.liveSourceLink as LiveSource | undefined;
    const live = sourceIsLive(current, source ?? null);
    link.hidden = !live;
    if (live && source) {
      link.href = sourceUrl(current, source);
    } else {
      link.removeAttribute('href');
    }
  });

  const externalGroup = picker.querySelector<HTMLElement>('[data-live-external-group]');
  const preferredSource = sourceIsLive(current, current.primarySource)
    ? current.primarySource
    : (liveSources[0] ?? null);
  const preferredLink = sourceLinks.find(
    (link) => link.dataset.liveSourceLink === preferredSource
  );
  if (preferredLink && preferredLink !== sourceLinks[0]) {
    externalGroup?.insertBefore(preferredLink, sourceLinks[0]);
  }

  const dismissButton = picker.querySelector<HTMLButtonElement>('[data-live-action="dismiss"]');
  if (dismissButton) {
    const dismissed = isLiveNotificationDismissed(current);
    dismissButton.textContent = dismissed ? 'Notification dismissed' : 'Dismiss notification';
    dismissButton.disabled = dismissed;
  }
}

function positionSourcePicker(anchor: HTMLElement, picker: HTMLElement): void {
  if (window.matchMedia(NARROW_VIEWPORT_QUERY).matches) {
    const visualViewport = window.visualViewport;
    const viewportLeft = visualViewport?.offsetLeft ?? 0;
    const viewportWidth =
      visualViewport?.width ?? document.documentElement.clientWidth ?? window.innerWidth;
    const viewportHeight =
      visualViewport?.height ?? document.documentElement.clientHeight ?? window.innerHeight;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportRightInset = Math.max(0, window.innerWidth - viewportLeft - viewportWidth);
    const headerBottom =
      document.querySelector<HTMLElement>('.header')?.getBoundingClientRect().bottom ??
      viewportTop;
    const bottomInset = document.querySelector('astro-dev-toolbar') ? 64 : 0;
    const top = Math.max(viewportTop, headerBottom);
    const maxHeight = Math.max(0, viewportTop + viewportHeight - top - bottomInset);

    picker.style.top = `${top}px`;
    picker.style.right = `${viewportRightInset}px`;
    picker.style.bottom = 'auto';
    picker.style.left = `${viewportLeft}px`;
    picker.style.width = 'auto';
    picker.style.maxHeight = `${maxHeight}px`;
    return;
  }

  const rect = anchor.getBoundingClientRect();
  const margin = 12;
  const availableWidth = Math.max(0, window.innerWidth - margin * 2);
  const availableHeight = Math.max(0, window.innerHeight - margin * 2);

  picker.style.maxHeight = `${availableHeight}px`;
  picker.style.right = 'auto';
  picker.style.bottom = 'auto';
  picker.style.width = '';

  const width = Math.min(picker.offsetWidth || availableWidth, availableWidth);
  const height = Math.min(picker.offsetHeight || availableHeight, availableHeight);
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - margin);
  const left = Math.min(Math.max(margin, rect.left + rect.width / 2 - width / 2), maxLeft);
  const top = Math.min(Math.max(margin, rect.bottom + margin), maxTop);

  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;
}

function openSourcePicker(anchor: HTMLElement): void {
  const picker = getSourcePicker();
  if (!picker) return;

  if (!picker.hidden && anchor.getAttribute('aria-expanded') === 'true') {
    closeSourcePicker();
    return;
  }

  sourcePickerAnchor = anchor;
  syncSourcePickerControls();
  setPipStatus();
  picker.hidden = false;
  positionSourcePicker(anchor, picker);
  document.querySelectorAll<HTMLElement>('.live-btn').forEach((btn) => {
    btn.setAttribute('aria-expanded', String(btn === anchor));
  });
  picker
    .querySelector<HTMLElement>(
      '[data-live-pip-choice]:not([hidden]):not(:disabled), [data-live-source-link]:not([hidden]), [data-live-action="embeds"]'
    )
    ?.focus();
}

function bindSourcePicker(): void {
  const picker = getSourcePicker();
  if (!picker || picker.dataset.bound === 'true') return;
  pickerListeners?.abort();
  pickerListeners = new AbortController();
  const { signal } = pickerListeners;
  picker.dataset.bound = 'true';
  picker.addEventListener(
    'click',
    (evt) => {
      const target = evt.target;
      if (!(target instanceof Element)) return;

      const pipButton = target.closest<HTMLButtonElement>('[data-live-pip-choice]');
      if (pipButton && picker.contains(pipButton)) {
        const source = pipButton.dataset.livePipChoice as LiveSource | undefined;
        if (!source) return;
        setPipStatus();
        pipButton.disabled = true;
        void openNativePip(source)
          .then((opened) => {
            if (opened) {
              closeSourcePicker();
              return;
            }

            setPipStatus('Picture-in-picture is not available. Choose another watch option.');
          })
          .catch((err) => {
            console.warn('[live-status] Document Picture-in-Picture failed', err);
            setPipStatus('Picture-in-picture is not available. Choose another watch option.');
          })
          .finally(() => {
            syncSourcePickerControls();
          });
        return;
      }

      const closeButton = target.closest<HTMLButtonElement>('[data-live-action="close"]');
      if (closeButton && picker.contains(closeButton)) {
        closeSourcePicker(true);
        return;
      }

      const dismissButton = target.closest<HTMLButtonElement>('[data-live-action="dismiss"]');
      if (dismissButton && picker.contains(dismissButton)) {
        dismissLiveNotification(current);
        syncSourcePickerControls();
        closeSourcePicker(true);
        return;
      }

      if (target.closest<HTMLAnchorElement>('a')) {
        closeSourcePicker();
      }
    },
    { signal }
  );
  document.addEventListener(
    'click',
    (evt) => {
      if (picker.hidden) return;
      const target = evt.target;
      if (!(target instanceof Node)) return;
      if (picker.contains(target) || (target instanceof Element && target.closest('.live-btn')))
        return;
      closeSourcePicker();
    },
    { signal }
  );
  document.addEventListener(
    'keydown',
    (evt) => {
      if (evt.key === 'Escape' && !picker.hidden) {
        closeSourcePicker(true);
      }
    },
    { signal }
  );
  window.addEventListener(
    'resize',
    () => {
      const expandedButton = document.querySelector<HTMLElement>(
        '.live-btn[aria-expanded="true"]'
      );
      if (!picker.hidden && expandedButton) {
        positionSourcePicker(expandedButton, picker);
      }
    },
    { signal }
  );
}

function syncHeaderMenuState(): void {
  const hasChoices = current.isLive;
  document.querySelectorAll<HTMLElement>('.live-btn').forEach((btn) => {
    if (hasChoices) {
      btn.setAttribute('aria-haspopup', 'dialog');
      btn.setAttribute('aria-controls', SOURCE_PICKER_ID);
      btn.setAttribute(
        'aria-expanded',
        String(!getSourcePicker()?.hidden && btn.getAttribute('aria-expanded') === 'true')
      );
    } else {
      btn.removeAttribute('aria-haspopup');
      btn.removeAttribute('aria-controls');
      btn.removeAttribute('aria-expanded');
    }
  });
  syncSourcePickerControls();
}

function bindHeaderButtons(): void {
  document.querySelectorAll<HTMLAnchorElement>('.live-btn').forEach((btn) => {
    if (btn.dataset.nativePipBound === 'true') return;
    btn.dataset.nativePipBound = 'true';
    btn.addEventListener('click', (evt) => {
      if (isModifiedClick(evt) || !current.isLive) {
        return;
      }

      evt.preventDefault();
      openSourcePicker(btn);
    });
  });
}

function init(): void {
  bindSourcePicker();
  bindHeaderButtons();
  syncHeaderMenuState();
  publishPipState(Boolean(getPipWindow()));
}

subscribe((snapshot) => {
  current = snapshot;
  syncHeaderMenuState();
  renderPip(snapshot);
});

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}
