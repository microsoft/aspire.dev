import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';

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
  expect(oneDsScript).toContain('urlCollectQuery: false');
  expect(oneDsScript).not.toContain('urlCollectQuery: true');
  expect(trackScript).toMatch(/trackPageAction/);
  expect(trackScript).toContain('aspire.dev/funnel/step');
  expect(trackScript).toContain('schemaVersion: 1');
  expect(trackScript).toContain("document.addEventListener('aspire:funnel-step'");
  expect(trackScript).toContain('search_success');
  expect(trackScript).toContain('integration_adoption');
  expect(trackScript).toContain('deployment_intent');
  expect(trackScript).toContain('troubleshooting_recovery');
  expect(trackScript).toContain('not_found_recovery');
  expect(trackScript).toContain('existing_app_adoption');
  expect(trackScript).not.toMatch(/\bquery:\s*\[/);
  expect(trackScript).not.toMatch(/capturePageAction/);
  expect(oneDsScript.trimStart().startsWith('<')).toBe(false);
  expect(trackScript.trimStart().startsWith('<')).toBe(false);
});

test('OneDS automatic events use the same query-free canonical URL contract', () => {
  type TelemetryItem = {
    baseData?: Record<string, string>;
    data?: Record<string, string>;
  };
  type AnalyticsConfig = {
    webAnalyticsConfiguration: {
      autoCapture: Record<string, boolean>;
      callback: {
        pageName: () => string;
      };
    };
  };

  let initializedConfig: AnalyticsConfig | undefined;
  let initializer: ((item: TelemetryItem) => void) | undefined;
  const captureCalls: string[] = [];
  const documentListeners = new Map<string, () => void>();
  const storage = new Map<string, string>();
  let notFoundPage = true;
  const locationStub = {
    origin: 'https://aspire.dev',
    pathname: '/private-missing-path/',
  };

  class ApplicationInsightsStub {
    initialize(config: AnalyticsConfig): void {
      initializedConfig = config;
    }

    addTelemetryInitializer(callback: (item: TelemetryItem) => void): void {
      initializer = callback;
    }

    capturePageView(): void {
      captureCalls.push('pageView');
    }

    capturePageViewPerformance(): void {
      captureCalls.push('pageViewPerformance');
    }

    captureContentUpdate(): void {
      captureCalls.push('contentUpdate');
    }
  }

  const windowStub: Record<string, unknown> = {
    addEventListener() {},
    sessionStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      removeItem(key: string) {
        storage.delete(key);
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
    },
  };
  runInNewContext(read('public/scripts/analytics/1ds.js'), {
    console: { debug() {} },
    document: {
      addEventListener(name: string, listener: () => void) {
        documentListeners.set(name, listener);
      },
      querySelector: () => (notFoundPage ? {} : null),
      readyState: 'complete',
    },
    location: locationStub,
    oneDS: { ApplicationInsights: ApplicationInsightsStub },
    URL,
    window: windowStub,
  });

  expect(initializedConfig?.webAnalyticsConfiguration.autoCapture).toMatchObject({
    click: true,
    jsError: false,
    pageView: false,
    onLoad: false,
  });
  expect(initializedConfig?.webAnalyticsConfiguration.callback.pageName()).toBe('404');
  expect(captureCalls).toEqual(['pageView', 'pageViewPerformance', 'contentUpdate']);
  expect(initializer).toBeTypeOf('function');
  expect(storage.get('aspire-last-route-not-found')).toBe('true');

  notFoundPage = false;
  locationStub.pathname = '/get-started/';
  documentListeners.get('astro:page-load')?.();
  documentListeners.get('astro:page-load')?.();

  expect(initializedConfig?.webAnalyticsConfiguration.callback.pageName()).toBe('get-started');
  expect(captureCalls).toEqual([
    'pageView',
    'pageViewPerformance',
    'contentUpdate',
    'pageView',
    'contentUpdate',
  ]);
  expect(storage.has('aspire-last-route-not-found')).toBe(false);

  const item: TelemetryItem = {
    baseData: {
      uri: 'https://aspire.dev/get-started/?q=private',
      targetUri: 'https://aspire.dev/reference/api/csharp/?q=private',
      refUri: 'https://aspire.dev/private-missing-path/?q=private',
    },
    data: {
      referrerUri: 'https://search.example/results/?q=private',
    },
  };
  initializer!(item);

  expect(item).toEqual({
    baseData: {
      uri: 'https://aspire.dev/get-started/',
      targetUri: 'https://aspire.dev/reference/api/csharp/',
      refUri: 'https://aspire.dev/404/',
    },
    data: {
      referrerUri: 'https://search.example/results/',
    },
  });
});

test('funnel metadata plugin copies allowlisted metadata to rendered code blocks', async () => {
  const { pluginFunnelMetadata } =
    await import('../../src/expressive-code-plugins/funnel-metadata.mjs');
  const plugin = pluginFunnelMetadata();
  const codeBlock = {
    meta: [
      'title="Install"',
      'data-funnel="cli_install"',
      'data-funnel-step="command_copied"',
      'data-funnel-trigger="copy"',
    ].join(' '),
    props: {},
  };
  const renderData = { blockAst: { properties: {} } };

  plugin.hooks.preprocessMetadata({ codeBlock });
  plugin.hooks.postprocessRenderedBlock({ codeBlock, renderData });

  expect(renderData.blockAst.properties).toMatchObject({
    'data-funnel': 'cli_install',
    'data-funnel-step': 'command_copied',
    'data-funnel-trigger': 'copy',
  });
});

test('English and Japanese funnel guides declare command and continuation milestones', () => {
  const guidePaths = [
    'src/content/docs/get-started/install-cli.mdx',
    'src/content/docs/ja/get-started/install-cli.mdx',
    'src/content/docs/get-started/first-app.mdx',
    'src/content/docs/ja/get-started/first-app.mdx',
  ];

  for (const guidePath of guidePaths) {
    const guide = read(guidePath);
    expect(guide, guidePath).toContain('data-funnel=');
    expect(guide, guidePath).toContain('data-funnel-step=');
  }

  const firstAppGuide = read('src/content/docs/get-started/first-app.mdx');
  expect(firstAppGuide).toContain('data-funnel-step="create_command_copied"');
  expect(firstAppGuide).toContain('data-funnel-step="run_command_copied"');
  expect(firstAppGuide).toContain('data-funnel-step="next_step_clicked"');
});

test('additional funnel surfaces declare their milestones without raw search dimensions', () => {
  const deployGuides = [
    read('src/content/docs/get-started/deploy-first-app.mdx'),
    read('src/content/docs/ja/get-started/deploy-first-app.mdx'),
  ];
  for (const guide of deployGuides) {
    expect(guide).toContain('data-funnel-step="prerequisite_copied"');
    expect(guide).toContain('data-funnel-step="deploy_command_copied"');
    expect(guide).toContain('data-funnel-step="verification_or_troubleshooting"');
  }

  const troubleshootingGuides = [
    read('src/content/docs/get-started/troubleshooting.mdx'),
    read('src/content/docs/ja/get-started/troubleshooting.mdx'),
  ];
  for (const guide of troubleshootingGuides) {
    expect(guide).toContain('data-funnel-step="issue_viewed"');
    expect(guide).toContain('data-funnel-step="remediation_copied"');
  }

  const existingAppGuide = read('src/content/docs/get-started/add-aspire-existing-app.mdx');
  expect(existingAppGuide).toContain('data-funnel-step="approach_viewed"');
  expect(existingAppGuide).toContain('data-funnel-step="setup_command_copied"');
  expect(existingAppGuide).toContain('data-funnel-step="run_command_copied"');

  const notFoundGuide = read('src/content/docs/404.mdx');
  expect(notFoundGuide).toContain('data-funnel-step="not_found_viewed"');
  expect(notFoundGuide).toContain('data-funnel-step="recovery_action"');
  expect(notFoundGuide).toMatch(/name:\s*referrer\s+content:\s*'no-referrer'/);

  const search = read('src/components/starlight/Search.astro');
  expect(search).toContain("emitSearchStep('search_opened')");
  expect(search).toContain("'results_shown'");
  expect(search).toContain("'result_selected'");
  expect(search).toContain('destinationHref: `${url.origin}${url.pathname}`');
  expect(search.match(/data-bi-dnt="true"/g)).toHaveLength(2);
  expect(search).not.toMatch(/\bquery:\s*query\b/);
});
