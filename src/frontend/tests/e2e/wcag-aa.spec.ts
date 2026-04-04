import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
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

for (const pagePath of auditedPages) {
  test(`WCAG AA audit passes for ${pagePath}`, async ({ page }) => {
    if (pagePath === '/reference/api/csharp/') {
      test.slow();
    }

    await page.goto(pagePath);
    await dismissCookieConsentIfVisible(page);
    await waitForAccessibilityEnhancements(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .options({
        rules: {
          'color-contrast': { enabled: true },
        },
      })
      .analyze();

    const violations = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    }));

    expect(
      violations,
      violations.length === 0 ? undefined : JSON.stringify(violations, null, 2)
    ).toEqual([]);
  });
}
