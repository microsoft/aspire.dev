import { expect, test } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

const SHOW_CLIENT = process.env.PUBLIC_SHOW_CLIENT_INTEGRATIONS === 'true';

test.describe('integrations gallery', () => {
  test('hides client cards and the hosting/client toggle group by default', async ({ page }) => {
    test.skip(SHOW_CLIENT, 'Client integrations are enabled via PUBLIC_SHOW_CLIENT_INTEGRATIONS');

    await page.goto('/integrations/gallery/');
    await dismissCookieConsentIfVisible(page);

    // Hosting/client toggle group must not render when the flag is off.
    await expect(page.locator('.type-toggle[data-type="hosting"]')).toHaveCount(0);
    await expect(page.locator('.type-toggle[data-type="client"]')).toHaveCount(0);

    // Official/community toggle group is still present.
    await expect(page.locator('.type-toggle[data-type="official"]')).toBeVisible();
    await expect(page.locator('.type-toggle[data-type="community"]')).toBeVisible();

    // No card should be tagged "client" once the data-level filter is applied.
    const clientCards = page.locator('.card-grid .card[data-tags*="client"]');
    await expect(clientCards).toHaveCount(0);

    // A well-known hosting integration must still be present.
    const postgresCard = page.locator('.card[data-title="aspire.hosting.postgresql"]');
    await expect(postgresCard).toBeVisible();
  });

  test('renders an `aspire add` snippet on each card', async ({ page }) => {
    await page.goto('/integrations/gallery/');
    await dismissCookieConsentIfVisible(page);

    const postgresCard = page.locator('.card[data-title="aspire.hosting.postgresql"]');
    await expect(postgresCard).toBeVisible();
    await expect(postgresCard.locator('.install-command')).toContainText('aspire add postgresql');
  });

  test('language buttons link to docs with the aspire-lang query param', async ({ page }) => {
    await page.goto('/integrations/gallery/');
    await dismissCookieConsentIfVisible(page);

    const postgresCard = page.locator('.card[data-title="aspire.hosting.postgresql"]');
    const csharpLink = postgresCard.locator('.lang-button').first();
    const tsLink = postgresCard.locator('.lang-button').nth(1);

    await expect(csharpLink).toHaveAttribute('href', /aspire-lang=csharp/);
    await expect(tsLink).toHaveAttribute('href', /aspire-lang=typescript/);

    // Both links should target the same base docs path — only the lang differs.
    const csharpHref = await csharpLink.getAttribute('href');
    const tsHref = await tsLink.getAttribute('href');
    expect(csharpHref?.split('?')[0]).toBe(tsHref?.split('?')[0]);

    // The destination must be the `-host/` page (where the aspire-lang Tabs
    // live), not the `-get-started/` landing page that the docs map points at.
    expect(csharpHref?.split('?')[0]).toBe('/integrations/databases/postgres/postgres-host/');
  });

  test('clicking the copy button copies the `aspire add` command and shows a copied state', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/integrations/gallery/');
    await dismissCookieConsentIfVisible(page);

    const postgresCard = page.locator('.card[data-title="aspire.hosting.postgresql"]');
    const copyButton = postgresCard.locator('.install-command .copy-button');
    await expect(copyButton).toBeVisible();

    await copyButton.click();

    await expect(copyButton).toHaveAttribute('data-copied', 'true');

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe('aspire add postgresql');

    // The data-copied state must reset after the short timeout.
    await expect.poll(() => copyButton.getAttribute('data-copied')).toBeNull();
  });

  test('clicking the C# button lands on the docs page with the C# tab selected', async ({
    page,
  }) => {
    await page.goto('/integrations/gallery/');
    await dismissCookieConsentIfVisible(page);

    const postgresCard = page.locator('.card[data-title="aspire.hosting.postgresql"]');
    const csharpLink = postgresCard.locator('.lang-button').first();
    const csharpHref = await csharpLink.getAttribute('href');
    expect(csharpHref).toBeTruthy();

    await page.goto(csharpHref!);
    await dismissCookieConsentIfVisible(page);

    const appHostTabs = page.locator('starlight-tabs[data-sync-key="aspire-lang"]').first();
    const csharpTab = appHostTabs.getByRole('tab', { name: 'C#' });
    await expect(csharpTab).toHaveAttribute('aria-selected', 'true');

    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('aspire-lang')))
      .toBe('csharp');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('starlight-synced-tabs__aspire-lang')))
      .toBe('C#');
  });
});

test('PivotSelector aspire-lang selection bridges to synced-tabs storage', async ({ page }) => {
  await page.goto('/get-started/first-app/');
  await dismissCookieConsentIfVisible(page);

  const pivotSelector = page.locator('#pivot-selector-aspire-lang');
  await expect(pivotSelector).toBeVisible();
  const typeScriptButton = pivotSelector.getByRole('button', { name: 'TypeScript' });

  await typeScriptButton.click();

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('aspire-lang')))
    .toBe('typescript');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('starlight-synced-tabs__aspire-lang')))
    .toBe('TypeScript');
});
