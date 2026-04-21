import { expect, test } from '@playwright/test';

import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

test('app host builder swaps visible code when toggles and language change', async ({ page }) => {
  await page.goto('/');
  await dismissCookieConsentIfVisible(page);

  const builder = page
    .locator('.container')
    .filter({ has: page.locator('.lang-toggle[data-lang="typescript"]') })
    .first();

  const csharpGroup = builder.locator('.code-lang-group[data-code-lang="csharp"]');
  const typeScriptGroup = builder.locator('.code-lang-group[data-code-lang="typescript"]');

  await expect(csharpGroup).toBeVisible();
  await expect(csharpGroup).toContainText('AddViteApp("frontend"');

  await builder.locator('.toggle[data-toggle="database"]').click();
  await expect(csharpGroup).toContainText('AddPostgres("db")');

  await builder.locator('.lang-toggle[data-lang="typescript"]').click();

  await expect(typeScriptGroup).toBeVisible();
  await expect(csharpGroup).toBeHidden();
  await expect(typeScriptGroup).toContainText('.addPostgres("db")');
});

test('accessible code enhancements label code regions and remove disabled copy buttons', async ({
  page,
}) => {
  await page.goto('/get-started/install-cli/');
  await dismissCookieConsentIfVisible(page);

  const labelledRegion = page.locator('pre[aria-label]:visible').first();
  const copyButton = page.locator('figure.frame .copy button:visible').first();

  await expect(labelledRegion).toBeVisible();
  await expect(labelledRegion).toHaveAttribute('aria-label', /install/i);
  await expect(copyButton).toHaveAttribute('aria-label', /(copy|copied)/i);

  await page.goto('/');
  await dismissCookieConsentIfVisible(page);

  await expect(page.locator('.code-display[data-disable-copy] .copy')).toHaveCount(0);
});

test('testimonial carousel advances cards and enables the previous control', async ({ page }) => {
  await page.goto('/');
  await dismissCookieConsentIfVisible(page);

  const track = page.locator('.testimonial-carousel [data-track]');
  const prevButton = page.locator('.testimonial-carousel .prev-btn');
  const nextButton = page.locator('.testimonial-carousel .next-btn');

  const initialScrollLeft = await track.evaluate((element) => Math.round(element.scrollLeft));
  if (await nextButton.isDisabled()) {
    await expect(prevButton).toBeDisabled();
    await expect(nextButton).toBeDisabled();
  } else {
    await nextButton.click();

    await expect(prevButton).toBeEnabled();
    await expect
      .poll(async () => track.evaluate((element) => Math.round(element.scrollLeft)))
      .toBeGreaterThan(initialScrollLeft);
  }
});

test('os aware tabs default first-time Windows visitors to PowerShell', async ({ browser }) => {
  const context = await browser.newContext();

  await context.addInitScript(() => {
    localStorage.clear();

    Object.defineProperty(Navigator.prototype, 'userAgentData', {
      configurable: true,
      get() {
        return { platform: 'Windows' };
      },
    });

    Object.defineProperty(Navigator.prototype, 'platform', {
      configurable: true,
      get() {
        return 'Win32';
      },
    });

    Object.defineProperty(Navigator.prototype, 'userAgent', {
      configurable: true,
      get() {
        return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
      },
    });
  });

  const page = await context.newPage();

  try {
    await page.goto('/get-started/install-cli/');
    await dismissCookieConsentIfVisible(page);

    const terminalTabs = page.locator('starlight-tabs[data-sync-key="terminal"]').first();
    const powerShellTab = terminalTabs.getByRole('tab', { name: 'PowerShell' });

    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('starlight-synced-tabs__terminal')))
      .toBe('PowerShell');
    await expect(powerShellTab).toHaveAttribute('aria-selected', 'true');
  } finally {
    await context.close();
  }
});
