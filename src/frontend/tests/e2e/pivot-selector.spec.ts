import { expect, test } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

test('prerequisites apphost tabs default to TypeScript and persist selection', async ({
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

  await expect(appHostTabs.getByRole('tab').first()).toHaveText('TypeScript');
  await expect(typeScriptTab).toHaveAttribute('aria-selected', 'true');
  await expect(csharpTab).toHaveAttribute('aria-selected', 'false');
  await expect(typeScriptContent).toBeVisible();
  await expect(csharpContent).toBeHidden();

  await csharpTab.click();

  await expect(csharpTab).toHaveAttribute('aria-selected', 'true');
  await expect(typeScriptTab).toHaveAttribute('aria-selected', 'false');
  await expect(csharpContent).toBeVisible();
  await expect(typeScriptContent).toBeHidden();

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('starlight-synced-tabs__aspire-lang')))
    .toBe('C#');

  await page.reload();
  await dismissCookieConsentIfVisible(page);

  await expect(csharpTab).toHaveAttribute('aria-selected', 'true');
  await expect(csharpContent).toBeVisible();
  await expect(typeScriptContent).toBeHidden();
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
  const typeScriptPanel = appHostTabs.locator(':scope > [role="tabpanel"]').nth(0);
  const csharpPanel = appHostTabs.locator(':scope > [role="tabpanel"]').nth(1);

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

test('ApiReference chips follow the language selection through every entry point', async ({
  page,
}) => {
  // ApiReference renders both languages and lets CSS pick one from
  // `<html data-apphost-lang>` (see ApiReference.astro), so every writer of
  // that state has to keep the chips in step: the tab strip by pointer and by
  // keyboard, the PivotSelector, the `?aspire-lang=` query string, and the
  // persisted preference. The references on both pages below sit in prose,
  // outside any tab panel or pivot block, so they stay in the DOM no matter
  // which panel is showing.
  const reference = page.locator('.api-reference').first();
  const csharpChip = reference.locator('[data-lang="csharp"]');
  const typeScriptChip = reference.locator('[data-lang="typescript"]');

  // Query string initialization.
  await page.goto('/get-started/resource-mcp-servers/?aspire-lang=csharp');
  await dismissCookieConsentIfVisible(page);

  await expect(csharpChip).toBeVisible();
  await expect(csharpChip).toHaveText('WithMcpServer()');
  await expect(typeScriptChip).toBeHidden();
  await expect(typeScriptChip).toHaveText('withMcpServer()');

  // Pointer: clicking the tab strip.
  const appHostTabs = page.locator('starlight-tabs[data-sync-key="aspire-lang"]').first();
  await appHostTabs.getByRole('tab', { name: 'TypeScript' }).click();

  await expect(typeScriptChip).toBeVisible();
  await expect(csharpChip).toBeHidden();

  // Keyboard: arrowing along the same tab strip.
  await appHostTabs.locator('[role="tab"][aria-selected="true"]').focus();
  await page.keyboard.press('ArrowRight');

  await expect(appHostTabs.getByRole('tab', { name: 'C#' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(csharpChip).toBeVisible();
  await expect(typeScriptChip).toBeHidden();

  // Persisted initialization: the C# choice above was stored, so a fresh load
  // with no query string has to restore it before paint.
  await page.goto('/get-started/resource-mcp-servers/');

  await expect(csharpChip).toBeVisible();
  await expect(typeScriptChip).toBeHidden();

  // PivotSelector. Regression: the pivot wrote the storage keys and the query
  // string but never `<html data-apphost-lang>`, so the chips stayed on the
  // old language until the page was reloaded.
  await page.goto('/get-started/glossary/?aspire-lang=typescript');

  await expect(typeScriptChip).toBeVisible();
  await expect(typeScriptChip).toHaveText('withReference()');

  await page.locator('#pivot-selector-aspire-lang').getByRole('button', { name: 'C#' }).click();

  await expect(page).toHaveURL(/\?aspire-lang=csharp$/);
  await expect(csharpChip).toBeVisible();
  await expect(csharpChip).toHaveText('WithReference()');
  await expect(typeScriptChip).toBeHidden();
});
