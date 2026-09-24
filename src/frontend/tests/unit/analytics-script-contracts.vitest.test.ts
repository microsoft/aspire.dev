import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { expect, test, vi } from 'vitest';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(testsDir, '..', '..');

function read(relativePath: string): string {
  return readFileSync(path.join(frontendRoot, relativePath), 'utf8');
}

function exists(relativePath: string): boolean {
  return existsSync(path.join(frontendRoot, relativePath));
}

test('head attrs reference static analytics scripts', () => {
  const headAttrs = read('config/head.attrs.ts');

  expect(headAttrs).toMatch(/src:\s*'\/scripts\/analytics\/1ds\.js'/);
  expect(headAttrs).toMatch(/src:\s*'\/scripts\/analytics\/track\.js'/);
  expect(headAttrs).not.toMatch(/src:\s*'\/1ds\//);
  expect(headAttrs).not.toMatch(/src:\s*'\/track\//);
});

test('analytics scripts live in public assets and legacy routes are gone', () => {
  expect(exists('public/scripts/analytics/1ds.js')).toBe(true);
  expect(exists('public/scripts/analytics/track.js')).toBe(true);
  expect(exists('public/scripts/1ds.js')).toBe(false);
  expect(exists('public/scripts/track.js')).toBe(false);
  expect(exists('src/pages/1ds.js')).toBe(false);
  expect(exists('src/pages/track.js')).toBe(false);
});

test('analytics asset files contain javascript bootstrap code', () => {
  const oneDsScript = read('public/scripts/analytics/1ds.js');
  const trackScript = read('public/scripts/analytics/track.js');

  expect(oneDsScript).toMatch(/oneDS\.ApplicationInsights/);
  expect(trackScript).toMatch(/capturePageAction/);
  expect(oneDsScript.trimStart().startsWith('<')).toBe(false);
  expect(trackScript.trimStart().startsWith('<')).toBe(false);
});

function analyticsFixture(origin = 'https://aspire.dev') {
  type TrackedElement = {
    tagName: string;
    href?: string;
    textContent: string;
    attributes: { name: string; value: string }[];
    getAttribute: (name: string) => string | null;
  };
  type TrackEvent = { target: { closest: (selector: string) => TrackedElement | null } };
  const initialize = vi.fn<(config: unknown, extensions: unknown[]) => void>();
  const capturePageAction = vi.fn<(target: TrackedElement, overrides: Record<string, string>) => void>();
  const addEventListener = vi.fn<(type: string, listener: (event: TrackEvent) => void) => void>();
  const console = { debug: vi.fn(), warn: vi.fn() };
  const context = {
    location: { origin },
    window: {},
    document: { addEventListener },
    console,
    oneDS: {
      ApplicationInsights: class {
        initialize = initialize;
        capturePageAction = capturePageAction;
      },
    },
  };
  const bootstrap = () => { runInNewContext(read('public/scripts/analytics/1ds.js'), context); };
  const tracking = () => { runInNewContext(read('public/scripts/analytics/track.js'), context); };
  return { initialize, capturePageAction, addEventListener, console, bootstrap, tracking };
}

test('analytics excludes unload without disabling other lifecycle or click capture', () => {
  const fixture = analyticsFixture();
  fixture.bootstrap();
  fixture.bootstrap();
  expect(fixture.initialize).toHaveBeenCalledOnce();
  expect(fixture.initialize.mock.calls[0][0]).toMatchObject({
    disablePageUnloadEvents: ['unload'],
    webAnalyticsConfiguration: {
      autoCapture: { onUnload: true, click: true, pageView: true },
    },
  });
  expect(fixture.console.debug).not.toHaveBeenCalled();
  expect(fixture.console.warn).not.toHaveBeenCalled();
});

test('analytics and tracking remain inactive on other origins', () => {
  const fixture = analyticsFixture('http://localhost:4321');
  fixture.bootstrap();
  fixture.tracking();
  expect(fixture.initialize).not.toHaveBeenCalled();
  expect(fixture.addEventListener).not.toHaveBeenCalled();
  expect(fixture.console.debug).not.toHaveBeenCalled();
});

test('tracking binds once, forwards nested clicks and stays quiet on success', () => {
  const fixture = analyticsFixture();
  fixture.tracking();
  expect(fixture.addEventListener).not.toHaveBeenCalled();
  fixture.bootstrap();
  fixture.tracking();
  fixture.tracking();
  expect(fixture.addEventListener).toHaveBeenCalledOnce();
  const [event, listener] = fixture.addEventListener.mock.calls[0];
  expect(event).toBe('click');
  const link = {
    tagName: 'A',
    href: 'https://aspire.dev/docs/',
    textContent: ' Docs ',
    attributes: [{ name: 'data-track-source-name', value: 'header' }],
    getAttribute: () => 'docs-link',
  };
  listener({ target: { closest: () => link } });
  expect(fixture.capturePageAction).toHaveBeenCalledExactlyOnceWith(link, {
    name: 'docs-link', sourceName: 'header', href: link.href, text: 'Docs',
  });
  expect(fixture.console.debug).not.toHaveBeenCalled();
  expect(fixture.console.warn).not.toHaveBeenCalled();
});

test('initialization and capture failures remain visible', () => {
  const initialization = analyticsFixture();
  initialization.initialize.mockImplementation(() => { throw new Error('initialization failed'); });
  initialization.bootstrap();
  expect(initialization.console.warn).toHaveBeenCalledWith(
    '[1ds] Failed to initialize Application Insights:', expect.any(Error),
  );

  const tracking = analyticsFixture();
  tracking.bootstrap();
  tracking.tracking();
  tracking.capturePageAction.mockImplementation(() => { throw new Error('capture failed'); });
  tracking.addEventListener.mock.calls[0][1]({
    target: { closest: () => ({
      tagName: 'BUTTON', textContent: '', attributes: [], getAttribute: () => 'button',
    }) },
  });
  expect(tracking.console.warn).toHaveBeenCalledWith(
    '[track] Failed to track event:', expect.any(Error),
  );
});
