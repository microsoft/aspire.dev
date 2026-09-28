import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  dismissCookieConsentIfVisible,
  waitForAccessibilityEnhancements,
} from '@tests/e2e/helpers';

const auditedPages = [
  '/',
  '/get-started/install-cli/',
  '/get-started/aspire-vscode-extension/',
  '/reference/api/csharp/',
];

async function findWcagAaViolations(page: Page, disabledRules: string[] = []) {
  const builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .options({
      rules: {
        'color-contrast': { enabled: true },
      },
    });

  if (disabledRules.length > 0) {
    builder.disableRules(disabledRules);
  }

  const results = await builder.analyze();

  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.target.join(' ')),
  }));
}

for (const pagePath of auditedPages) {
  test(`WCAG AA audit passes for ${pagePath}`, async ({ page }) => {
    if (pagePath === '/reference/api/csharp/') {
      test.slow();
    }

    await page.goto(pagePath);
    await dismissCookieConsentIfVisible(page);
    await waitForAccessibilityEnhancements(page);

    const violations = await findWcagAaViolations(page);

    expect(
      violations,
      violations.length === 0 ? undefined : JSON.stringify(violations, null, 2)
    ).toEqual([]);
  });
}

test('Aspire 13.5 mobile reading experience passes WCAG AA in both themes', async ({ page }) => {
  test.skip(
    page.viewportSize()?.width !== 1440,
    'The themed mobile audit is covered once from the desktop project.'
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/whats-new/aspire-13-5/');
  await dismissCookieConsentIfVisible(page);

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => localStorage.setItem('starlight-theme', value), theme);
    await page.reload();
    await dismissCookieConsentIfVisible(page);
    await waitForAccessibilityEnhancements(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    // This release page already contains repeated contributor image text and
    // identically named complementary landmarks. Keep this audit focused on
    // the responsive reading and theme treatment rather than those structures.
    const violations = await findWcagAaViolations(page, [
      'image-redundant-alt',
      'landmark-unique',
    ]);
    expect(
      violations,
      violations.length === 0 ? undefined : `${theme}: ${JSON.stringify(violations, null, 2)}`
    ).toEqual([]);
  }
});
