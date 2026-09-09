import { expect, test } from '@playwright/test';
import appHostLanguageConfig from '../../src/data/apphost-languages.json' with { type: 'json' };
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

test('configured languages follow the registry while unknown values preserve saved preferences', async ({
  page,
}) => {
  const python = appHostLanguageConfig.languages.find(
    (language) => language.id === 'python'
  )!;
  await page.goto('/get-started/prerequisites/?aspire-lang=python');
  await dismissCookieConsentIfVisible(page);

  const appHostTabs = page.locator('starlight-tabs[data-sync-key="aspire-lang"]').first();
  if (python.enabled) {
    await expect(page).toHaveURL(/\?aspire-lang=python$/);
    await expect(
      appHostTabs.getByRole('tab').filter({ hasText: /^Python$/ })
    ).toHaveAttribute('aria-selected', 'true');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('aspire-lang')))
      .toBe('python');
  } else {
    await expect(page).toHaveURL(/\?aspire-lang=typescript$/);
    await expect(appHostTabs.getByRole('tab', { name: 'TypeScript' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('aspire-lang')))
      .toBe('typescript');
  }

  await page.evaluate(() => {
    localStorage.setItem('aspire-lang', 'csharp');
    localStorage.setItem('starlight-synced-tabs__aspire-lang', 'C#');
  });
  await page.goto('/get-started/prerequisites/?aspire-lang=javascript');
  await dismissCookieConsentIfVisible(page);

  await expect(page).toHaveURL(/\?aspire-lang=javascript$/);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.apphostLang))
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

test('AppHost page restores the shared AppHost language query string', async ({ page }) => {
  await page.goto('/get-started/app-host/?aspire-lang=csharp');
  await dismissCookieConsentIfVisible(page);

  const pivotSelector = page.locator('#pivot-selector-aspire-lang');
  const csharpButton = pivotSelector.getByRole('button', { name: 'C#' });
  const typeScriptButton = pivotSelector.getByRole('button', { name: 'TypeScript' });
  const csharpContent = page.getByText(
    'A C# AppHost can be a single apphost.cs file or a project-based AppHost',
    {
      exact: false,
    }
  );
  const typeScriptContent = page.getByText(
    'A TypeScript AppHost uses apphost.mts, Node.js, and a generated SDK',
    {
      exact: false,
    }
  );

  await expect
    .poll(() => new URL(page.url()).searchParams.get('aspire-lang'))
    .toBe('csharp');
  await expect(csharpButton).toHaveClass(/active/);
  await expect(csharpContent).toBeVisible();
  await expect(typeScriptContent).toBeHidden();

  await typeScriptButton.click();

  await expect
    .poll(() => new URL(page.url()).searchParams.get('aspire-lang'))
    .toBe('typescript');
  await expect(typeScriptButton).toHaveClass(/active/);
  await expect(csharpButton).not.toHaveClass(/active/);
  await expect(typeScriptContent).toBeVisible();
  await expect(csharpContent).toBeHidden();
});

test('AppHost language pivots and media follow the registry bits', async ({
  page,
}) => {
  await page.goto('/get-started/first-app/');
  await dismissCookieConsentIfVisible(page);

  for (const language of appHostLanguageConfig.languages) {
    const pivot = page.locator(`[data-pivot-block="${language.id}"]`);
    const cast = page.locator(
      `.asciinema-player-container[data-src="/casts/apphost-${language.id}.cast"]`
    );
    if (language.enabled) {
      await expect(pivot.first()).toBeAttached();
      await expect(cast).toHaveCount(1);
    } else {
      await expect(pivot).toHaveCount(0);
      await expect(cast).toHaveCount(0);
    }
  }
});
