import { expect, test } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

test('prerequisites apphost tabs switch visible content and persist selection', async ({
  page,
}) => {
  await page.goto('/get-started/prerequisites/');
  await dismissCookieConsentIfVisible(page);

  const appHostTabs = page.locator('starlight-tabs[data-sync-key="aspire-lang"]').first();
  const csharpTab = appHostTabs.getByRole('tab', { name: 'C#' });
  const typeScriptTab = appHostTabs.getByRole('tab', { name: 'TypeScript' });
  const csharpContent = page.getByText('The .NET 10.0 SDK is required for C# AppHosts', {
    exact: false,
  });
  const typeScriptContent = page.getByRole('link', { name: 'Node.js installation instructions' });

  await expect(csharpTab).toHaveAttribute('aria-selected', 'true');
  await expect(csharpContent).toBeVisible();
  await expect(typeScriptContent).toBeHidden();

  await typeScriptTab.click();

  await expect(typeScriptTab).toHaveAttribute('aria-selected', 'true');
  await expect(csharpTab).toHaveAttribute('aria-selected', 'false');
  await expect(typeScriptContent).toBeVisible();
  await expect(csharpContent).toBeHidden();

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('starlight-synced-tabs__aspire-lang')))
    .toBe('TypeScript');

  await page.reload();
  await dismissCookieConsentIfVisible(page);

  await expect(typeScriptTab).toHaveAttribute('aria-selected', 'true');
  await expect(typeScriptContent).toBeVisible();
  await expect(csharpContent).toBeHidden();
});

test('apphost tabs restore and sync the aspire-lang query string', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('aspire-lang', 'csharp');
    localStorage.setItem('starlight-synced-tabs__aspire-lang', 'C#');
  });

  await page.goto('/get-started/prerequisites/?aspire-lang=typescript');
  await dismissCookieConsentIfVisible(page);

  const appHostTabs = page.locator('starlight-tabs[data-sync-key="aspire-lang"]').first();
  const csharpTab = appHostTabs.getByRole('tab', { name: 'C#' });
  const typeScriptTab = appHostTabs.getByRole('tab', { name: 'TypeScript' });
  const csharpContent = page.getByText('The .NET 10.0 SDK is required for C# AppHosts', {
    exact: false,
  });
  const typeScriptContent = page.getByRole('link', { name: 'Node.js installation instructions' });

  await expect(page).toHaveURL(/\?aspire-lang=typescript$/);
  await expect(typeScriptTab).toHaveAttribute('aria-selected', 'true');
  await expect(csharpTab).toHaveAttribute('aria-selected', 'false');
  await expect(typeScriptContent).toBeVisible();
  await expect(csharpContent).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('aspire-lang')))
    .toBe('typescript');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('starlight-synced-tabs__aspire-lang')))
    .toBe('TypeScript');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.apphostLang))
    .toBe('typescript');

  await csharpTab.click();

  await expect(page).toHaveURL(/\?aspire-lang=csharp$/);
  await expect(csharpTab).toHaveAttribute('aria-selected', 'true');
  await expect(typeScriptTab).toHaveAttribute('aria-selected', 'false');
  await expect(csharpContent).toBeVisible();
  await expect(typeScriptContent).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('aspire-lang')))
    .toBe('csharp');
});

test('postgres apphost tabs use the shared aspire-lang query string', async ({ page }) => {
  await page.goto('/integrations/databases/postgres/postgres-host/?aspire-lang=typescript');
  await dismissCookieConsentIfVisible(page);

  const appHostTabs = page.locator('starlight-tabs[data-sync-key="aspire-lang"]').first();
  const csharpTab = appHostTabs.getByRole('tab', { name: 'C#' });
  const typeScriptTab = appHostTabs.getByRole('tab', { name: 'TypeScript' });
  const csharpPanel = appHostTabs.locator(':scope > [role="tabpanel"]').nth(0);
  const typeScriptPanel = appHostTabs.locator(':scope > [role="tabpanel"]').nth(1);

  await expect(typeScriptTab).toHaveAttribute('aria-selected', 'true');
  await expect(csharpTab).toHaveAttribute('aria-selected', 'false');
  await expect(typeScriptPanel).toBeVisible();
  await expect(csharpPanel).toBeHidden();
});

test('app host page restores pivot state from the lang query string', async ({ page }) => {
  await page.goto('/get-started/app-host/?lang=nodejs');
  await dismissCookieConsentIfVisible(page);

  const pivotSelector = page.locator('#pivot-selector-lang');
  const nodeJsButton = pivotSelector.getByRole('button', { name: 'Node.js' });
  const javaButton = pivotSelector.getByRole('button', { name: 'Java' });
  const nodeJsContent = page.getByText(
    'This architecture demonstrates a Node.js API connecting to a PostgreSQL database',
    {
      exact: false,
    }
  );
  const csharpContent = page.getByText(
    'This architecture demonstrates a .NET API connecting to a PostgreSQL database',
    {
      exact: false,
    }
  );
  const javaContent = page.getByText(
    'This architecture demonstrates a Java API (using Spring Boot) connecting to a PostgreSQL database',
    {
      exact: false,
    }
  );

  await expect(page).toHaveURL(/\?lang=nodejs$/);
  await expect(nodeJsButton).toHaveClass(/active/);
  await expect(nodeJsContent).toBeVisible();
  await expect(csharpContent).toBeHidden();

  await javaButton.click();

  await expect(page).toHaveURL(/\?lang=java$/);
  await expect(javaButton).toHaveClass(/active/);
  await expect(nodeJsButton).not.toHaveClass(/active/);
  await expect(javaContent).toBeVisible();
  await expect(nodeJsContent).toBeHidden();
});
