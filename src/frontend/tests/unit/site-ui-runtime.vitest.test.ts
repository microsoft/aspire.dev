import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEventListeners } from 'node:events';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import type { AsyncIconLoader } from 'mermaid';

const mermaidSource = readFileSync(
  new URL('../../src/scripts/mermaid.ts', import.meta.url),
  'utf8'
);
const scrollComponent = readFileSync(
  new URL('../../src/components/ScrollToTop.astro', import.meta.url),
  'utf8'
);
const extractScript = (component: string) =>
  component.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
const scrollSource = extractScript(scrollComponent);
if (!scrollSource) throw new Error('Scroll-to-top runtime not found.');
const compile = (source: string) =>
  transpileModule(source, {
    compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ESNext },
  }).outputText.replace(/^import .*;\r?\n/gm, '');

it('extracts component scripts regardless of HTML tag casing', () => {
  expect(extractScript('<SCRIPT>const ready = true;</SCRIPT>')).toBe('const ready = true;');
});

class Element extends EventTarget {
  id = '';
  lang = 'en';
  type = '';
  ariaLabel = '';
  textContent = '';
  innerHTML = '';
  scrollHeight = 2000;
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  dataset: Record<string, string | undefined> = {};
  classes = new Set<string>();
  classList = {
    add: (...names: string[]) => names.forEach((name) => this.classes.add(name)),
    remove: (...names: string[]) => names.forEach((name) => this.classes.delete(name)),
    contains: (name: string) => this.classes.has(name),
    toggle: (name: string, force = !this.classes.has(name)) => {
      if (force) this.classes.add(name);
      else this.classes.delete(name);
      return force;
    },
  };
  parentNode: Element | null = null;
  children: Element[] = [];
  root = false;
  constructor(readonly tagName = 'div') {
    super();
  }
  get parentElement() {
    return this.parentNode;
  }
  get isConnected(): boolean {
    return this.root || Boolean(this.parentNode?.isConnected);
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
    if (name.startsWith('data-')) this.dataset[name.slice(5)] = value;
  }
  getAttribute(name: string) {
    return name.startsWith('data-')
      ? (this.dataset[name.slice(5)] ?? null)
      : (this.attributes.get(name) ?? null);
  }
  hasAttribute(name: string) {
    return this.getAttribute(name) !== null;
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
    if (name.startsWith('data-')) delete this.dataset[name.slice(5)];
  }
  append(child: Element) {
    child.remove();
    this.appendChild(child);
  }
  appendChild<T extends Element>(child: T) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child: Element) {
    this.children = this.children.filter((element) => element !== child);
    child.parentNode = null;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  contains(element: Element): boolean {
    return this === element || this.children.some((child) => child.contains(element));
  }
  all(): Element[] {
    return this.children.flatMap((child) => [child, ...child.all()]);
  }
  querySelectorAll(selector: string) {
    return this.all().filter((element) => {
      if (selector.startsWith('#')) return element.id === selector.slice(1);
      if (selector === 'pre.mermaid') {
        return element.tagName === 'pre' && element.classList.contains('mermaid');
      }
      if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
      return element.tagName === selector;
    });
  }
  querySelector(selector: string): Element | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

class Document extends EventTarget {
  documentElement = new Element('html');
  head = this.documentElement.appendChild(new Element('head'));
  body = this.documentElement.appendChild(new Element('body'));
  readyState = 'complete';
  constructor() {
    super();
    this.documentElement.root = true;
    this.documentElement.setAttribute('data-theme', 'light');
  }
  createElement(tag: string) {
    return new Element(tag);
  }
  querySelectorAll(selector: string) {
    return this.documentElement.querySelectorAll(selector);
  }
  querySelector(selector: string) {
    return this.documentElement.querySelector(selector);
  }
  getElementById(id: string) {
    return this.querySelector(`#${id}`);
  }
  emit(name: string) {
    this.dispatchEvent(new Event(name));
  }
  replaceBody(sources: string[] = []) {
    this.body.remove();
    this.body = this.documentElement.appendChild(new Element('body'));
    return sources.map((source) => {
      const diagram = this.body.appendChild(new Element('pre'));
      diagram.classList.add('mermaid');
      diagram.textContent = source;
      return diagram;
    });
  }
}

function observers() {
  const instances: Observer[] = [];
  class Observer {
    targets = new Set<Element>();
    constructor(readonly callback: () => void) {
      instances.push(this);
    }
    observe(target: Element) {
      this.targets.add(target);
    }
    disconnect() {
      this.targets.clear();
    }
  }
  return {
    Observer,
    instances,
    notify: (target: Element) => {
      instances
        .filter((observer) => observer.targets.has(target))
        .forEach((observer) => observer.callback());
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

async function mermaidRuntime({
  sources = ['graph TD; A-->B', 'graph TD; C-->D'],
  loading = false,
} = {}) {
  const { iconPacks } = await import('../../config/icon-packs.mjs');
  const icons = { prefix: 'test', icons: { app: { body: '<path />' } } };
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(icons))));
  const document = new Document();
  const diagrams = document.replaceBody(sources);
  if (loading) document.readyState = 'loading';
  const mutation = observers();
  const logger = { log: vi.fn(), error: vi.fn() };
  const mermaid = {
    initialize: vi.fn<(config: { theme: string }) => void>(),
    registerIconPacks: vi.fn<(packs: AsyncIconLoader[]) => void>(),
    render: vi
      .fn<(id: string, source: string) => Promise<{ svg: string }>>()
      .mockImplementation((_id, source) => Promise.resolve({ svg: `<svg>${source}</svg>` })),
  };
  const imported = deferred<{ default: typeof mermaid }>();
  const importMermaid = vi.fn(() => imported.promise);
  // Replace only the module boundary; execute the actual site runtime.
  runInNewContext(compile(mermaidSource).replace("import('mermaid')", 'importMermaid()'), {
    document,
    MutationObserver: mutation.Observer,
    console: logger,
    queueMicrotask,
    importMermaid,
    iconPacks,
    fetch,
    Error,
  });
  if (!loading) document.emit('astro:page-load');
  return {
    document,
    diagrams,
    mutation,
    mermaid,
    imported,
    importMermaid,
    logger,
    icons,
    iconPacks,
    fetch,
    theme(value: string, target = document.documentElement) {
      target.setAttribute('data-theme', value);
      mutation.notify(target);
    },
    swap(sources: string[]) {
      document.emit('astro:before-swap');
      const diagrams = document.replaceBody(sources);
      document.emit('astro:after-swap');
      document.emit('astro:page-load');
      return diagrams;
    },
  };
}

describe('site-owned Mermaid runtime', () => {
  it('coalesces readiness, page-load and same-theme notifications before and during rendering', async () => {
    const fixture = await mermaidRuntime({ loading: true });
    const { document, mermaid, imported, diagrams, importMermaid, logger } = fixture;
    expect(importMermaid).not.toHaveBeenCalled();
    document.emit('DOMContentLoaded');
    document.emit('astro:page-load');
    fixture.theme('light');
    await flush();
    expect(importMermaid).toHaveBeenCalledOnce();
    const render = deferred<{ svg: string }>();
    mermaid.render.mockReturnValueOnce(render.promise);
    imported.resolve({ default: mermaid });
    await flush();
    document.emit('astro:after-swap');
    document.emit('astro:page-load');
    fixture.theme('light');
    await flush();
    expect(mermaid.render).toHaveBeenCalledOnce();
    render.resolve({ svg: '<svg>first</svg>' });
    await flush();
    expect(mermaid.render).toHaveBeenCalledTimes(2);
    expect(mermaid.initialize).toHaveBeenCalledTimes(1);
    expect(diagrams.map((diagram) => diagram.getAttribute('data-processed'))).toEqual([
      'true',
      'true',
    ]);
    expect(mermaid.registerIconPacks).toHaveBeenCalledOnce();
    expect(mermaid.registerIconPacks.mock.calls[0][0].map((pack) => pack.name)).toEqual(
      fixture.iconPacks.map((pack) => pack.name)
    );
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('keeps imports lazy on empty pages and renders two diagrams once on each return visit', async () => {
    const fixture = await mermaidRuntime({ sources: [] });
    await flush();
    expect(fixture.importMermaid).not.toHaveBeenCalled();
    fixture.imported.resolve({ default: fixture.mermaid });
    for (let visit = 1; visit <= 3; visit++) {
      fixture.swap(['graph TD; A-->B', 'graph TD; C-->D']);
      await flush();
      expect(fixture.mermaid.render).toHaveBeenCalledTimes(visit * 2);
      fixture.swap([]);
      await flush();
    }
    expect(fixture.importMermaid).toHaveBeenCalledOnce();
  });

  it('ignores equivalent attribute churn and rerenders only for effective theme changes', async () => {
    const fixture = await mermaidRuntime();
    fixture.imported.resolve({ default: fixture.mermaid });
    await flush();
    fixture.document.documentElement.removeAttribute('data-theme');
    fixture.theme('light');
    fixture.theme('dark', fixture.document.body);
    await flush();
    expect(fixture.mermaid.render).toHaveBeenCalledTimes(2);
    fixture.theme('dark');
    await flush();
    expect(fixture.mermaid.render).toHaveBeenCalledTimes(4);
    expect(fixture.mermaid.initialize.mock.calls.map(([config]) => config.theme)).toEqual([
      'default',
      'dark',
    ]);
    expect(fixture.mermaid.render.mock.calls.map(([, source]) => source)).toEqual([
      'graph TD; A-->B',
      'graph TD; C-->D',
      'graph TD; A-->B',
      'graph TD; C-->D',
    ]);
  });

  it('serializes global theme configuration and discards superseded in-flight SVGs', async () => {
    const fixture = await mermaidRuntime({ sources: ['graph TD; A-->B'] });
    const render = deferred<{ svg: string }>();
    fixture.mermaid.render.mockReturnValueOnce(render.promise);
    fixture.imported.resolve({ default: fixture.mermaid });
    await flush();
    fixture.theme('dark');
    fixture.theme('light');
    fixture.theme('dark');
    await flush();
    expect(fixture.mermaid.initialize).toHaveBeenCalledOnce();
    expect(fixture.mermaid.render).toHaveBeenCalledOnce();
    const latest = deferred<{ svg: string }>();
    fixture.mermaid.render.mockReturnValueOnce(latest.promise);
    render.resolve({ svg: '<svg>obsolete light</svg>' });
    await flush();
    expect(fixture.diagrams[0].innerHTML).toBe('');
    expect(fixture.mermaid.initialize.mock.calls.map(([config]) => config.theme)).toEqual([
      'default',
      'dark',
    ]);
    latest.resolve({ svg: '<svg>latest dark</svg>' });
    await flush();
    expect(fixture.diagrams[0].innerHTML).toBe('<svg>latest dark</svg>');
  });

  it('abandons imports owned by a replaced page and observes the new body, not the old body', async () => {
    const fixture = await mermaidRuntime();
    await flush();
    const oldBody = fixture.document.body;
    const next = fixture.swap(['graph TD; New-->Page']);
    fixture.imported.resolve({ default: fixture.mermaid });
    await flush();
    expect(fixture.mermaid.render).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      'graph TD; New-->Page'
    );
    expect(fixture.diagrams.every((diagram) => diagram.innerHTML === '')).toBe(true);
    expect(fixture.mutation.instances[0].targets.has(oldBody)).toBe(false);
    fixture.theme('dark');
    await flush();
    expect(fixture.mermaid.render).toHaveBeenCalledTimes(2);
    expect(next[0].getAttribute('data-processed')).toBe('true');
  });

  it.each(['resolve', 'reject'] as const)(
    'does not write stale %s completions after a swap',
    async (outcome) => {
      const fixture = await mermaidRuntime();
      const render = deferred<{ svg: string }>();
      fixture.mermaid.render.mockReturnValueOnce(render.promise);
      fixture.imported.resolve({ default: fixture.mermaid });
      await flush();
      const next = fixture.swap(['graph TD; New-->Page']);
      await flush();
      expect(fixture.mermaid.initialize).toHaveBeenCalledOnce();
      if (outcome === 'resolve') render.resolve({ svg: '<svg>stale</svg>' });
      else render.reject(new Error('obsolete render failed'));
      await flush();
      expect(fixture.diagrams[0].innerHTML).toBe('');
      expect(fixture.diagrams[0].children).toHaveLength(0);
      expect(fixture.diagrams[0].hasAttribute('data-processed')).toBe(false);
      expect(next[0].innerHTML).toContain('New-->Page');
      expect(fixture.mermaid.render).toHaveBeenCalledTimes(2);
      expect(fixture.logger.error).toHaveBeenCalledTimes(outcome === 'reject' ? 1 : 0);
    }
  );

  it('keeps current work alive when navigation preparation is canceled', async () => {
    const fixture = await mermaidRuntime();
    fixture.document.emit('astro:before-preparation');
    fixture.imported.resolve({ default: fixture.mermaid });
    await flush();
    expect(fixture.mermaid.render).toHaveBeenCalledTimes(2);
    fixture.theme('dark');
    await flush();
    expect(fixture.mermaid.render).toHaveBeenCalledTimes(4);
  });

  it('preserves visible escaped errors and source without retrying an unchanged failed diagram', async () => {
    const fixture = await mermaidRuntime({ sources: ['invalid <diagram>'] });
    fixture.mermaid.render.mockRejectedValueOnce(new Error('<img src=x onerror=alert(1)>'));
    fixture.imported.resolve({ default: fixture.mermaid });
    await flush();
    const [diagram] = fixture.diagrams;
    expect(fixture.logger.error).toHaveBeenCalledOnce();
    expect(diagram.getAttribute('data-diagram')).toBe('invalid <diagram>');
    expect(diagram.textContent).toBe('Unable to render diagram: <img src=x onerror=alert(1)>');
    expect(diagram.classList.contains('mermaid-error')).toBe(true);
    expect(diagram.innerHTML).toBe('');
    fixture.document.emit('astro:page-load');
    await flush();
    expect(fixture.mermaid.render).toHaveBeenCalledOnce();
    fixture.theme('dark');
    await flush();
    expect(fixture.mermaid.render.mock.calls[1][1]).toBe('invalid <diagram>');
  });

  it('logs import failures, clears the failed import promise and retries on the next page load', async () => {
    const fixture = await mermaidRuntime();
    fixture.imported.reject(new Error('import failed'));
    await flush();
    expect(fixture.logger.error).toHaveBeenCalled();
    fixture.importMermaid.mockResolvedValueOnce({ default: fixture.mermaid });
    fixture.document.emit('astro:page-load');
    await flush();
    expect(fixture.importMermaid).toHaveBeenCalledTimes(2);
    expect(fixture.mermaid.render).toHaveBeenCalledTimes(2);
  });

  it('loads configured icon packs lazily and reports failed responses', async () => {
    const fixture = await mermaidRuntime();
    fixture.imported.resolve({ default: fixture.mermaid });
    await flush();
    expect(fixture.fetch).not.toHaveBeenCalled();
    const pack = fixture.mermaid.registerIconPacks.mock.calls[0][0][0];
    await expect(pack.loader()).resolves.toEqual(fixture.icons);
    expect(fixture.fetch).toHaveBeenCalledWith(fixture.iconPacks[0].url);
    fixture.fetch.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(pack.loader()).rejects.toThrow('HTTP 503');
  });
});

function scrollRuntime({ reducedMotion = false } = {}) {
  vi.useFakeTimers();
  const document = new Document();
  const window = Object.assign(new EventTarget(), {
    scrollY: 500,
    innerHeight: 900,
    innerWidth: 1440,
    outerWidth: 1440,
    scrollTo: vi.fn(),
    matchMedia: () => ({ matches: reducedMotion }),
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 16),
    cancelAnimationFrame: clearTimeout,
  });
  type ScrollElement = Element & { connectedCallback(): void; disconnectedCallback(): void };
  let Constructor: (new () => ScrollElement) | undefined;
  runInNewContext(compile(scrollSource!), {
    document,
    window,
    HTMLElement: Element,
    AbortController,
    customElements: {
      define: (_name: string, value: new () => ScrollElement) => {
        Constructor = value;
      },
    },
  });
  if (!Constructor) throw new Error('Scroll-to-top custom element was not registered.');
  const root = document.body.appendChild(new Constructor());
  const button = root.appendChild(new Element('button'));
  button.id = 'scroll-to-top-button';
  button.type = 'button';
  root.connectedCallback();
  return { document, window, root, button: () => button };
}

describe('site-owned scroll-to-top control', () => {
  afterEach(() => vi.useRealTimers());

  it('mounts once per connection without document readiness or keyboard handlers', () => {
    const fixture = scrollRuntime();
    fixture.root.connectedCallback();
    fixture.document.emit('DOMContentLoaded');
    fixture.document.emit('astro:page-load');
    expect(vi.getTimerCount()).toBe(1);
    vi.runAllTimers();
    const button = fixture.button();
    fixture.document.emit('astro:page-load');
    vi.runAllTimers();
    expect(fixture.button()).toBe(button);
    expect(fixture.document.querySelectorAll('#scroll-to-top-button')).toHaveLength(1);
    expect(getEventListeners(fixture.document, 'keydown')).toHaveLength(0);
    expect(getEventListeners(fixture.document, 'DOMContentLoaded')).toHaveLength(0);
  });

  it.each([false, true])(
    'uses only native click activation (reduced motion: %s)',
    (reducedMotion) => {
      const fixture = scrollRuntime({ reducedMotion });
      vi.runAllTimers();
      const button = fixture.button();
      expect(button.type).toBe('button');
      for (const name of ['touchstart', 'touchend', 'keydown']) {
        expect(getEventListeners(button, name)).toHaveLength(0);
      }
      const click = new Event('click', { cancelable: true });
      button.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(false);
      expect(fixture.window.scrollTo).toHaveBeenCalledExactlyOnceWith({
        top: 0,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
      expect(scrollComponent).toContain('button:focus-visible');
    }
  );

  it('disposes element/window handlers and pending frames when disconnected', () => {
    const fixture = scrollRuntime();
    fixture.root.disconnectedCallback();
    expect(vi.getTimerCount()).toBe(0);
    vi.runAllTimers();
    for (let visit = 0; visit < 3; visit++) {
      fixture.root.connectedCallback();
      vi.runAllTimers();
      expect(getEventListeners(fixture.document, 'keydown')).toHaveLength(0);
      expect(getEventListeners(fixture.window, 'scroll')).toHaveLength(1);
      fixture.window.dispatchEvent(new Event('scroll'));
      expect(vi.getTimerCount()).toBe(1);
      fixture.root.disconnectedCallback();
      expect(vi.getTimerCount()).toBe(0);
      expect(getEventListeners(fixture.document, 'keydown')).toHaveLength(0);
      expect(getEventListeners(fixture.window, 'scroll')).toHaveLength(0);
      expect(getEventListeners(fixture.window, 'resize')).toHaveLength(0);
      expect(getEventListeners(fixture.button(), 'click')).toHaveLength(0);
    }
  });

  it('survives canceled preparation and updates scroll/zoom visibility in one frame', () => {
    const fixture = scrollRuntime();
    vi.runAllTimers();
    const button = fixture.button();
    fixture.document.emit('astro:before-preparation');
    expect(fixture.button()).toBe(button);
    expect(getEventListeners(fixture.document, 'keydown')).toHaveLength(0);
    fixture.window.outerWidth = 6000;
    fixture.window.dispatchEvent(new Event('resize'));
    vi.runAllTimers();
    expect(button.classList.contains('visible')).toBe(false);
    fixture.window.outerWidth = 1440;
    fixture.window.dispatchEvent(new Event('resize'));
    vi.runAllTimers();
    expect(button.classList.contains('visible')).toBe(true);
    fixture.window.dispatchEvent(new Event('scroll'));
    fixture.window.scrollY = 0;
    fixture.window.dispatchEvent(new Event('scroll'));
    vi.runAllTimers();
    expect(button.classList.contains('visible')).toBe(false);
  });
});
