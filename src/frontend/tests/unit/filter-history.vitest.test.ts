import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFilterHistory, isFilterNavigation } from '../../src/components/dev-center/filter-history';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('astro:transitions/client', () => ({ navigate }));

describe('filter history lifecycle', () => {
  let root: HTMLElement;
  let events: EventTarget;
  let controller: AbortController;
  let restore: ReturnType<typeof vi.fn>;
  let history: { state: Record<string, unknown>; replaceState: ReturnType<typeof vi.fn> };
  let scrollTo: ReturnType<typeof vi.fn>;
  let transitioning: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    navigate.mockResolvedValue(undefined);
    transitioning = false;
    events = new EventTarget();
    controller = new AbortController();
    restore = vi.fn();
    scrollTo = vi.fn();
    root = { dataset: { filterPath: '/hub/browse/' }, isConnected: true } as HTMLElement;
    history = {
      state: { index: 4, scrollX: 0, scrollY: 300, custom: 'preserved' },
      replaceState: vi.fn((state: Record<string, unknown>) => { history.state = state; }),
    };
    vi.stubGlobal('history', history);
    vi.stubGlobal('location', new URL('https://aspire.dev/hub/browse/'));
    vi.stubGlobal('scrollX', 0);
    vi.stubGlobal('scrollY', 300);
    vi.stubGlobal('window', { scrollTo });
    vi.stubGlobal('HTMLElement', class {});
    vi.stubGlobal('document', Object.assign(events, {
      documentElement: { hasAttribute: () => transitioning },
    }));
  });

  afterEach(() => {
    controller.abort();
    vi.unstubAllGlobals();
  });

  const parameters = ['q', 'type', 'page'];
  const swap = (to: string, info?: unknown, navigationType = 'push') => {
    const event = Object.assign(new Event('astro:before-swap'), {
      from: new URL('https://aspire.dev/hub/browse/'),
      to: new URL(to, 'https://aspire.dev'),
      info,
      navigationType,
      viewTransition: { skipTransition: vi.fn() },
      swap: vi.fn(),
    });
    events.dispatchEvent(event);
    return event;
  };

  it('preserves all router metadata when replacing query state', () => {
    const sync = createFilterHistory(root, parameters, restore, controller.signal);
    sync.initialize();
    const url = new URL('https://aspire.dev/hub/browse/?q=redis');
    expect(sync.write(url, true)).toBeUndefined();
    expect(history.replaceState).toHaveBeenLastCalledWith({
      index: 4, scrollX: 0, scrollY: 300, custom: 'preserved', aspireFilterPath: '/hub/browse/',
    }, '', url);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('lets Astro allocate indexes for new filter entries', async () => {
    const sync = createFilterHistory(root, parameters, restore, controller.signal);
    await sync.write(new URL('https://aspire.dev/hub/browse/?type=sample'), false);
    expect(navigate).toHaveBeenCalledWith('https://aspire.dev/hub/browse/?type=sample', {
      info: root, state: { aspireFilterPath: '/hub/browse/' }, history: 'push',
    });
  });

  it('supersedes pending filter navigation when the user types again', async () => {
    let finishFirst!: () => void;
    let finishLatest!: () => void;
    navigate.mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve; }));
    navigate.mockImplementationOnce(() => new Promise<void>((resolve) => { finishLatest = resolve; }));
    const sync = createFilterHistory(root, parameters, restore, controller.signal);
    const firstNavigation = sync.write(new URL('https://aspire.dev/hub/browse/?type=sample'), false);
    const latestNavigation = sync.write(new URL('https://aspire.dev/hub/browse/?type=sample&q=redis'), true);
    expect(firstNavigation).toBeInstanceOf(Promise);
    expect(latestNavigation).toBeInstanceOf(Promise);
    expect(navigate).toHaveBeenLastCalledWith('https://aspire.dev/hub/browse/?type=sample&q=redis', {
      info: root, state: { aspireFilterPath: '/hub/browse/' }, history: 'replace',
    });
    finishFirst();
    await firstNavigation;
    finishLatest();
    await latestNavigation;
    expect(sync.write(new URL('https://aspire.dev/hub/browse/?type=sample&q=redis2'), true)).toBeUndefined();
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(history.replaceState).toHaveBeenLastCalledWith(history.state, '', new URL('https://aspire.dev/hub/browse/?type=sample&q=redis2'));
  });

  it('does not read or normalize the outgoing URL during connection inside a swap', () => {
    transitioning = true;
    const sync = createFilterHistory(root, parameters, restore, controller.signal);
    sync.initialize();
    expect(restore).not.toHaveBeenCalled();
    events.dispatchEvent(new Event('astro:after-swap'));
    events.dispatchEvent(new Event('astro:page-load'));
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('restores a module first loaded after swapping on page-load', () => {
    transitioning = true;
    createFilterHistory(root, parameters, restore, controller.signal).initialize();
    events.dispatchEvent(new Event('astro:page-load'));
    expect(restore).toHaveBeenCalledOnce();
  });

  it('keeps local pushes mounted and preserves scroll without resetting focused controls', () => {
    createFilterHistory(root, parameters, restore, controller.signal);
    const event = swap('/hub/browse/?page=2', root);
    expect(vi.isMockFunction(event.swap)).toBe(false);
    expect(event.viewTransition.skipTransition).toHaveBeenCalledOnce();
    events.dispatchEvent(new Event('astro:after-swap'));
    events.dispatchEvent(new Event('astro:page-load'));
    expect(restore).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, top: 300, behavior: 'instant' });
  });

  it('restores owned filter traversals without overriding Astro scroll restoration', () => {
    createFilterHistory(root, parameters, restore, controller.signal).initialize();
    restore.mockClear();
    const event = swap('/hub/browse/?type=sample', undefined, 'traverse');
    expect(vi.isMockFunction(event.swap)).toBe(false);
    events.dispatchEvent(new Event('astro:after-swap'));
    events.dispatchEvent(new Event('astro:page-load'));
    expect(restore).toHaveBeenCalledOnce();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('restores control focus blurred by fragment navigation without stealing a new focus', () => {
    const focused = Object.assign(new HTMLElement(), { isConnected: true, focus: vi.fn() });
    const body = {};
    Object.assign(document, { activeElement: focused, body });
    createFilterHistory(root, parameters, restore, controller.signal);
    swap('/hub/browse/?type=sample#results', root);
    Object.assign(document, { activeElement: body });
    events.dispatchEvent(new Event('astro:after-swap'));
    expect(focused.focus).toHaveBeenCalledWith({ preventScroll: true });

    Object.assign(document, { activeElement: focused });
    swap('/hub/browse/?type=sample#results', root);
    Object.assign(document, { activeElement: new HTMLElement() });
    events.dispatchEvent(new Event('astro:after-swap'));
    expect(focused.focus).toHaveBeenCalledTimes(1);
  });

  it('does not override unrelated links, routes or query parameters', () => {
    createFilterHistory(root, parameters, restore, controller.signal).initialize();
    for (const event of [
      swap('/hub/browse/?q=redis'),
      swap('/hub/glossary/?q=redis', root),
      swap('/hub/browse/?aspire-lang=csharp', root),
    ]) {
      expect(vi.isMockFunction(event.swap)).toBe(true);
    }
  });

  it('disposes all callbacks and ignores stale writes when disconnected', () => {
    const sync = createFilterHistory(root, parameters, restore, controller.signal);
    controller.abort();
    expect(sync.write(new URL('https://aspire.dev/hub/browse/?q=stale'), false)).toBeUndefined();
    events.dispatchEvent(new Event('astro:after-swap'));
    events.dispatchEvent(new Event('astro:page-load'));
    expect(navigate).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it('compares only unrelated query parameters for local filter navigation', () => {
    const url = (query: string) => new URL(`https://aspire.dev/hub/browse/${query}`);
    expect(isFilterNavigation(url('?keep=1&q=old'), url('?q=new&keep=1&page=2'), parameters)).toBe(true);
    expect(isFilterNavigation(url('?keep=1'), url('?keep=2'), parameters)).toBe(false);
    expect(isFilterNavigation(url(''), new URL('https://example.com/hub/browse/'), parameters)).toBe(false);
  });
});
