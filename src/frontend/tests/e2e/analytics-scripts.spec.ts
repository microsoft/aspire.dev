import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

import { dismissCookieConsentIfVisible } from './helpers';

interface FunnelEvent {
  pageAction: {
    name: string;
    uri: string;
    pageName: string;
    actionType: string;
    isManual: boolean;
  };
  properties: Record<string, string | number>;
}

declare global {
  interface Window {
    analytics: {
      __initialized: boolean;
      __trackingBound?: boolean;
      trackPageAction: (
        pageAction: FunnelEvent['pageAction'],
        properties: FunnelEvent['properties']
      ) => void;
    };
    aspireAnalytics: {
      trackFunnelStep: (details: Record<string, string>) => boolean;
    };
    __funnelEvents: FunnelEvent[];
  }
}

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const trackerPath = path.resolve(
  testsDir,
  '..',
  '..',
  'public',
  'scripts',
  'analytics',
  'track.js'
);

const analyticsScripts = [
  {
    path: '/scripts/analytics/1ds.js',
    marker: 'oneDS.ApplicationInsights',
  },
  {
    path: '/scripts/analytics/track.js',
    marker: 'trackPageAction',
  },
];

async function installTracker(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__funnelEvents = [];
    window.analytics = {
      __initialized: true,
      trackPageAction(pageAction, properties) {
        window.__funnelEvents.push({ pageAction, properties });
      },
    };
  });

  await page.addScriptTag({ path: trackerPath });
}

async function readFunnelEvents(page: Page, funnel: string): Promise<FunnelEvent[]> {
  return page.evaluate(
    (expectedFunnel) =>
      window.__funnelEvents.filter((event) => event.properties.funnel === expectedFunnel),
    funnel
  );
}

for (const analyticsScript of analyticsScripts) {
  test(`${analyticsScript.path} returns javascript`, async ({ request }) => {
    const response = await request.get(analyticsScript.path);
    const contentType = response.headers()['content-type'] ?? '';
    const body = await response.text();

    expect(response.ok()).toBeTruthy();
    expect(contentType).toContain('javascript');
    expect(body.trimStart().startsWith('<')).toBeFalsy();
    expect(body).toContain(analyticsScript.marker);
  });
}

test('home page references static analytics assets', async ({ request }) => {
  const response = await request.get('/');
  const html = await response.text();

  expect(response.ok()).toBeTruthy();
  expect(html).toContain('/scripts/analytics/1ds.js');
  expect(html).toContain('/scripts/analytics/track.js');
  expect(html).not.toContain('src="/1ds/"');
  expect(html).not.toContain('src="/track/"');
});

test('direct install visits emit entry and options stages once per navigation', async ({
  page,
}) => {
  await page.goto('/get-started/install-cli/');
  await dismissCookieConsentIfVisible(page);
  await installTracker(page);

  await page.evaluate(() => {
    document.dispatchEvent(new Event('astro:page-load'));
    document.dispatchEvent(new Event('astro:page-load'));
  });

  const events = await readFunnelEvents(page, 'cli_install');
  expect(events.map((event) => event.properties.step)).toEqual(['entry', 'options_viewed']);
  expect(await page.evaluate(() => typeof window.aspireAnalytics.trackFunnelStep)).toBe('function');
  expect(events[0]?.properties).toMatchObject({
    schemaVersion: 1,
    stepIndex: 1,
    surface: 'install_page',
    entryType: 'direct',
    path: '/get-started/install-cli/',
  });
  expect(events[1]?.properties.stepIndex).toBe(2);
  expect(events.every((event) => event.pageAction.name === 'aspire.dev/funnel/step')).toBe(true);

  await page.locator('figure[data-funnel-method="homebrew"]:visible .copy button').click();

  const copyEvent = (await readFunnelEvents(page, 'cli_install'))[2];
  expect(copyEvent?.properties).toMatchObject({
    step: 'command_copied',
    stepIndex: 3,
    surface: 'install_page',
    method: 'homebrew',
    platform: 'macos',
    channel: 'release',
  });
});

test('install modal emits ordered entry, options, and command-copy stages', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await dismissCookieConsentIfVisible(page);
  await installTracker(page);

  await page.locator('.header [data-open-install-modal]:visible').click();

  const modal = page.locator('#install-cli-modal').first();
  await expect(modal).toBeVisible();
  await modal
    .locator('[data-funnel-platform="macos"] [data-funnel-channel="release"] .copy button')
    .click();

  const events = await readFunnelEvents(page, 'cli_install');
  expect(events.map((event) => event.properties.step)).toEqual([
    'entry',
    'options_viewed',
    'command_copied',
  ]);
  expect(events[0]?.properties).toMatchObject({
    stepIndex: 1,
    surface: 'header',
    entryType: 'cta',
  });
  expect(events[1]?.properties).toMatchObject({
    stepIndex: 2,
    surface: 'install_modal',
  });
  expect(events[2]?.properties).toMatchObject({
    stepIndex: 3,
    surface: 'install_modal',
    method: 'script',
    platform: 'macos',
    channel: 'release',
  });
});

test('localized install routes emit normalized stages and render tracked commands', async ({
  page,
}) => {
  const response = await page.goto('/ja/get-started/install-cli/');
  expect(response?.ok()).toBe(true);
  await dismissCookieConsentIfVisible(page);
  await installTracker(page);

  await page.locator('figure[data-funnel-method="script"]:visible .copy button').first().click();

  const events = await readFunnelEvents(page, 'cli_install');
  expect(events.map((event) => event.properties.step)).toEqual([
    'entry',
    'options_viewed',
    'command_copied',
  ]);
  expect(events[0]?.properties).toMatchObject({
    locale: 'ja',
    path: '/get-started/install-cli/',
  });
  expect(events[2]?.properties).toMatchObject({
    method: 'script',
    channel: 'release',
    locale: 'ja',
    path: '/get-started/install-cli/',
  });
  expect(['unix', 'windows']).toContain(events[2]?.properties.platform);
});

test('first-app actions emit the complete getting-started funnel', async ({ page }) => {
  await page.goto('/get-started/first-app/');
  await dismissCookieConsentIfVisible(page);
  await installTracker(page);

  await page
    .locator(
      'figure[data-funnel-step="create_command_copied"][data-funnel-language="csharp"]:visible .copy button'
    )
    .click();
  await page
    .locator(
      'figure[data-funnel-step="run_command_copied"][data-funnel-language="csharp"]:visible .copy button'
    )
    .click();
  const nextStepLink = page.locator(
    'a[data-funnel-step="next_step_clicked"][data-funnel-language="csharp"][data-funnel-destination="testing"]:visible'
  );
  await nextStepLink.evaluate((link) => {
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  });
  await nextStepLink.click();

  const events = await readFunnelEvents(page, 'getting_started');
  expect(events.map((event) => event.properties.step)).toEqual([
    'first_app_viewed',
    'create_command_copied',
    'run_command_copied',
    'next_step_clicked',
  ]);
  expect(events.map((event) => event.properties.stepIndex)).toEqual([1, 2, 3, 4]);
  expect(events.slice(1).every((event) => event.properties.language === 'csharp')).toBe(true);
  expect(events[3]?.properties.destination).toBe('testing');
});

test('localized routes retain locale while using a normalized funnel path', async ({ page }) => {
  await page.goto('/ja/get-started/first-app/');
  await dismissCookieConsentIfVisible(page);
  await installTracker(page);

  await page.locator('figure[data-funnel-step="run_command_copied"]:visible .copy button').click();

  const events = await readFunnelEvents(page, 'getting_started');
  expect(events).toHaveLength(2);
  expect(events[0]?.properties).toMatchObject({
    step: 'first_app_viewed',
    locale: 'ja',
    path: '/get-started/first-app/',
  });
  expect(events[1]?.properties).toMatchObject({
    step: 'run_command_copied',
    language: 'csharp',
    locale: 'ja',
    path: '/get-started/first-app/',
  });
});

test('custom funnel events keep bounded dimensions and omit raw search text', async ({ page }) => {
  await page.goto('/get-started/first-app/');
  await dismissCookieConsentIfVisible(page);
  await installTracker(page);

  await page.evaluate(() => {
    window.__funnelEvents = [];
    document.dispatchEvent(
      new CustomEvent('aspire:funnel-step', {
        detail: {
          funnel: 'search_success',
          step: 'results_shown',
          surface: 'site_search',
          query: 'do not collect this',
          queryLength: 'four_to_ten',
          resultCount: 'one_to_five',
          integration: '<invalid>',
        },
      })
    );
  });

  const events = await readFunnelEvents(page, 'search_success');
  expect(events).toHaveLength(1);
  expect(events[0]?.properties).toMatchObject({
    step: 'results_shown',
    queryLength: 'four_to_ten',
    resultCount: 'one_to_five',
  });
  expect(events[0]?.properties).not.toHaveProperty('query');
  expect(events[0]?.properties).not.toHaveProperty('integration');
});

test('search selection continues to the first meaningful destination action', async ({ page }) => {
  await page.goto('/ja/get-started/first-app/');
  await dismissCookieConsentIfVisible(page);
  await installTracker(page);

  await page.evaluate(() => {
    window.__funnelEvents = [];
    document.dispatchEvent(
      new CustomEvent('aspire:funnel-step', {
        detail: {
          funnel: 'search_success',
          step: 'result_selected',
          surface: 'site_search',
          queryLength: 'four_to_ten',
          resultCount: 'one_to_five',
          selectedRank: 'first',
          searchTarget: 'docs',
          destinationHref: '/ja/get-started/first-app',
          actionType: 'CL',
        },
      })
    );
  });

  expect(
    await page.evaluate(() => {
      const marker = sessionStorage.getItem('aspire-search-destination');
      return marker ? JSON.parse(marker).destinationPath : null;
    })
  ).toBe('/get-started/first-app/');

  const destinationLink = page.locator('main a[href]:visible').first();
  await destinationLink.evaluate((link) => {
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  });
  await destinationLink.click();

  const events = await readFunnelEvents(page, 'search_success');
  expect(events.map((event) => event.properties.step)).toEqual([
    'result_selected',
    'destination_action',
  ]);
  expect(events[1]?.properties).toMatchObject({
    surface: 'search_destination',
    actionKind: 'internal_navigation',
    selectedRank: 'first',
    searchTarget: 'docs',
  });

  await page.evaluate(() => {
    sessionStorage.removeItem('aspire-search-destination');
    document.dispatchEvent(
      new CustomEvent('aspire:funnel-step', {
        detail: {
          funnel: 'search_success',
          step: 'result_selected',
          surface: 'site_search',
          destinationHref: 'https://example.com/private/?q=do-not-collect',
        },
      })
    );
  });
  expect(await page.evaluate(() => sessionStorage.getItem('aspire-search-destination'))).toBeNull();
});

test('site search emits bounded open, result, and selection stages', async ({ page }) => {
  await page.goto('/');
  await dismissCookieConsentIfVisible(page);
  await installTracker(page);

  await page.locator('site-search button[data-open-modal]').click();
  await page.evaluate(() => {
    const dialog = document.querySelector('site-search dialog');
    if (!dialog) throw new Error('Search dialog not found');

    dialog.querySelector('.pagefind-ui')?.remove();
    dialog.querySelectorAll('.pagefind-ui__search-input').forEach((element) => element.remove());
    const input = document.createElement('input');
    input.className = 'pagefind-ui__search-input';
    dialog.append(input);
    document.dispatchEvent(new Event('astro:after-swap'));
  });

  const input = page.locator('site-search dialog .pagefind-ui__search-input');
  await expect(input).toHaveAttribute('role', 'combobox');
  await input.fill('abandoned');
  await page.evaluate(() => {
    const dialog = document.querySelector('site-search dialog');
    if (!(dialog instanceof HTMLDialogElement)) throw new Error('Search dialog not found');

    const results = document.createElement('div');
    results.className = 'pagefind-ui__results';
    results.innerHTML = '<a class="pagefind-ui__result-link" href="/get-started/">Get started</a>';
    dialog.append(results);
    dialog.close();
  });
  await page.waitForTimeout(600);
  let events = await readFunnelEvents(page, 'search_success');
  expect(
    events.some((event) => ['results_shown', 'no_results'].includes(String(event.properties.step)))
  ).toBe(false);

  await page
    .locator('site-search dialog .pagefind-ui__results')
    .evaluate((results) => results.remove());
  await page.locator('site-search button[data-open-modal]').click();
  await input.fill('aspire setup');
  await page.evaluate(() => {
    const dialog = document.querySelector('site-search dialog');
    if (!dialog) throw new Error('Search dialog not found');

    const results = document.createElement('div');
    results.className = 'pagefind-ui__results';
    results.innerHTML = '<div class="pagefind-ui__loading"></div>';
    dialog.append(results);
  });
  await page.waitForTimeout(600);
  events = await readFunnelEvents(page, 'search_success');
  expect(
    events.some((event) => ['results_shown', 'no_results'].includes(String(event.properties.step)))
  ).toBe(false);

  await page.evaluate(() => {
    const results = document.querySelector('site-search dialog .pagefind-ui__results');
    if (!results) throw new Error('Search results not found');
    results.innerHTML =
      '<a class="pagefind-ui__result-link" href="/get-started/first-app/">Build your first app</a>';
  });
  await expect
    .poll(async () =>
      (await readFunnelEvents(page, 'search_success')).some(
        (event) => event.properties.step === 'results_shown'
      )
    )
    .toBe(true);

  const result = page.locator('site-search dialog .pagefind-ui__result-link');
  await result.evaluate((link) => {
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  });
  await result.click();

  events = await readFunnelEvents(page, 'search_success');
  expect(events.map((event) => event.properties.step)).toContain('search_opened');
  expect(events.map((event) => event.properties.step)).toContain('results_shown');
  expect(events.at(-1)?.properties).toMatchObject({
    step: 'result_selected',
    queryLength: 'eleven_to_thirty',
    resultCount: 'one_to_five',
    selectedRank: 'first',
    searchTarget: 'docs',
    resultType: 'docs',
  });
  expect(events.every((event) => !('query' in event.properties))).toBe(true);

  await page
    .locator('site-search dialog .pagefind-ui__results')
    .evaluate((results) => results.remove());
  await page.locator('site-search button[data-open-modal]').click();
  await input.fill('missing');
  await page.waitForTimeout(600);
  expect(
    (await readFunnelEvents(page, 'search_success')).some(
      (event) =>
        event.properties.step === 'no_results' && event.properties.queryLength === 'four_to_ten'
    )
  ).toBe(false);
  await page.evaluate(() => {
    const dialog = document.querySelector('site-search dialog');
    if (!dialog) throw new Error('Search dialog not found');

    const results = document.createElement('div');
    results.className = 'pagefind-ui__results';
    dialog.append(results);
  });
  await expect
    .poll(async () =>
      (await readFunnelEvents(page, 'search_success')).some(
        (event) =>
          event.properties.step === 'no_results' && event.properties.queryLength === 'four_to_ten'
      )
    )
    .toBe(true);

  events = await readFunnelEvents(page, 'search_success');
  expect(events.at(-1)?.properties).toMatchObject({
    step: 'no_results',
    queryLength: 'four_to_ten',
    resultCount: 'zero',
  });
});

test('integration gallery emits discovery, selection, and install intent', async ({ page }) => {
  await page.goto('/integrations/gallery/');
  await dismissCookieConsentIfVisible(page);
  await installTracker(page);

  await page.locator('.search-box').fill('redis');
  await expect
    .poll(async () => (await readFunnelEvents(page, 'integration_adoption')).length)
    .toBeGreaterThanOrEqual(2);

  const card = page.locator('.card:visible').first();
  const title = card.locator('.title-link');
  await title.evaluate((link) => {
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  });
  await title.click();
  await card.locator('.install-command .copy button').click();

  const events = await readFunnelEvents(page, 'integration_adoption');
  expect(events.map((event) => event.properties.step)).toEqual([
    'gallery_viewed',
    'filter_used',
    'integration_selected',
    'install_command_copied',
  ]);
  expect(events[1]?.properties).toMatchObject({
    filterType: 'search',
    queryLength: 'four_to_ten',
  });
  expect(events[2]?.properties.integration).toMatch(/^[a-z0-9@/._-]+$/);
  expect(events[3]?.properties.method).toBe('aspire_cli');
});

test('integration articles distinguish install and configuration copies', async ({ page }) => {
  await page.goto('/integrations/caching/redis/redis-connect/');
  await dismissCookieConsentIfVisible(page);
  await installTracker(page);

  await page
    .locator('[data-funnel-step="install_command_copied"]:visible .copy button')
    .first()
    .click();
  await page
    .locator('figure')
    .filter({ hasText: 'builder.AddRedisClient(connectionName: "cache")' })
    .locator('.copy button')
    .click();

  const events = await readFunnelEvents(page, 'integration_adoption');
  expect(events.map((event) => event.properties.step)).toEqual([
    'install_command_copied',
    'configuration_copied',
  ]);
  expect(events[0]?.properties).toMatchObject({
    integration: 'aspire.stackexchange.redis',
    integrationKind: 'client',
  });
  expect(events[1]?.properties.integration).toBe('aspire.stackexchange.redis');
});

test('deployment guide emits target, prerequisite, deploy, and verification intent', async ({
  page,
}) => {
  await page.goto('/get-started/deploy-first-app/');
  await dismissCookieConsentIfVisible(page);
  await installTracker(page);

  await page
    .locator('starlight-tabs[data-sync-key="deploy-target"] [role="tab"]')
    .filter({ hasText: 'Azure' })
    .first()
    .click();
  await page
    .locator(
      'figure[data-funnel-step="prerequisite_copied"][data-funnel-target="azure_container_apps"]:visible .copy button'
    )
    .first()
    .click();
  await page
    .locator(
      'figure[data-funnel-step="deploy_command_copied"][data-funnel-target="azure_container_apps"]:visible .copy button'
    )
    .first()
    .click();
  await page.evaluate(() => {
    const marker = Array.from(
      document.querySelectorAll(
        '[data-funnel-step="verification_or_troubleshooting"][data-funnel-target="azure_container_apps"]'
      )
    ).find((element) => !element.closest('[hidden]'));
    marker?.scrollIntoView();
  });

  await expect
    .poll(async () =>
      (await readFunnelEvents(page, 'deployment_intent')).map((event) => event.properties.step)
    )
    .toContain('verification_or_troubleshooting');

  const events = await readFunnelEvents(page, 'deployment_intent');
  expect(events.map((event) => event.properties.step)).toEqual([
    'deploy_guide_viewed',
    'target_selected',
    'prerequisite_copied',
    'deploy_command_copied',
    'verification_or_troubleshooting',
  ]);
  expect(events.slice(1).every((event) => event.properties.target === 'azure_container_apps')).toBe(
    true
  );
  expect(events.at(-1)?.properties.destination).toBe('verification');
});

test('troubleshooting guide records issue discovery and remediation copies', async ({ page }) => {
  await page.goto('/get-started/troubleshooting/');
  await dismissCookieConsentIfVisible(page);
  await installTracker(page);

  await page
    .locator('figure[data-funnel-issue="port_conflict"]:visible .copy button')
    .first()
    .click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  const issueLink = page.locator('a[href="https://github.com/microsoft/aspire/issues"]');
  await issueLink.evaluate((link) => {
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  });
  await issueLink.click();

  const events = await readFunnelEvents(page, 'troubleshooting_recovery');
  expect(events[0]?.properties.step).toBe('troubleshooting_viewed');
  expect(events).toContainEqual(
    expect.objectContaining({
      properties: expect.objectContaining({
        step: 'issue_viewed',
        issue: 'port_conflict',
      }),
    })
  );
  expect(events).toContainEqual(
    expect.objectContaining({
      properties: expect.objectContaining({
        step: 'remediation_copied',
        issue: 'port_conflict',
      }),
    })
  );
  expect(events).toContainEqual(
    expect.objectContaining({
      properties: expect.objectContaining({
        step: 'return_to_task',
        issue: 'port_conflict',
      }),
    })
  );
  expect(events.at(-1)?.properties).toMatchObject({
    step: 'file_issue',
    issue: 'typescript_apphost',
    destination: 'github_issue',
  });
});

test('existing-app guide records approach, setup, run, and continuation intent', async ({
  page,
}) => {
  await page.goto('/get-started/add-aspire-existing-app/');
  await dismissCookieConsentIfVisible(page);
  await installTracker(page);

  await page
    .locator(
      'figure[data-funnel-step="setup_command_copied"][data-funnel-approach="ai_agent"] .copy button'
    )
    .click();
  await page.locator('figure[data-funnel-step="run_command_copied"] .copy button').click();

  const nextStep = page.locator('main a[href="/get-started/deploy-first-app/"]').last();
  await nextStep.evaluate((link) => {
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  });
  await nextStep.click();

  const events = await readFunnelEvents(page, 'existing_app_adoption');
  expect(events[0]?.properties.step).toBe('guide_viewed');
  expect(events).toContainEqual(
    expect.objectContaining({
      properties: expect.objectContaining({
        step: 'approach_viewed',
        approach: 'ai_agent',
      }),
    })
  );
  expect(events.map((event) => event.properties.step)).toContain('setup_command_copied');
  expect(events.map((event) => event.properties.step)).toContain('run_command_copied');
  expect(events.at(-1)?.properties).toMatchObject({
    step: 'next_step_clicked',
    destination: 'deploy',
  });
});

test('404 page records recovery actions without exposing the requested path', async ({ page }) => {
  await page.goto('/this-page-does-not-exist/?q=do-not-collect');
  await dismissCookieConsentIfVisible(page);
  await installTracker(page);

  const back = page.locator('[data-funnel-recovery-action="back"]');
  await back.evaluate((link) => {
    link.removeAttribute('onclick');
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  });
  await back.click();

  let events = await readFunnelEvents(page, 'not_found_recovery');
  expect(events.map((event) => event.properties.step)).toEqual([
    'not_found_viewed',
    'recovery_action',
  ]);
  expect(events[1]?.properties.recoveryAction).toBe('back');
  expect(events.slice(0, 2).every((event) => event.properties.path === '/404/')).toBe(true);
  expect(events.slice(0, 2).every((event) => event.pageAction.uri.endsWith('/404/'))).toBe(true);
  expect(events.slice(0, 2).every((event) => !event.pageAction.uri.includes('?'))).toBe(true);
  expect(
    await page.evaluate(() => sessionStorage.getItem('aspire-not-found-destination'))
  ).toBeNull();

  const home = page.locator('[data-funnel-recovery-action="homepage"]');
  await home.evaluate((link) => {
    document.documentElement.lang = 'ja';
    link.setAttribute('href', '/ja');
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  });
  await home.click();
  expect(
    await page.evaluate(() => {
      const marker = sessionStorage.getItem('aspire-not-found-destination');
      return marker ? JSON.parse(marker).destinationPath : null;
    })
  ).toBe('/');
  await page.evaluate(() => {
    document.querySelector('[data-funnel-view]')?.remove();
    history.pushState({}, '', '/ja/');
    document.dispatchEvent(new Event('astro:page-load'));
  });

  events = await readFunnelEvents(page, 'not_found_recovery');
  expect(events.map((event) => event.properties.step)).toEqual([
    'not_found_viewed',
    'recovery_action',
    'recovery_action',
    'valid_destination_loaded',
  ]);
  expect(events.at(-1)?.properties.recoveryAction).toBe('homepage');
});

test('failed initiating steps do not persist continuation markers', async ({ page }) => {
  await page.goto('/this-page-does-not-exist/');
  await dismissCookieConsentIfVisible(page);
  await installTracker(page);

  await page.evaluate(() => {
    sessionStorage.removeItem('aspire-search-destination');
    sessionStorage.removeItem('aspire-not-found-destination');
    window.analytics.trackPageAction = () => {
      throw new Error('Telemetry unavailable');
    };
    document.dispatchEvent(
      new CustomEvent('aspire:funnel-step', {
        detail: {
          funnel: 'search_success',
          step: 'result_selected',
          surface: 'site_search',
          destinationHref: '/get-started/',
        },
      })
    );
  });

  const home = page.locator('[data-funnel-recovery-action="homepage"]');
  await home.evaluate((link) => {
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  });
  await home.click();

  expect(
    await page.evaluate(() => ({
      search: sessionStorage.getItem('aspire-search-destination'),
      notFound: sessionStorage.getItem('aspire-not-found-destination'),
    }))
  ).toEqual({ search: null, notFound: null });
});
