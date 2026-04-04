import { expect, test, type Page } from '@playwright/test';
import {
  dismissCookieConsentIfVisible,
  isNarrowViewport,
  waitForApiSidebarReady,
  waitForAnalyticsConsent,
  waitForConsentCategories,
  waitForConsentRecorded,
} from '@tests/e2e/helpers';

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

test('cookie consent reject-all keeps analytics disabled', async ({ page }) => {
  await page.goto('/get-started/prerequisites/');
  await expect(page).toHaveURL(/\/get-started\/prerequisites\/\?apphost=csharp$/);

  const rejectAllButton = page.getByRole('button', { name: /reject all/i });
  await expect(rejectAllButton).toBeVisible();

  await rejectAllButton.click();
  await waitForConsentRecorded(page);
  await waitForAnalyticsConsent(page, false);
  await waitForConsentCategories(page, ['necessary']);
});

test('cookie preferences and accept-all enable analytics tracking consent', async ({ page }) => {
  await page.goto('/get-started/prerequisites/');
  await expect(page).toHaveURL(/\/get-started\/prerequisites\/\?apphost=csharp$/);

  const openPreferencesButton = page.getByRole('button', { name: /manage preferences/i });
  await expect(openPreferencesButton).toBeVisible();

  await openPreferencesButton.click();
  await expect(page.locator('#pm__title')).toBeVisible();

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
