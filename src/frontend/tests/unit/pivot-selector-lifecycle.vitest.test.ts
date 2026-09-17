import { getEventListeners } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class ElementStub extends EventTarget {
  dataset: Record<string, string> = {};
  style = { display: '', height: '', marginBottom: '' };
  attributes = new Map<string, string>();
  elements = new Map<string, ElementStub>();
  buttons: ElementStub[] = [];
  classes = new Set<string>();
  classList = {
    toggle: (name: string, enabled: boolean) => {
      if (enabled) this.classes.add(name);
      else this.classes.delete(name);
    },
    remove: (...names: string[]) => names.forEach((name) => this.classes.delete(name)),
    contains: (name: string) => this.classes.has(name),
  };
  id = '';
  textContent = '';
  disabled = false;
  offsetParent: object | null = {};
  getBoundingClientRect = vi.fn(() => ({ top: 200, height: 100 }));
  after = vi.fn();
  remove = vi.fn();
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  querySelector(query: string) {
    return this.elements.get(query) ?? null;
  }
  querySelectorAll() {
    return this.buttons;
  }
}

describe('PivotSelector element lifecycle', () => {
  let PivotSelector: typeof import('@components/pivot-selector').PivotSelector;
  let roots: InstanceType<typeof PivotSelector>[];
  let blocks: ElementStub[];
  let headings: ElementStub[];
  let placeholders: ElementStub[];
  let documentEvents: EventTarget;
  let windowEvents: EventTarget;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let scrollY: number;
  let desktop: boolean;
  let location: URL;
  let storage: Map<string, string>;
  let replaceState: ReturnType<typeof vi.fn>;
  let scrollTo: ReturnType<typeof vi.fn>;
  let state: { index: number; scrollX: number; scrollY: number; custom: string };
  let html: ElementStub;

  beforeEach(async () => {
    vi.useFakeTimers();
    roots = [];
    blocks = [];
    headings = [];
    placeholders = [];
    frames = new Map();
    nextFrame = 0;
    scrollY = 0;
    desktop = true;
    location = new URL('https://aspire.dev/get-started/first-app/?keep=1#section');
    storage = new Map();
    html = new ElementStub();
    state = { index: 3, scrollX: 0, scrollY: 120, custom: 'preserved' };
    documentEvents = new EventTarget();
    windowEvents = new EventTarget();
    replaceState = vi.fn((_state: unknown, _unused: string, url: URL) => {
      location = url;
    });
    scrollTo = vi.fn();
    vi.stubGlobal('HTMLElement', ElementStub);
    vi.stubGlobal('customElements', { define: vi.fn() });
    vi.stubGlobal('getComputedStyle', () => ({ marginBottom: '24px' }));
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal(
      'document',
      Object.assign(documentEvents, {
        readyState: 'complete',
        documentElement: html,
        querySelectorAll: (query: string) =>
          query === 'aspire-pivot-selector'
            ? roots
            : query === '[data-pivot-block]'
              ? blocks
              : headings,
        getElementById: (id: string) => headings.find((heading) => heading.id === id) ?? null,
        createElement: () => {
          const element = new ElementStub();
          placeholders.push(element);
          return element;
        },
      })
    );
    vi.stubGlobal(
      'window',
      Object.defineProperties(windowEvents, {
        location: { get: () => location },
        scrollY: { get: () => scrollY },
        history: { value: { state, replaceState } },
        matchMedia: { value: () => ({ matches: desktop }) },
        scrollTo: { value: scrollTo },
        setTimeout: { value: setTimeout },
        clearTimeout: { value: clearTimeout },
        requestAnimationFrame: {
          value: (callback: FrameRequestCallback) => {
            frames.set(++nextFrame, callback);
            return nextFrame;
          },
        },
        cancelAnimationFrame: { value: (id: number) => frames.delete(id) },
      })
    );
    ({ PivotSelector } = await import('@components/pivot-selector'));
  });

  afterEach(() => {
    roots.forEach((root) => root.disconnectedCallback());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function createRoot(key = 'aspire-lang', options = ['typescript', 'csharp', 'disabled']) {
    const selector = new ElementStub();
    selector.buttons = options.map((id) => {
      const button = new ElementStub();
      button.dataset.pivotOption = id;
      button.disabled = id === 'disabled';
      return button;
    });
    const collapse = new ElementStub();
    const expand = new ElementStub();
    const root = Object.assign(new PivotSelector(), {
      elements: new Map([
        ['.pivot-selector', selector],
        ['.pivot-collapse-btn', collapse],
        ['.pivot-expand-btn', expand],
      ]),
      buttons: selector.buttons,
    });
    root.dataset.pivotKey = key;
    roots.push(root);
    root.connectedCallback();
    return { root, selector, buttons: selector.buttons, collapse, expand };
  }

  function pageLoad() {
    documentEvents.dispatchEvent(new Event('astro:page-load'));
  }

  it('initializes at DOM readiness while an async resource keeps page-load pending', () => {
    Reflect.set(document, 'readyState', 'loading');
    const { selector, buttons } = createRoot();
    documentEvents.dispatchEvent(new Event('DOMContentLoaded'));
    expect(selector.dataset.pivotInitialized).toBe('true');
    expect(buttons[0].classes.has('active')).toBe(true);
    expect(getEventListeners(documentEvents, 'astro:page-load')).toHaveLength(1);
    pageLoad();
    expect(getEventListeners(windowEvents, 'scroll')).toHaveLength(1);
  });

  function flushFrames() {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(0));
  }

  function scroll(top: number) {
    scrollY = top;
    windowEvents.dispatchEvent(new Event('scroll'));
    flushFrames();
  }

  function float(root: InstanceType<typeof PivotSelector>) {
    vi.spyOn(root, 'getBoundingClientRect').mockImplementation(() => ({
      top: 200 - scrollY,
      height: 100,
      width: 400,
      left: 0,
      right: 400,
      bottom: 300 - scrollY,
      x: 0,
      y: 200 - scrollY,
      toJSON: () => ({}),
    }));
    flushFrames();
    scroll(300);
    expect(root.classList.contains('floating')).toBe(true);
    expect(root.classList.contains('collapsed')).toBe(true);
  }

  it('waits for the destination URL, mounts once, and preserves router metadata and URL parts', () => {
    const { root, selector, buttons } = createRoot();
    storage.set('aspire-lang', 'csharp');
    expect(replaceState).not.toHaveBeenCalled();
    location.searchParams.set('aspire-lang', 'typescript');
    pageLoad();
    root.connectedCallback();
    pageLoad();
    expect(replaceState).toHaveBeenCalledExactlyOnceWith(state, '', location);
    expect(location.search).toBe('?keep=1&aspire-lang=typescript');
    expect(location.hash).toBe('#section');
    expect(selector.dataset.pivotInitialized).toBe('true');
    expect(buttons[0].classes.has('active')).toBe(true);
    expect(storage.get('starlight-synced-tabs__aspire-lang')).toBe('TypeScript');
    expect(html.dataset.apphostLang).toBe('typescript');
    buttons[1].dispatchEvent(new Event('click'));
    expect(storage.get('aspire-lang')).toBe('csharp');
    expect(storage.get('starlight-synced-tabs__aspire-lang')).toBe('C#');
    expect(replaceState.mock.calls[1][0]).toBe(state);
    expect(getEventListeners(windowEvents, 'scroll')).toHaveLength(1);
    expect(getEventListeners(windowEvents, 'resize')).toHaveLength(1);
    expect(getEventListeners(documentEvents, 'astro:page-load')).toHaveLength(0);
  });

  it.each([
    ['disabled', 'csharp', 'csharp'],
    ['invalid', 'disabled', 'typescript'],
    ['', '', 'typescript'],
  ])('validates query %s and preference %s, selecting %s', (query, stored, expected) => {
    location.searchParams.set('aspire-lang', query);
    storage.set('aspire-lang', stored);
    const { buttons } = createRoot();
    pageLoad();
    expect(location.searchParams.get('aspire-lang')).toBe(expected);
    buttons[2].dispatchEvent(new Event('click'));
    expect(location.searchParams.get('aspire-lang')).toBe(expected);
    expect(replaceState).toHaveBeenCalledOnce();
  });

  it('isolates independent option sets and synchronizes repeated selectors of the same key', () => {
    blocks = ['typescript', 'csharp', 'typescript; csharp', 'docker', 'azure,docker'].map((id) => {
      const block = new ElementStub();
      block.dataset.pivotBlock = id;
      return block;
    });
    const first = createRoot();
    const second = createRoot();
    const deployment = createRoot('deployment', ['docker', 'azure']);
    pageLoad();
    first.buttons[1].dispatchEvent(new Event('click'));
    expect(second.buttons[1].classes.has('active')).toBe(true);
    expect(blocks.map((block) => block.style.display)).toEqual(['none', '', '', '', '']);
    deployment.buttons[1].dispatchEvent(new Event('click'));
    expect(blocks.map((block) => block.style.display)).toEqual(['none', '', '', 'none', '']);
    expect(location.searchParams.get('aspire-lang')).toBe('csharp');
    expect(location.searchParams.get('deployment')).toBe('azure');
    first.root.disconnectedCallback();
    expect(getEventListeners(windowEvents, 'scroll')).toHaveLength(2);
    second.buttons[0].dispatchEvent(new Event('click'));
    expect(storage.get('aspire-lang')).toBe('typescript');
  });

  it('preserves heading position, coalesces restoration, and cancels it on disconnection', () => {
    const heading = new ElementStub();
    heading.id = 'section';
    heading.getBoundingClientRect.mockReturnValue({ top: -30, height: 30 });
    headings.push(heading);
    const { root, buttons } = createRoot();
    pageLoad();
    flushFrames();
    buttons[1].dispatchEvent(new Event('click'));
    buttons[0].dispatchEvent(new Event('click'));
    expect(frames.size).toBe(1);
    heading.getBoundingClientRect.mockReturnValue({ top: 50, height: 30 });
    flushFrames();
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 80, behavior: 'instant' });
    buttons[1].dispatchEvent(new Event('click'));
    root.disconnectedCallback();
    expect(frames.size).toBe(0);
    flushFrames();
    expect(scrollTo).toHaveBeenCalledOnce();
  });

  it('keeps floating/collapse timing and desktop titles, then returns to normal flow', () => {
    const { root, collapse, expand } = createRoot();
    pageLoad();
    float(root);
    expect(expand.attributes.get('title')).toBe('Show selector');
    expect(placeholders[0].style).toEqual({
      display: 'block',
      height: '100px',
      marginBottom: '24px',
    });
    expand.dispatchEvent(new Event('click'));
    scroll(350);
    vi.advanceTimersByTime(4999);
    expect(root.classList.contains('collapsed')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(root.classList.contains('collapsed')).toBe(false);
    scroll(400);
    vi.advanceTimersByTime(149);
    expect(root.classList.contains('collapsed')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(root.classList.contains('collapsed')).toBe(true);
    expand.dispatchEvent(new Event('click'));
    collapse.dispatchEvent(new Event('click'));
    expect(vi.getTimerCount()).toBe(0);
    desktop = false;
    windowEvents.dispatchEvent(new Event('resize'));
    expect(expand.attributes.has('title')).toBe(false);
    scroll(0);
    expect(root.classList.contains('floating')).toBe(false);
    expect(root.classList.contains('collapsed')).toBe(false);
    expect(placeholders[0].style.display).toBe('none');
  });

  it.each([
    ['expanded', 'disconnect'],
    ['expanded', 'before-swap'],
    ['scrolling', 'disconnect'],
    ['scrolling', 'before-swap'],
  ] as const)(
    'cancels all pending %s work and listeners on %s across repeated visits',
    (phase, teardown) => {
      const warn = vi.spyOn(console, 'warn');
      for (let visit = 0; visit < 3; visit++) {
        scrollY = 0;
        const { root, buttons, expand } = createRoot();
        pageLoad();
        float(root);
        expand.dispatchEvent(new Event('click'));
        if (phase === 'scrolling') {
          vi.advanceTimersByTime(5000);
          scroll(400);
        }
        windowEvents.dispatchEvent(new Event('resize'));
        windowEvents.dispatchEvent(new Event('scroll'));
        expect(vi.getTimerCount()).toBe(2);
        expect(frames.size).toBe(1);
        const writes = replaceState.mock.calls.length;
        if (teardown === 'before-swap') {
          documentEvents.dispatchEvent(new Event('astro:before-swap'));
        } else {
          root.disconnectedCallback();
        }
        roots = roots.filter((candidate) => candidate !== root);
        expect(getEventListeners(windowEvents, 'scroll')).toHaveLength(0);
        expect(getEventListeners(windowEvents, 'resize')).toHaveLength(0);
        expect(getEventListeners(documentEvents, 'astro:before-swap')).toHaveLength(0);
        expect(getEventListeners(buttons[0], 'click')).toHaveLength(0);
        expect(getEventListeners(expand, 'click')).toHaveLength(0);
        expect(placeholders[visit].remove).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
        expect(frames.size).toBe(0);
        root.disconnectedCallback();
        expect(placeholders[visit].remove).toHaveBeenCalledOnce();
        pageLoad();
        windowEvents.dispatchEvent(new Event('scroll'));
        windowEvents.dispatchEvent(new Event('resize'));
        buttons[1].dispatchEvent(new Event('click'));
        vi.runAllTimers();
        flushFrames();
        expect(replaceState).toHaveBeenCalledTimes(writes);
        expect(vi.getTimerCount()).toBe(0);
        expect(frames.size).toBe(0);
      }
      expect(warn).not.toHaveBeenCalled();
    }
  );

  it('keeps the active page usable when preparation starts but no swap follows', () => {
    const { root, selector, buttons, expand } = createRoot();
    pageLoad();
    float(root);
    expand.dispatchEvent(new Event('click'));
    documentEvents.dispatchEvent(new Event('astro:before-preparation', { cancelable: true }));
    expect(selector.dataset.pivotInitialized).toBe('true');
    expect(root.classList.contains('floating')).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    expect(getEventListeners(windowEvents, 'scroll')).toHaveLength(1);
    buttons[1].dispatchEvent(new Event('click'));
    expect(storage.get('aspire-lang')).toBe('csharp');
    expect(placeholders[0].remove).not.toHaveBeenCalled();
  });

  it('cancels connection before page-load and reconnects the same element with fresh URL state', () => {
    const { root, buttons } = createRoot();
    root.disconnectedCallback();
    pageLoad();
    expect(replaceState).not.toHaveBeenCalled();
    expect(getEventListeners(documentEvents, 'astro:page-load')).toHaveLength(0);
    for (const language of ['csharp', 'typescript']) {
      location.searchParams.set('aspire-lang', language);
      root.connectedCallback();
      pageLoad();
      expect(buttons.find((button) => button.classes.has('active'))?.dataset.pivotOption).toBe(
        language
      );
      root.disconnectedCallback();
      expect(frames.size).toBe(0);
      expect(getEventListeners(windowEvents, 'scroll')).toHaveLength(0);
    }
  });
});
