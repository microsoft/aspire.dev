import { expect, test } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

const SHOW_CLIENT = process.env.PUBLIC_SHOW_CLIENT_INTEGRATIONS === 'true';

// On tablet viewports, the gallery's two-column EC code blocks can stack
// above the fixed-position cookie banner once Playwright scrolls the
// "Reject all" button into view — clicks then time out because a `<code>`
// element from a card intercepts pointer events.  Sidestep the whole
// banner by pre-seeding a "Reject all"-equivalent `cc_cookie` before the
// first navigation; vanilla-cookieconsent reads this on init and never
// renders the modal.
test.beforeEach(async ({ context, baseURL }) => {
  // Pre-seed a "Reject all"-equivalent cc_cookie so vanilla-cookieconsent
  // skips the modal on first paint. The cookie banner is fixed-position at
  // the bottom of the viewport, and on tablet our EC code blocks stack
  // above it once Playwright scrolls the reject button into view — the
  // resulting pointer-event interception makes the standard
  // dismissCookieConsentIfVisible helper time out. Suppressing the banner
  // up front avoids the overlap entirely.
  //
  // Shape mirrors vanilla-cookieconsent v3's persisted cookie after a real
  // "Reject all" — categories: ['necessary'] is the minimal accepted set
  // (matches the readOnly: true necessary category in
  // src/frontend/config/cookie.config.ts).
  const ccCookieValue = encodeURIComponent(
    JSON.stringify({
      categories: ['necessary'],
      revision: 0,
      data: null,
      consentTimestamp: new Date().toISOString(),
      consentId: '00000000-0000-0000-0000-000000000000',
      services: { necessary: [] },
      lastConsentTimestamp: new Date().toISOString(),
      expirationTime: Date.now() + 365 * 24 * 60 * 60 * 1000,
    }),
  );

  // Set on both the explicit base URL host (so the lib sees it on first
  // request) and via init script (defensive — runs before any inline page
  // script). The CSS fallback hides the banner if a future lib upgrade
  // rejects our pre-seeded shape.
  if (baseURL) {
    const url = new URL(baseURL);
    await context.addCookies([
      {
        name: 'cc_cookie',
        value: ccCookieValue,
        domain: url.hostname,
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
        sameSite: 'Lax',
      },
    ]);
  }

  await context.addInitScript((value) => {
    try {
      document.cookie = `cc_cookie=${value}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // best-effort
    }

    // Belt-and-suspenders: hide the banner via CSS in case the pre-seed
    // shape is rejected by a future lib upgrade. The CSS rule is appended
    // as soon as <head> exists, so it applies before paint.
    const installHide = () => {
      if (document.querySelector('style[data-test-cc-suppress]')) return;
      const style = document.createElement('style');
      style.setAttribute('data-test-cc-suppress', '');
      style.textContent = '#cc-main, #cm, .cm--box { display: none !important; }';
      (document.head ?? document.documentElement).appendChild(style);
    };
    if (document.head) {
      installHide();
    } else {
      document.addEventListener('DOMContentLoaded', installHide, { once: true });
    }
  }, ccCookieValue);
});

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

  test('card title links to the integration get-started page', async ({ page }) => {
    await page.goto('/integrations/gallery/');
    await dismissCookieConsentIfVisible(page);

    const postgresCard = page.locator('.card[data-title="aspire.hosting.postgresql"]');
    const titleLink = postgresCard.locator('.title-link');

    await expect(titleLink).toBeVisible();
    // Get-started URL straight from the docs map — not the `-host/` page the
    // language buttons swap to.
    await expect(titleLink).toHaveAttribute(
      'href',
      '/integrations/databases/postgres/postgres-get-started/',
    );
    // Internal docs links must stay in the same tab.
    await expect(titleLink).not.toHaveAttribute('target', '_blank');
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

  test('the `aspire add` snippet renders inside an Expressive Code copy-ready frame', async ({
    page,
  }) => {
    // SSR-only assertions — no DOM interactions are needed beyond reading
    // attributes, so we deliberately skip the cookie banner dismiss step.
    // The banner is positioned via z-index over the gallery but does not
    // affect locator queries; dismissing it has been observed to flake on
    // narrow viewports when cards overlap the banner footprint.
    await page.goto('/integrations/gallery/', { waitUntil: 'domcontentloaded' });

    const postgresCard = page.locator('.card[data-title="aspire.hosting.postgresql"]');
    const frame = postgresCard.locator('.install-command figure.frame');
    await expect(frame).toBeAttached();

    // Expressive Code SSR-attaches `data-code` to the copy button. This is
    // what the runtime copy handler reads and writes to the clipboard, so
    // verifying the attribute proves the snippet is wired up end-to-end
    // without having to interact with the OS clipboard (which is flaky
    // across viewports + browsers in CI).
    const copyButton = frame.locator('.copy button');
    await expect(copyButton).toBeAttached();
    await expect(copyButton).toHaveAttribute('data-code', /aspire add postgresql/);

    // The visible <code> must still contain the rendered snippet for users
    // who prefer selecting + copying manually.
    await expect(frame.locator('pre code')).toContainText('aspire add postgresql');
  });

  test('totals load with non-zero values on initial render', async ({ page }) => {
    // Totals are only displayed at ≥768px viewport widths (see
    // `.integration-stats` CSS). Force the viewport and disable animations so
    // the assertions don't have to poll through count-up frames.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.goto('/integrations/gallery/');
    await dismissCookieConsentIfVisible(page);

    const stats = page.locator('.integration-stats');
    await expect(stats).toBeVisible();

    // Each .total-number has a `data-target` that reflects the real count.
    // Once the load-time animation completes, its textContent must match the
    // data-target. With reduced motion, this is set synchronously.
    const totals = stats.locator('.total-number');
    await expect(totals).not.toHaveCount(0);

    const count = await totals.count();
    for (let i = 0; i < count; i++) {
      const total = totals.nth(i);
      const target = await total.getAttribute('data-target');
      expect(target).toMatch(/^\d+$/);
      expect(Number(target)).toBeGreaterThan(0);

      // textContent must reach the target value (no "0" stuck state).
      await expect.poll(async () => (await total.textContent())?.replace(/[,\s]/g, '')).toBe(target);
    }
  });

  test('totals update when a filter is applied', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.goto('/integrations/gallery/');
    await dismissCookieConsentIfVisible(page);

    const totals = page.locator('.integration-stats .total-number');
    await expect(totals.first()).toBeVisible();

    // Wait for the initial load-time animation to settle.
    await expect
      .poll(async () => {
        const text = await totals.first().textContent();
        const target = await totals.first().getAttribute('data-target');
        return text?.replace(/[,\s]/g, '') === target;
      })
      .toBe(true);

    const initialTargets = await totals.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-target') ?? '0'),
    );

    // A search query that matches few cards is the most deterministic filter
    // — toggles depend on default-active state and on data shape, but a
    // narrow query is guaranteed to reduce every counter.
    const searchBox = page.locator('.search-box').first();
    await searchBox.fill('postgresql');

    await expect
      .poll(
        async () => {
          const targets = await totals.evaluateAll((els) =>
            els.map((el) => el.getAttribute('data-target') ?? '0'),
          );
          return targets.every((t, i) => Number(t) < Number(initialTargets[i]));
        },
        { timeout: 10_000 },
      )
      .toBe(true);

    // textContent must also catch up to the new data-target — proving the
    // counter actually re-animates on filter change.
    const count = await totals.count();
    for (let i = 0; i < count; i++) {
      const total = totals.nth(i);
      await expect
        .poll(async () => {
          const text = (await total.textContent())?.replace(/[,\s]/g, '');
          const target = await total.getAttribute('data-target');
          return text === target;
        })
        .toBe(true);
    }
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
