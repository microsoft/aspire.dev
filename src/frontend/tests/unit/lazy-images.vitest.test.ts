import { afterEach, describe, expect, test, vi } from 'vitest';

import { loadLazyImagesNearViewport } from '@utils/lazy-images';

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];

  readonly observed: unknown[] = [];
  disconnected = false;

  constructor(
    private readonly callback: (entries: Array<{ isIntersecting: boolean }>) => void,
    readonly options: { rootMargin?: string }
  ) {
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: unknown) {
    this.observed.push(target);
  }

  disconnect() {
    this.disconnected = true;
  }

  notify(isIntersecting: boolean) {
    this.callback([{ isIntersecting }]);
  }
}

interface FakeImage {
  loading: string;
}

function createRoot(images: FakeImage[]) {
  const querySelectorAll = vi.fn((selector: string) => {
    // The helper only asks for lazy images, so a fake can answer the selector it is given.
    expect(selector).toBe('img[loading="lazy"]');
    return images.filter((image) => image.loading === 'lazy');
  });

  return { root: { querySelectorAll } as unknown as Element, querySelectorAll };
}

function installIntersectionObserver() {
  vi.stubGlobal('window', { IntersectionObserver: FakeIntersectionObserver });
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeIntersectionObserver.instances = [];
});

describe('loadLazyImagesNearViewport', () => {
  test('leaves images lazy until the root nears the viewport, then loads them once', () => {
    installIntersectionObserver();
    const images = [{ loading: 'lazy' }, { loading: 'lazy' }, { loading: 'eager' }];
    const { root, querySelectorAll } = createRoot(images);

    loadLazyImagesNearViewport(root);
    const [observer] = FakeIntersectionObserver.instances;

    expect(observer.observed).toEqual([root]);
    expect(observer.options.rootMargin).toBe('1500px 0px');
    expect(querySelectorAll).not.toHaveBeenCalled();

    observer.notify(false);
    expect(images.map((image) => image.loading)).toEqual(['lazy', 'lazy', 'eager']);
    expect(observer.disconnected).toBe(false);

    observer.notify(true);
    expect(images.map((image) => image.loading)).toEqual(['eager', 'eager', 'eager']);
    expect(observer.disconnected).toBe(true);
  });

  test('uses the requested root margin', () => {
    installIntersectionObserver();

    loadLazyImagesNearViewport(createRoot([]).root, '300px 0px');

    expect(FakeIntersectionObserver.instances[0].options.rootMargin).toBe('300px 0px');
  });

  test('stops waiting without touching the images when asked to', () => {
    installIntersectionObserver();
    const images = [{ loading: 'lazy' }];

    const stop = loadLazyImagesNearViewport(createRoot(images).root);
    stop();

    expect(FakeIntersectionObserver.instances[0].disconnected).toBe(true);
    expect(images[0].loading).toBe('lazy');
  });

  test('loads the images straight away when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('window', {});
    const images = [{ loading: 'lazy' }, { loading: 'eager' }];

    const stop = loadLazyImagesNearViewport(createRoot(images).root);

    expect(images.map((image) => image.loading)).toEqual(['eager', 'eager']);
    expect(() => stop()).not.toThrow();
  });
});
