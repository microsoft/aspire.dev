import { expect, test, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';
import languageConfig from '../../src/data/apphost-languages.json' with { type: 'json' };

const enabledLanguages = languageConfig.languages.filter(({ enabled }) => enabled);
type Language = (typeof enabledLanguages)[number];

function languageAccessibleName(language: Language) {
  const label = language.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${label}${language.experimental ? '(?:\\s*Experimental)?' : ''}$`, 'i');
}

async function expectDiagnosticsLanguage(page: Page, language: Language) {
  const groups = page.locator('[data-apphost-tabs]');
  await expect(groups.first()).toBeVisible();
  for (const group of await groups.all()) {
    const supportedIds = await group.evaluate((element) =>
      element
        .getAttributeNames()
        .filter((name) => name.startsWith('data-supports-'))
        .map((name) => name.slice('data-supports-'.length))
    );
    const supported = enabledLanguages.filter(({ id }) => supportedIds.includes(id));
    await expect(group.getByRole('tab', { includeHidden: true })).toHaveText(
      supported.map(({ label }) => label)
    );
    if (!supportedIds.includes(language.id)) {
      await expect(group.locator('.apphost-tabs__tabs')).toBeHidden();
      await expect(group.locator(`[data-apphost-limitation="${language.id}"]`)).toBeVisible();
      await expect(group.getByRole('tabpanel')).toHaveCount(0);
      continue;
    }
    for (const candidate of supported) {
      await expect(
        group.getByRole('tab', { name: languageAccessibleName(candidate) })
      ).toHaveAttribute('aria-selected', String(candidate.id === language.id));
    }
    await expect(group.getByRole('tabpanel')).toHaveCount(1);
    await expect(
      group.getByRole('tabpanel', { name: languageAccessibleName(language) })
    ).toBeVisible();
  }
}

const typescript = enabledLanguages.find(({ id }) => id === 'typescript')!;
const csharp = enabledLanguages.find(({ id }) => id === 'csharp')!;

test('diagnostics render typed AppHost examples and file-based suppression guidance', async ({
  page,
}) => {
  await page.goto('/diagnostics/aspire006/?aspire-lang=typescript');
  await dismissCookieConsentIfVisible(page);
  await expectDiagnosticsLanguage(page, typescript);
  const panel = page
    .locator('starlight-tabs[data-sync-key="aspire-lang"]')
    .getByRole('tabpanel', { name: typescript.label, exact: true });
  const hover = panel.locator('.twoslash-hover').first();
  await hover.hover();
  await expect(panel.getByRole('tooltip')).toBeVisible();
  await expect(panel.getByRole('tooltip')).toContainText('createBuilder');

  await page.goto('/diagnostics/overview/#suppress-in-a-file-based-apphost');
  await expect(
    page.getByRole('heading', { name: 'Suppress in a file-based AppHost', exact: true })
  ).toBeVisible();
  await expect(
    page.locator('pre').filter({ hasText: '#:property NoWarn=$(NoWarn);ASPIREE000' })
  ).toBeVisible();
});

test('diagnostics ignore an invalid aspire-lang query and restore the saved language', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('aspire-lang', 'csharp');
    localStorage.setItem('starlight-synced-tabs__aspire-lang', 'C#');
  });
  await page.goto('/diagnostics/aspireprobes001/?aspire-lang=unknown');
  await dismissCookieConsentIfVisible(page);
  await expectDiagnosticsLanguage(page, csharp);
});

test('diagnostics AppHost tabs default to TypeScript and synchronize keyboard selection', async ({
  page,
}) => {
  await page.goto('/diagnostics/aspireprobes001/');
  await dismissCookieConsentIfVisible(page);
  const groups = page.locator('starlight-tabs[data-sync-key="aspire-lang"]');
  expect(await groups.count()).toBeGreaterThan(1);
  await expectDiagnosticsLanguage(page, typescript);

  await groups.first().getByRole('tab', { name: typescript.label, exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expectDiagnosticsLanguage(page, csharp);
  await expect(page).toHaveURL(/aspire-lang=csharp/);
});

for (const language of languageConfig.languages.filter(({ enabled }) => !enabled)) {
  test(`diagnostics do not expose disabled ${language.label} examples`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aspire-lang', 'csharp');
      localStorage.setItem('starlight-synced-tabs__aspire-lang', 'C#');
    });
    await page.goto(`/diagnostics/aspireprobes001/?aspire-lang=${language.id}`);
    await dismissCookieConsentIfVisible(page);
    await expectDiagnosticsLanguage(page, typescript);
    await expect(page).toHaveURL(/aspire-lang=typescript/);
    await expect(page.getByRole('tab', { name: language.label, exact: true })).toHaveCount(0);
  });
}

for (const language of enabledLanguages) {
  const { id: value, label } = language;
  const opposite = enabledLanguages.find(({ id }) => id !== value)!;
  test(`diagnostics URL selects ${label} over the saved preference`, async ({ page }) => {
    await page.addInitScript(({ id, label }) => {
      localStorage.setItem('aspire-lang', id);
      localStorage.setItem('starlight-synced-tabs__aspire-lang', label);
    }, opposite);

    await page.goto(`/diagnostics/aspireprobes001/?aspire-lang=${value}`);
    await dismissCookieConsentIfVisible(page);
    await expectDiagnosticsLanguage(page, language);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('aspire-lang'))).toBe(value);
    await page.reload();
    await expectDiagnosticsLanguage(page, language);
  });

  test(`diagnostics persist ${label} across pages and reloads`, async ({ page }) => {
    await page.goto(`/diagnostics/aspirepostgres001/?aspire-lang=${opposite.id}`);
    await dismissCookieConsentIfVisible(page);
    const tab = page
      .locator('starlight-tabs[data-sync-key="aspire-lang"]')
      .first()
      .getByRole('tab', { name: languageAccessibleName(language) });
    if (await tab.count()) {
      await tab.click();
    } else {
      await page.goto(`/diagnostics/aspirepostgres001/?aspire-lang=${value}`);
    }
    await expectDiagnosticsLanguage(page, language);
    await expect(page).toHaveURL(new RegExp(`aspire-lang=${value}`));
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('starlight-synced-tabs__aspire-lang')))
      .toBe(label);

    await page
      .locator('a[href="/diagnostics/overview/#suppress-in-a-file-based-apphost"]')
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Suppress in a file-based AppHost', exact: true })
    ).toBeVisible();
    // Navigate without a query to exercise persistence independently of link rewriting.
    await page.goto('/diagnostics/aspireprobes001/');
    await expect(page).toHaveURL(/\/diagnostics\/aspireprobes001\//);
    await expectDiagnosticsLanguage(page, language);
    await page.reload();
    await expectDiagnosticsLanguage(page, language);
  });
}
