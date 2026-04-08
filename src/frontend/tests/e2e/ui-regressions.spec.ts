import { expect, test, type Page } from '@playwright/test';
import {
  dismissCookieConsentIfVisible,
  isNarrowViewport,
  openCookiePreferences,
  resetCookieConsentState,
  waitForApiSidebarReady,
  waitForAnalyticsConsent,
  waitForConsentCategories,
  waitForConsentRecorded,
  waitForTopicSidebarReady,
} from '@tests/e2e/helpers';

const isSiteTourEnabled = process.env.PUBLIC_ENABLE_SITE_TOUR === 'true';

async function hasCollapsedSidebar(page: Page): Promise<boolean | null> {
  try {
    return await page.evaluate(() =>
      document.documentElement.hasAttribute('data-sidebar-collapsed')
    );
  } catch {
    return null;
  }
}

async function readSidebarCollapsedPreference(page: Page): Promise<string | null> {
  try {
    return await page.evaluate(() => localStorage.getItem('api-sidebar-collapsed'));
  } catch {
    return null;
  }
}

async function hasTopicSidebarCollapsed(page: Page): Promise<boolean | null> {
  try {
    return await page.evaluate(() =>
      document.documentElement.hasAttribute('data-topic-sidebar-collapsed')
    );
  } catch {
    return null;
  }
}

async function readTopicSidebarCollapsedPreference(page: Page): Promise<string | null> {
  try {
    return await page.evaluate(() => localStorage.getItem('topic-sidebar-collapsed'));
  } catch {
    return null;
  }
}

test('install CLI entry adapts to viewport and remembers the selected channel', async ({
  page,
}) => {
  if (isNarrowViewport(page)) {
    await page.goto('/get-started/install-cli/');
    await dismissCookieConsentIfVisible(page);
    await expect(page).toHaveURL(/\/get-started\/install-cli\/?$/);
    await expect(page.getByRole('heading', { name: /install aspire cli/i })).toBeVisible();
    return;
  }

  await page.goto('/');
  await dismissCookieConsentIfVisible(page);

  const openInstallButton = page.locator('[data-open-install-modal]:visible').first();
  await expect(openInstallButton).toBeVisible();

  await openInstallButton.click();

  const installModal = page.locator('#install-cli-modal');
  const versionSelect = installModal.locator('#version-select');

  await expect(installModal).toBeVisible();
  await versionSelect.selectOption('dev');

  await expect(versionSelect).toHaveValue('dev');
  await expect(installModal.locator('.quality-aside[data-quality="dev"]')).toBeVisible();
  await expect(installModal.locator('.code-wrapper[data-version="dev"]').first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('aspire-install-channel')))
    .toBe('dev');

  await installModal.getByRole('button', { name: /close modal/i }).click();
  await expect(installModal).not.toBeVisible();

  await openInstallButton.click();
  await expect(versionSelect).toHaveValue('dev');
});

test('homepage header actions stay reachable at zoomed and reflow widths', async ({ page }) => {
  test.skip(
    page.viewportSize()?.width !== 1440,
    'This regression is covered once from the desktop project with explicit narrow widths.'
  );

  const expectedCompactHeaderOrder = [
    'Aspire',
    'Search',
    'Open cookie preferences dialog',
    'Open install Aspire CLI dialog',
    'Docs',
    'Try',
  ];

  if (isSiteTourEnabled) {
    expectedCompactHeaderOrder.splice(2, 0, 'Start site tour');
  }

  for (const width of [640, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await resetCookieConsentState(page);
    await page.goto('/');
    await dismissCookieConsentIfVisible(page);

    const banner = page.getByRole('banner');

    await expect
      .poll(() =>
        banner.evaluate((header) =>
          Array.from(header.querySelectorAll('a, button'))
            .filter((element) => {
              if (!(element instanceof HTMLElement)) {
                return false;
              }

              const style = window.getComputedStyle(element);
              if (style.display === 'none' || style.visibility === 'hidden') {
                return false;
              }

              const rect = element.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            })
            .map((element) => {
              if (!(element instanceof HTMLElement)) {
                return '';
              }

              if (element.matches('.site-title')) {
                return 'Aspire';
              }

              if (element.matches('button[data-open-modal]')) {
                return 'Search';
              }

              const tourTarget = element.dataset.tourTarget;
              if (tourTarget === 'tour-help') {
                return 'Start site tour';
              }

              if (tourTarget === 'cookie-preferences') {
                return 'Open cookie preferences dialog';
              }

              if (tourTarget === 'install-cli') {
                return 'Open install Aspire CLI dialog';
              }

              if (element instanceof HTMLAnchorElement) {
                if (element.pathname.endsWith('/docs/')) {
                  return 'Docs';
                }

                if (element.pathname.endsWith('/get-started/first-app/')) {
                  return 'Try';
                }
              }

              return element.getAttribute('aria-label')?.trim() || element.textContent?.trim() || '';
            })
        )
      )
      .toEqual(expectedCompactHeaderOrder);

    await expect
      .poll(() => page.locator('main').evaluate((element) => element.getBoundingClientRect().top))
      .toBeLessThan(170);

    await expect(banner.getByRole('link', { name: 'Aspire', exact: true })).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Search' })).toBeVisible();
    await expect(banner.getByRole('link', { name: 'Docs', exact: true })).toBeVisible();
    await expect(banner.getByRole('link', { name: /^Try$/ })).toBeVisible();

    if (!isSiteTourEnabled) {
      await expect(banner.locator('[data-tour-trigger]')).toHaveCount(0);
    }

    await expect(
      banner.getByRole('button', { name: /open cookie preferences dialog/i }).first()
    ).toBeVisible();

    const installButton = banner.getByRole('button', {
      name: /open install aspire cli dialog/i,
    }).first();
    await expect(installButton).toBeVisible();
    await installButton.click();

    if (isNarrowViewport(page)) {
      await expect(page).toHaveURL(/\/get-started\/install-cli\/?$/);
      await expect(page.getByRole('heading', { name: /install aspire cli/i })).toBeVisible();
      continue;
    }

    const installModal = page.locator('#install-cli-modal').first();
    await expect(installModal).toBeVisible();
    await installModal.getByRole('button', { name: /close modal/i }).click();
    await expect(installModal).not.toBeVisible();
  }
});

test('cookie consent reject-all keeps analytics disabled', async ({ page }) => {
  await resetCookieConsentState(page);
  await page.goto('/get-started/prerequisites/');
  await openCookiePreferences(page);

  await page.getByRole('button', { name: /reject all/i }).last().click();
  await waitForConsentRecorded(page);
  await waitForAnalyticsConsent(page, false);
  await waitForConsentCategories(page, ['necessary']);
});

test('cookie preferences and accept-all enable analytics tracking consent', async ({ page }) => {
  await resetCookieConsentState(page);
  await page.goto('/get-started/prerequisites/');
  await openCookiePreferences(page);

  await page
    .getByRole('button', { name: /accept all/i })
    .last()
    .click();

  await waitForConsentRecorded(page);
  await waitForAnalyticsConsent(page, true);
  await waitForConsentCategories(page, ['necessary', 'analytics', 'advertising']);
});

test('footer preferences persist theme and keyboard style selections', async ({ page }) => {
  await page.goto('/get-started/aspire-vscode-extension/');
  await dismissCookieConsentIfVisible(page);

  const themeSelect = page.locator('#footer-theme-select');
  const kbdSelect = page.locator('#footer-kbd-select');

  await themeSelect.selectOption('dark');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('starlight-theme')))
    .toBe('dark');

  await themeSelect.selectOption('light');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe('light');

  await kbdSelect.selectOption('mac');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sl-kbd-type'))).toBe('mac');
  await expect(page.locator('[data-sl-kbd-type="mac"][data-sl-kbd-active]').first()).toBeVisible();
  await expect(page.locator('[data-sl-kbd-type="windows"][data-sl-kbd-active]')).toHaveCount(0);

  await page.reload();

  await expect(themeSelect).toHaveValue('light');
  await expect(kbdSelect).toHaveValue('mac');
});

test('terminal tabs stay synced between pages', async ({ page }) => {
  await page.goto('/dashboard/overview/');
  await dismissCookieConsentIfVisible(page);

  const sourceTabs = page.locator('starlight-tabs[data-sync-key="terminal"]').first();
  const bashTab = sourceTabs.getByRole('tab', { name: 'Bash' });
  const powerShellTab = sourceTabs.getByRole('tab', { name: 'PowerShell' });

  await powerShellTab.click();
  await expect(powerShellTab).toHaveAttribute('aria-selected', 'true');
  await expect(bashTab).toHaveAttribute('aria-selected', 'false');

  await bashTab.click();
  await expect(bashTab).toHaveAttribute('aria-selected', 'true');
  await expect(powerShellTab).toHaveAttribute('aria-selected', 'false');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('starlight-synced-tabs__terminal')))
    .toBe('Bash');

  await page.goto('/reference/cli/microsoft-collected-cli-telemetry/');

  const destinationTabs = page.locator('starlight-tabs[data-sync-key="terminal"]').first();
  await expect(destinationTabs.getByRole('tab', { name: 'Bash' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(destinationTabs.getByRole('tab', { name: 'PowerShell' })).toHaveAttribute(
    'aria-selected',
    'false'
  );
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('starlight-synced-tabs__terminal')))
    .toBe('Bash');
});

test('API sidebar collapse state persists across reloads', async ({ page }) => {
  test.slow();

  const viewport = page.viewportSize();
  test.skip(
    !viewport || viewport.width < 1152,
    'Sidebar collapse is only available on wide desktop layouts.'
  );

  await page.goto('/reference/api/csharp/');
  await dismissCookieConsentIfVisible(page);
  await waitForApiSidebarReady(page);

  const collapseButton = page.locator('#sidebar-collapse-btn');
  const expandButton = page.locator('#sidebar-expand-btn');

  await collapseButton.click();

  await expect.poll(() => hasCollapsedSidebar(page)).toBe(true);
  await expect.poll(() => readSidebarCollapsedPreference(page)).toBe('1');
  await expect(expandButton).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForApiSidebarReady(page);

  await expect.poll(() => hasCollapsedSidebar(page)).toBe(true);
  await expect.poll(() => readSidebarCollapsedPreference(page)).toBe('1');
  await expect(page.locator('#sidebar-expand-btn')).toBeVisible();

  await page.locator('#sidebar-expand-btn').click();

  await expect.poll(() => hasCollapsedSidebar(page)).toBe(false);
  await expect.poll(() => readSidebarCollapsedPreference(page)).toBe('0');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForApiSidebarReady(page);

  await expect.poll(() => hasCollapsedSidebar(page)).toBe(false);
  await expect.poll(() => readSidebarCollapsedPreference(page)).toBe('0');
});

test('API sidebar filter empty state and topic dropdown controls respond correctly', async ({
  page,
}) => {
  test.slow();

  const viewport = page.viewportSize();
  test.skip(
    !viewport || viewport.width < 1152,
    'Sidebar custom controls are only available on wide desktop layouts.'
  );

  await page.goto('/reference/api/csharp/');
  await dismissCookieConsentIfVisible(page);
  await waitForApiSidebarReady(page);

  const filterInput = page.locator('#sidebar-filter-input');
  const clearButton = page.locator('#sidebar-filter-clear');
  const emptyState = page.locator('#sidebar-filter-empty');
  const emptyCopy = page.locator('#sidebar-filter-empty-copy');
  const emptyAction = page.locator('#sidebar-filter-empty-action');
  const topicTrigger = page.locator('#topic-sidebar-trigger');
  const topicPanel = page.locator('.topic-selector-dropdown [data-dropdown-panel]');

  await topicTrigger.click();
  await expect(topicTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(topicPanel).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(topicTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(topicPanel).toBeHidden();

  await filterInput.fill('zzzz-sidebar-no-match');

  await expect(clearButton).toBeVisible();
  await expect(emptyState).toBeVisible();
  await expect(emptyCopy).toContainText('zzzz-sidebar-no-match');

  await emptyAction.click();

  await expect(filterInput).toHaveValue('');
  await expect(clearButton).toBeHidden();
  await expect(emptyState).toBeHidden();
});

test('topic sidebar custom controls persist collapse state and filter reset on reload', async ({
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(
    !viewport || viewport.width < 1152,
    'Sidebar custom controls are only available on wide desktop layouts.'
  );

  await page.goto('/app-host/certificate-configuration/');
  await dismissCookieConsentIfVisible(page);
  await waitForTopicSidebarReady(page);

  const filterInput = page.locator('#sidebar-filter-input');
  const clearButton = page.locator('#sidebar-filter-clear');
  const emptyState = page.locator('#sidebar-filter-empty');
  const collapseButton = page.locator('#topic-sidebar-collapse-btn');
  const expandButton = page.locator('#topic-sidebar-expand-btn');
  const topicTrigger = page.locator('#topic-sidebar-trigger');
  const topicPanel = page.locator('.topic-selector-dropdown [data-dropdown-panel]');

  await topicTrigger.click();
  await expect(topicTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(topicPanel).toBeVisible();

  await page.locator('main').click();
  await expect(topicTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(topicPanel).toBeHidden();

  await filterInput.fill('zzzz-topic-no-match');
  await expect(clearButton).toBeVisible();
  await expect(emptyState).toBeVisible();

  await collapseButton.click();

  await expect.poll(() => hasTopicSidebarCollapsed(page)).toBe(true);
  await expect.poll(() => readTopicSidebarCollapsedPreference(page)).toBe('1');
  await expect(expandButton).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForTopicSidebarReady(page);

  await expect.poll(() => hasTopicSidebarCollapsed(page)).toBe(true);
  await expect.poll(() => readTopicSidebarCollapsedPreference(page)).toBe('1');
  await expect(page.locator('#sidebar-filter-input')).toHaveValue('');
  await expect(page.locator('#sidebar-filter-clear')).toBeHidden();
  await expect(page.locator('#sidebar-filter-empty')).toBeHidden();

  await page.locator('#topic-sidebar-expand-btn').click();

  await expect.poll(() => hasTopicSidebarCollapsed(page)).toBe(false);
  await expect.poll(() => readTopicSidebarCollapsedPreference(page)).toBe('0');
});
