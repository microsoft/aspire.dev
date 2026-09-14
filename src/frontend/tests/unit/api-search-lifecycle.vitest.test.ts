import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { readApiSearchIndex, registerApiSearch } from '@components/api-reference/search-lifecycle';
import * as searchStats from '@utils/ts-api-search-stats';

const surfaces = [
  ['csharp', 'landing'],
  ['csharp', 'package'],
  ['csharp', 'type'],
  ['typescript', 'landing'],
  ['typescript', 'module'],
  ['typescript', 'item'],
] as const;

type MountSearch = (root: HTMLElement, signal: AbortSignal) => void;

describe('API search navigation lifecycle', () => {
  let events: EventTarget;
  let roots: Map<string, HTMLElement>;
  let dispose: (() => void)[];

  const selector = (language: string, kind: string) =>
    `[data-api-search-language="${language}"][data-api-search-kind="${kind}"]`;

  beforeEach(() => {
    events = new EventTarget();
    roots = new Map();
    dispose = [];
    vi.stubGlobal('document', {
      querySelector: (query: string) => roots.get(query) ?? null,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    });
  });

  describe('API search URL lifecycle', () => {
    class SearchInput extends EventTarget {
      value = '';
      isConnected = true;
      focus = vi.fn();
    }

    afterEach(() => vi.unstubAllGlobals());

    async function createSync() {
      const input = new SearchInput();
      const clear = Object.assign(new EventTarget(), { style: { display: 'none' } });
      const replaceState = vi.fn();
      vi.stubGlobal('HTMLInputElement', SearchInput);
      vi.stubGlobal('window', {
        location: new URL('https://aspire.dev/reference/api/csharp/?keep=1&q=old&kinds=method#members'),
      });
      vi.stubGlobal('history', { replaceState });
      const root = {
        querySelector: (query: string) => query.endsWith('-input') ? input : clear,
      } as unknown as HTMLElement;
      const abort = new AbortController();
      const onClear = vi.fn();
      const { InpageSearchSync } = await import('@components/api-reference/inpage-search-sync');
      const sync = new InpageSearchSync('api', onClear, root, abort.signal);
      return { sync, abort, input, clear, onClear, replaceState };
    }

    it('preserves unrelated query parameters and fragments and validates restored kinds', async () => {
      const { sync, replaceState } = await createSync();
      expect(sync.readQuery()).toBe('old');
      expect(sync.readKinds(new Set(['method', 'class']))).toEqual(new Set(['method']));
      expect(sync.readKinds(new Set(['class']))).toEqual(new Set());
      sync.writeUrl('RedisResource', new Set(['class']));
      expect(replaceState).toHaveBeenCalledWith(
        null, '', '/reference/api/csharp/?keep=1&q=RedisResource&kinds=class#members',
      );
    });

    it('removes clear/input handlers and refuses stale URL writes after abort', async () => {
      const { sync, abort, input, clear, onClear, replaceState } = await createSync();
      input.value = 'redis';
      input.dispatchEvent(new Event('input'));
      expect(clear.style.display).toBe('');
      clear.dispatchEvent(new Event('click'));
      expect(input.value).toBe('');
      expect(onClear).toHaveBeenCalledOnce();

      abort.abort();
      input.value = 'stale';
      input.dispatchEvent(new Event('input'));
      clear.dispatchEvent(new Event('click'));
      sync.writeUrl('stale', new Set());
      expect(clear.style.display).toBe('none');
      expect(input.value).toBe('stale');
      expect(onClear).toHaveBeenCalledOnce();
      expect(replaceState).not.toHaveBeenCalled();
    });

    it('refuses writes from detached inputs even before cleanup runs', async () => {
      const { sync, input, replaceState } = await createSync();
      input.isConnected = false;
      sync.writeUrl('stale', new Set());
      expect(replaceState).not.toHaveBeenCalled();
    });
  });

  describe('API page controller cleanup', () => {
    class SearchElement extends EventTarget {
      value = '';
      isConnected = true;
      style = { display: '' };
      textContent = '';
      innerHTML = '';
      dataset: Record<string, string> = {};
      children = new Map<string, SearchElement>();
      querySelector(selector: string) { return this.children.get(selector) ?? null; }
      querySelectorAll() { return []; }
      focus() {}
    }

    let cleanup: (() => void) | undefined;

    afterEach(() => {
      cleanup?.();
      cleanup = undefined;
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it.each(surfaces)('cancels the real %s %s controller debounce and detaches input listeners', async (language, kind) => {
      vi.useFakeTimers();
      const events = new EventTarget();
      const root = new SearchElement();
      const prefix = kind === 'landing' ? language === 'csharp' ? 'api' : 'ts-api'
        : kind === 'type' || kind === 'item' ? 'type' : 'pkg';
      for (const suffix of ['search-input', 'search-clear', 'search-results', 'search-status',
        'search-count', 'kind-filters', 'clear-filters', 'package-list']) {
        root.children.set(`#${prefix}-${suffix}`, new SearchElement());
      }
      const index = new SearchElement();
      index.textContent = '[]';
      root.children.set('[data-api-search-index]', index);
      const selector = `[data-api-search-language="${language}"][data-api-search-kind="${kind}"]`;
      const document = {
        querySelector: (query: string) => query === selector ? root : null,
        getElementById: () => new SearchElement(),
        addEventListener: events.addEventListener.bind(events),
        removeEventListener: events.removeEventListener.bind(events),
      };
      const window = {
        location: new URL('https://aspire.dev/reference/api/'),
        setTimeout,
      };
      vi.stubGlobal('document', document);
      vi.stubGlobal('window', window);
      vi.stubGlobal('HTMLInputElement', SearchElement);
      const { InpageSearchSync } = await import('@components/api-reference/inpage-search-sync');

      const segments: string[] = [language];
      if (kind !== 'landing') segments.push(language === 'csharp' ? '[package]' : '[module]');
      if (kind === 'type' || kind === 'item') segments.push(language === 'csharp' ? '[type]' : '[item]');
      const filename = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..',
        'src', 'pages', 'reference', 'api', ...segments, 'index.astro');
      const script = readFileSync(filename, 'utf8').match(/<script>([\s\S]*?)<\/script>/)?.[1];
      expect(script).toBeTruthy();
      const { outputText } = transpileModule(script!, {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
      });
      const modules: Record<string, unknown> = {
        '@components/api-reference/inpage-search-sync': { InpageSearchSync },
        '@components/api-reference/search-lifecycle': {
          readApiSearchIndex,
          registerApiSearch: (...args: Parameters<typeof registerApiSearch>) => {
            cleanup = registerApiSearch(...args);
          },
        },
        '@utils/ts-api-search-stats': searchStats,
      };
      runInNewContext(outputText, {
        exports: {}, require: (id: string) => modules[id], document, window, clearTimeout,
      });
      events.dispatchEvent(new Event('astro:page-load'));
      const input = root.querySelector(`#${prefix}-search-input`)!;
      input.value = 'pending';
      input.dispatchEvent(new Event('input'));
      expect(vi.getTimerCount()).toBe(1);
      events.dispatchEvent(new Event('astro:before-swap'));
      expect(vi.getTimerCount()).toBe(0);
      input.isConnected = false;
      input.dispatchEvent(new Event('input'));
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  afterEach(() => {
    dispose.forEach((cleanup) => cleanup());
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each(surfaces)('mounts %s %s once per matching root, never on another surface', (language, kind) => {
    const mount = vi.fn<MountSearch>();
    dispose.push(registerApiSearch(language, kind, mount));
    expect(mount).not.toHaveBeenCalled();

    for (const [otherLanguage, otherKind] of surfaces) {
      if (language === otherLanguage && kind === otherKind) continue;
      roots.set(selector(otherLanguage, otherKind), {} as HTMLElement);
    }
    events.dispatchEvent(new Event('astro:page-load'));
    expect(mount).not.toHaveBeenCalled();
    roots.clear();

    const firstRoot = {} as HTMLElement;
    roots.set(selector(language, kind), firstRoot);
    events.dispatchEvent(new Event('astro:page-load'));
    events.dispatchEvent(new Event('astro:page-load'));
    expect(mount).toHaveBeenCalledExactlyOnceWith(firstRoot, expect.any(AbortSignal));
    const firstSignal: AbortSignal = mount.mock.calls[0][1];

    events.dispatchEvent(new Event('astro:before-swap'));
    expect(firstSignal.aborted).toBe(true);
    const nextRoot = {} as HTMLElement;
    roots.set(selector(language, kind), nextRoot);
    events.dispatchEvent(new Event('astro:page-load'));
    expect(mount).toHaveBeenCalledTimes(2);
    expect(mount.mock.calls[1][0]).toBe(nextRoot);
    expect(mount.mock.calls[1][1].aborted).toBe(false);
  });

  it('mounts an already present root without double-initializing at page-load', () => {
    const root = {} as HTMLElement;
    roots.set(selector('csharp', 'package'), root);
    const mount = vi.fn<MountSearch>();
    dispose.push(registerApiSearch('csharp', 'package', mount));
    events.dispatchEvent(new Event('astro:page-load'));
    expect(mount).toHaveBeenCalledExactlyOnceWith(root, expect.any(AbortSignal));
  });

  it('aborts old document listeners and pending work before navigating off API pages', () => {
    vi.useFakeTimers();
    roots.set(selector('typescript', 'landing'), {} as HTMLElement);
    const onVersionChange = vi.fn();
    const writeOldUrl = vi.fn();
    dispose.push(registerApiSearch('typescript', 'landing', (_root, signal) => {
      events.addEventListener('version-filter-change', onVersionChange, { signal });
      const pendingSearch = setTimeout(writeOldUrl, 250);
      signal.addEventListener('abort', () => clearTimeout(pendingSearch), { once: true });
    }));
    events.dispatchEvent(new Event('version-filter-change'));
    expect(onVersionChange).toHaveBeenCalledOnce();

    events.dispatchEvent(new Event('astro:before-swap'));
    roots.clear();
    events.dispatchEvent(new Event('astro:page-load'));
    events.dispatchEvent(new Event('version-filter-change'));
    vi.runAllTimers();
    expect(onVersionChange).toHaveBeenCalledOnce();
    expect(writeOldUrl).not.toHaveBeenCalled();
  });

  it('also cleans up replaced or missing roots when only page-load is dispatched', () => {
    const mount = vi.fn<MountSearch>();
    roots.set(selector('csharp', 'type'), {} as HTMLElement);
    dispose.push(registerApiSearch('csharp', 'type', mount));
    const firstSignal: AbortSignal = mount.mock.calls[0][1];

    roots.set(selector('csharp', 'type'), {} as HTMLElement);
    events.dispatchEvent(new Event('astro:page-load'));
    expect(firstSignal.aborted).toBe(true);
    const nextSignal: AbortSignal = mount.mock.calls[1][1];
    roots.clear();
    events.dispatchEvent(new Event('astro:page-load'));
    expect(nextSignal.aborted).toBe(true);
    expect(mount).toHaveBeenCalledTimes(2);
  });

  it('unregisters lifecycle listeners as well as the current controller', () => {
    roots.set(selector('typescript', 'item'), {} as HTMLElement);
    const mount = vi.fn<MountSearch>();
    const cleanup = registerApiSearch('typescript', 'item', mount);
    cleanup();
    expect(mount.mock.calls[0][1].aborted).toBe(true);
    events.dispatchEvent(new Event('astro:page-load'));
    expect(mount).toHaveBeenCalledOnce();
  });

  it('reads data only from the matching root, preserving the language-specific schema', () => {
    const entries = [{ n: 'RedisResource', ns: 'Aspire.Hosting', k: 'class', s: '<summary>' }];
    const querySelector = vi.fn(() => ({ textContent: JSON.stringify(entries) }));
    const root = { querySelector } as unknown as HTMLElement;
    expect(readApiSearchIndex(root)).toEqual(entries);
    expect(querySelector).toHaveBeenCalledWith('[data-api-search-index]');
    expect(readApiSearchIndex(root)[0]).not.toHaveProperty('h');
  });

  it.each([null, '', ' \n\t '])('rejects a missing or empty required index: %j', (textContent) => {
    const root = {
      querySelector: () => textContent === null ? null : { textContent },
    } as unknown as HTMLElement;
    expect(() => readApiSearchIndex(root)).toThrow('API search: missing or empty search index');
  });

  it('accepts an explicitly serialized empty index', () => {
    const root = {
      querySelector: () => ({ textContent: '[]' }),
    } as unknown as HTMLElement;
    expect(readApiSearchIndex(root)).toEqual([]);
  });
});
