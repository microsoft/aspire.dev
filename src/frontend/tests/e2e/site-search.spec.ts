import { expect, test, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

/**
 * Opens the Pagefind/Starlight search dialog and waits for either the
 * Pagefind input or the dev-mode warning to appear.
 *
 * Returns `true` if the real Pagefind UI is mounted (so result-driven
 * assertions are meaningful) and `false` if the page is being served by
 * `astro dev`, where Pagefind is not built. Callers should `test.skip()`
 * when the helper returns `false`.
 */
async function openSearchDialog(page: Page): Promise<boolean> {
  const openButton = page.locator('site-search button[data-open-modal]');
  await expect(openButton).toBeVisible({ timeout: 15000 });
  await openButton.click();

  const dialog = page.locator('site-search dialog[open]');
  await expect(dialog).toBeVisible();

  // Pagefind UI is mounted asynchronously after dialog open. In `astro dev`,
  // Pagefind is not built, so the dialog renders a dev-mode warning instead.
  const input = dialog.locator('input.pagefind-ui__search-input');
  const devWarning = dialog.locator('text=/Search is only available in production builds/i');

  await expect(input.or(devWarning)).toBeVisible({ timeout: 15000 });

  return await input.isVisible().catch(() => false);
}

async function typeSearchQuery(page: Page, query: string): Promise<void> {
  const input = page.locator('site-search dialog input.pagefind-ui__search-input');
  await input.fill(query);
}

test.describe('site search dialog', () => {
  test('renders keyboard shortcut hints in the footer', async ({ page }) => {
    await page.goto('/');
    await dismissCookieConsentIfVisible(page);

    const ready = await openSearchDialog(page);
    test.skip(!ready, 'Pagefind is not available in dev mode; this assertion runs against astro preview.');

    const footer = page.locator('[data-testid="search-keyboard-footer"]');
    await expect(footer).toBeVisible();

    // Real <kbd> elements so the shortcut text scales with the user's font size.
    await expect(footer.locator('kbd', { hasText: '↑' })).toBeVisible();
    await expect(footer.locator('kbd', { hasText: '↓' })).toBeVisible();
    await expect(footer.locator('kbd', { hasText: '↵' })).toBeVisible();
    await expect(footer.locator('kbd', { hasText: 'Esc' })).toBeVisible();

    await expect(footer).toContainText('Navigate');
    await expect(footer).toContainText('Open');
    await expect(footer).toContainText('Close');
  });

  test('arrow keys cycle through results, Tab keeps state, and Escape closes the dialog', async ({
    page,
  }) => {
    await page.goto('/');
    await dismissCookieConsentIfVisible(page);

    const ready = await openSearchDialog(page);
    test.skip(!ready, 'Pagefind is not available in dev mode; keyboard nav runs against astro preview.');

    // Use a query that consistently returns multiple Pagefind hits across
    // the docs index. "aspire" is referenced by virtually every doc page.
    await typeSearchQuery(page, 'aspire');

    const dialog = page.locator('site-search dialog[open]');
    const results = dialog.locator('.pagefind-ui__result-link');
    // Anchor the input to the dialog element itself (not `dialog[open]`)
    // so the locator still resolves after Escape closes the dialog and
    // we can assert the post-close `aria-expanded` value.
    const input = page.locator('site-search dialog input.pagefind-ui__search-input');
    await expect(results.first()).toBeVisible({ timeout: 15000 });
    await expect.poll(() => results.count()).toBeGreaterThanOrEqual(3);

    // First result should auto-highlight as soon as Pagefind renders.
    await expect(results.nth(0)).toHaveAttribute('data-search-active', 'true');
    await expect(results.nth(0)).toHaveAttribute('aria-selected', 'true');

    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('role', 'combobox');
    await expect(input).toHaveAttribute('aria-controls', 'aspire-search-results');
    await expect(input).toHaveAttribute('aria-expanded', 'true');

    // ArrowDown moves the active marker to the next result *and* moves
    // real focus there, so Tab can resume from that location.
    await input.press('ArrowDown');
    await expect(results.nth(0)).not.toHaveAttribute('data-search-active', 'true');
    await expect(results.nth(1)).toHaveAttribute('data-search-active', 'true');
    await expect(results.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(results.nth(1)).toBeFocused();

    // Native Tab from result[1] should advance focus to result[2] and
    // the focusin handler should keep activeIndex in sync.
    await page.keyboard.press('Tab');
    await expect(results.nth(2)).toBeFocused();
    await expect(results.nth(2)).toHaveAttribute('data-search-active', 'true');
    await expect(results.nth(1)).not.toHaveAttribute('data-search-active', 'true');

    // Up/Down can resume from the post-Tab location.
    await page.keyboard.press('ArrowUp');
    await expect(results.nth(1)).toBeFocused();
    await expect(results.nth(1)).toHaveAttribute('data-search-active', 'true');

    // The input's aria-activedescendant tracks the active result.
    const activeId = await results.nth(1).getAttribute('id');
    expect(activeId).toBeTruthy();
    await expect(input).toHaveAttribute('aria-activedescendant', activeId!);

    // Escape closes the dialog (native <dialog> behaviour) and
    // aria-expanded flips back to "false".
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  test('arrow nav also cycles through the C#/TypeScript API buttons', async ({ page }) => {
    await page.goto('/');
    await dismissCookieConsentIfVisible(page);

    const ready = await openSearchDialog(page);
    test.skip(!ready, 'Pagefind is not available in dev mode; this assertion runs against astro preview.');

    await typeSearchQuery(page, 'aspire');

    const dialog = page.locator('site-search dialog[open]');
    const results = dialog.locator('.pagefind-ui__result-link');
    const csharpBtn = dialog.locator('a[data-api-search-link][data-api-lang="csharp"]');
    const tsBtn = dialog.locator('a[data-api-search-link][data-api-lang="typescript"]');

    await expect(results.first()).toBeVisible({ timeout: 15000 });
    await expect(csharpBtn).toBeVisible();

    // Press End to jump to the last keyboard target — that should be the
    // TypeScript API button (last item in DOM order: results → load-more
    // → C# button → TS button). Home/End are deliberately ignored while
    // the caret is in the input (they keep native text-editing behaviour
    // there), so we ArrowDown into the results first to move focus out
    // of the search field.
    const input = dialog.locator('input.pagefind-ui__search-input');
    await input.press('ArrowDown');
    await page.keyboard.press('End');
    await expect(tsBtn).toHaveAttribute('data-search-active', 'true');
    await expect(tsBtn).toBeFocused();

    // ArrowUp from TS button should land on the C# button.
    await page.keyboard.press('ArrowUp');
    await expect(csharpBtn).toHaveAttribute('data-search-active', 'true');
    await expect(csharpBtn).toBeFocused();
    await expect(tsBtn).not.toHaveAttribute('data-search-active', 'true');

    // Press Home to jump back to the very first result; the API buttons
    // release the active marker.
    await page.keyboard.press('Home');
    await expect(results.first()).toHaveAttribute('data-search-active', 'true');
    await expect(csharpBtn).not.toHaveAttribute('data-search-active', 'true');
  });

  test('Home/End in the search input do not focus the API/load-more buttons', async ({
    page,
  }) => {
    await page.goto('/');
    await dismissCookieConsentIfVisible(page);

    const ready = await openSearchDialog(page);
    test.skip(!ready, 'Pagefind is not available in dev mode; this assertion runs against astro preview.');

    await typeSearchQuery(page, 'aspire');

    const dialog = page.locator('site-search dialog[open]');
    const input = dialog.locator('input.pagefind-ui__search-input');
    const results = dialog.locator('.pagefind-ui__result-link');
    const csharpBtn = dialog.locator('a[data-api-search-link][data-api-lang="csharp"]');
    const tsBtn = dialog.locator('a[data-api-search-link][data-api-lang="typescript"]');

    await expect(results.first()).toBeVisible({ timeout: 15000 });

    // Pressing Home/End while focus is in the input must NOT move the
    // active marker to the C#/TypeScript API buttons (or any other
    // out-of-listbox target). This is the regression that previously
    // stole the caret away from the search field whenever the user
    // tried to jump to the start/end of their query text.
    await input.press('Home');
    await expect(csharpBtn).not.toHaveAttribute('data-search-active', 'true');
    await expect(tsBtn).not.toHaveAttribute('data-search-active', 'true');
    await expect(csharpBtn).not.toBeFocused();
    await expect(tsBtn).not.toBeFocused();

    await input.press('End');
    await expect(csharpBtn).not.toHaveAttribute('data-search-active', 'true');
    await expect(tsBtn).not.toHaveAttribute('data-search-active', 'true');
    await expect(csharpBtn).not.toBeFocused();
    await expect(tsBtn).not.toBeFocused();
  });

  test('typed query is forwarded to the C# and TypeScript API buttons', async ({ page }) => {
    await page.goto('/');
    await dismissCookieConsentIfVisible(page);

    const ready = await openSearchDialog(page);
    test.skip(!ready, 'Pagefind input is required to type into; runs against astro preview.');

    const dialog = page.locator('site-search dialog[open]');
    const csharpBtn = dialog.locator('a[data-api-search-link][data-api-lang="csharp"]');
    const tsBtn = dialog.locator('a[data-api-search-link][data-api-lang="typescript"]');

    await expect(csharpBtn).toBeVisible();
    await expect(tsBtn).toBeVisible();

    // Pre-typing: hrefs should be the bare landing pages.
    await expect(csharpBtn).toHaveAttribute('href', /\/reference\/api\/csharp\/$/);
    await expect(tsBtn).toHaveAttribute('href', /\/reference\/api\/typescript\/$/);

    // Use a query the TS API search index actually contains so the hand-off
    // can be verified end-to-end.
    await typeSearchQuery(page, 'withBun');

    await expect(csharpBtn).toHaveAttribute('href', /\/reference\/api\/csharp\/\?q=withBun$/);
    await expect(tsBtn).toHaveAttribute('href', /\/reference\/api\/typescript\/\?q=withBun$/);

    // Click the TypeScript button — it should land on the TS API landing
    // page with the query pre-applied via InpageSearchSync.
    await tsBtn.click();
    await page.waitForURL(/\/reference\/api\/typescript\/\?q=withBun/);

    await dismissCookieConsentIfVisible(page);

    const tsInput = page.locator('#ts-api-search-input');
    await expect(tsInput).toHaveValue('withBun');

    const tsResults = page.locator('#ts-api-search-results .api-search-result');
    await expect(tsResults.first()).toBeVisible({ timeout: 10000 });
  });

  test('clearing the search input restores the default API button hrefs', async ({ page }) => {
    await page.goto('/');
    await dismissCookieConsentIfVisible(page);

    const ready = await openSearchDialog(page);
    test.skip(!ready, 'Pagefind input is required to type into; runs against astro preview.');

    const dialog = page.locator('site-search dialog[open]');
    const csharpBtn = dialog.locator('a[data-api-search-link][data-api-lang="csharp"]');
    const tsBtn = dialog.locator('a[data-api-search-link][data-api-lang="typescript"]');

    await typeSearchQuery(page, 'withBun');
    await expect(csharpBtn).toHaveAttribute('href', /\?q=withBun$/);

    await typeSearchQuery(page, '');
    await expect(csharpBtn).toHaveAttribute('href', /\/reference\/api\/csharp\/$/);
    await expect(tsBtn).toHaveAttribute('href', /\/reference\/api\/typescript\/$/);
  });
});
