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
  await expect(copyButton).toHaveCSS('opacity', '1');
  await expect(copyButton).toHaveCSS('visibility', 'visible');

  await page.goto('/');
  await dismissCookieConsentIfVisible(page);

  await expect(page.locator('.code-display[data-disable-copy] .copy')).toHaveCount(0);
});

test('prerequisites presents container runtimes as one choice with Podman setup inline', async ({
  page,
}) => {
  await page.goto('/get-started/prerequisites/');
  await dismissCookieConsentIfVisible(page);

  const main = page.locator('main');
  const runtimeChoices = page.locator('.runtime-choices');
  const podmanChoice = runtimeChoices.locator('.runtime-podman');

  await expect(main).toContainText('Install an OCI-compliant container runtime');
  await expect(main).toContainText('Install one option from the tabs above.');
  await expect(main).toContainText('Podman or Rancher Desktop unless you specifically want');
  await expect(runtimeChoices).toBeVisible();
  await expect(runtimeChoices).toContainText('Docker Desktop');
  await expect(runtimeChoices).toContainText('Podman');
  await expect(runtimeChoices).toContainText('Rancher Desktop');

  await expect(runtimeChoices.getByRole('tab', { name: 'Docker Desktop' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(podmanChoice).toBeHidden();

  await runtimeChoices.getByRole('tab', { name: 'Podman' }).click();

  await expect(podmanChoice).toBeVisible();
  await expect(podmanChoice).toContainText('Use Podman with Aspire');
  await expect(podmanChoice).toContainText('ASPIRE_CONTAINER_RUNTIME');
  await expect(podmanChoice).toContainText('podman');
  await expect(podmanChoice.locator('starlight-tabs[data-sync-key="terminal"]')).toBeVisible();
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

test('homepage statement player exposes accessible playback and random controls', async ({
  page,
}) => {
  await page.goto('/');
  await dismissCookieConsentIfVisible(page);

  const player = page.locator('[data-aspire-quote-player]');
  const heading = player.locator('[data-quote-heading]');
  const statement = player.locator('[data-quote-text]');
  const index = player.locator('[data-quote-index]');
  const announcer = player.locator('[data-quote-announcer]');
  const progress = player.locator('.quote-progress-fill');
  const playbackButton = player.locator('[data-playback-toggle]');
  const randomButton = player.locator('[data-random-quote]');

  await expect(player).toHaveAttribute('aria-label', 'Aspire statements');
  await expect(statement).toContainText(/^Aspire is /);
  await expect(index).toContainText(/^\d{2}$/);
  await expect(heading).not.toBeEmpty();
  await expect(playbackButton).toHaveAttribute('aria-label', 'Pause statement rotation');
  await expect(playbackButton).toHaveAttribute('aria-pressed', 'false');
  await expect(randomButton).toHaveAttribute('aria-label', 'Show a random Aspire statement');
  await expect(progress).toHaveCSS('animation-play-state', 'running');

  await playbackButton.click();
  await expect(player).toHaveAttribute('data-state', 'paused');
  await expect(playbackButton).toHaveAttribute('aria-label', 'Play statement rotation');
  await expect(playbackButton).toHaveAttribute('aria-pressed', 'true');
  await expect(progress).toHaveCSS('animation-duration', '7s');
  await expect(progress).toHaveCSS('animation-play-state', 'paused');

  const initialIndex = await index.textContent();
  const initialStatement = await statement.textContent();
  if (!initialIndex || !initialStatement) {
    throw new Error('The statement player did not render its initial content.');
  }

  await randomButton.click();
  await expect(player).toHaveAttribute('data-phase', 'idle');
  await expect(index).not.toHaveText(initialIndex);
  await expect(statement).not.toHaveText(initialStatement);

  const updatedStatement = await statement.textContent();
  if (!updatedStatement) {
    throw new Error('The statement player did not render its randomized content.');
  }
  await expect(announcer).toContainText(updatedStatement);

  await playbackButton.click();
  await expect(player).toHaveAttribute('data-state', 'playing');
  await expect(playbackButton).toHaveAttribute('aria-label', 'Pause statement rotation');
  await expect(playbackButton).toHaveAttribute('aria-pressed', 'false');
  await expect(progress).toHaveCSS('animation-play-state', 'running');
  await expect(player).toHaveAttribute('data-phase', 'typing', { timeout: 10_000 });
  await expect(player.locator('[data-quote-progress]')).toHaveClass(/is-active/);
});

test('homepage statement player exhausts its shuffled statements before repeating', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await dismissCookieConsentIfVisible(page);

  const player = page.locator('[data-aspire-quote-player]');
  const randomButton = player.locator('[data-random-quote]');
  const index = player.locator('[data-quote-index]');

  const initialIndex = await index.textContent();
  if (!initialIndex) {
    throw new Error('The statement player did not render its initial content.');
  }

  const seenIndices = new Set([initialIndex]);
  for (let count = 1; count < 29; count++) {
    await randomButton.click();
    await expect(player).toHaveAttribute('data-phase', 'idle');

    const nextIndex = await index.textContent();
    if (!nextIndex) {
      throw new Error('The statement player did not render its randomized index.');
    }
    expect(seenIndices.has(nextIndex)).toBe(false);
    seenIndices.add(nextIndex);
  }
  expect(seenIndices.size).toBe(29);

  await randomButton.click();
  const repeatedIndex = await index.textContent();
  expect(repeatedIndex).toBe(initialIndex);
});

test('homepage statement player honors reduced motion preferences', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await dismissCookieConsentIfVisible(page);

  const player = page.locator('[data-aspire-quote-player]');
  const playbackButton = player.locator('[data-playback-toggle]');
  const randomButton = player.locator('[data-random-quote]');
  const cursor = player.locator('.typing-cursor').first();
  const progress = player.locator('.quote-progress-fill');
  const index = player.locator('[data-quote-index]');

  await expect(player).toHaveAttribute('data-state', 'paused');
  await expect(playbackButton).toHaveAttribute('aria-label', 'Play statement rotation');
  await expect(playbackButton).toHaveAttribute('aria-pressed', 'true');
  await expect(cursor).toHaveCSS('animation-name', 'none');
  await expect(progress).toHaveCSS('animation-name', 'none');

  const initialIndex = await index.textContent();
  if (!initialIndex) {
    throw new Error('The statement player did not render its initial index.');
  }

  await randomButton.click();
  await expect(player).toHaveAttribute('data-phase', 'idle');
  await expect(index).not.toHaveText(initialIndex);
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

test('samples grid hydrates filters from the URL and syncs them back on change', async ({
  page,
}) => {
  // Land directly on a pre-filtered URL. The browse view should:
  //   - prefill the search box with the `q` value,
  //   - mark each `tags` slug as active (silently dropping unknown slugs).
  await page.goto('/reference/samples/?q=redis&tags=databases,not-a-real-tag');
  await dismissCookieConsentIfVisible(page);

  const searchInput = page.locator('[data-search-input]');
  await expect(searchInput).toHaveValue('redis');

  const databasesChip = page.locator('[data-tag="databases"]');
  await expect(databasesChip).toHaveClass(/\bactive\b/);
  await expect(databasesChip).toHaveAttribute('aria-pressed', 'true');

  // The "Clear all" text link shows up once any filter is active and acts as
  // the single reset point — there is no separate "Filtered by" bar anymore.
  const clearAll = page.locator('[data-clear-all]');
  await expect(clearAll).toBeVisible();

  // Unknown slugs are dropped on hydrate, so the URL gets rewritten to a
  // canonical form that only contains tags the page actually knows about.
  await expect.poll(() => page.url()).toMatch(/[?&]tags=databases(?:&|$)/);
  await expect.poll(() => page.url()).not.toMatch(/not-a-real-tag/);

  // Toggling another tag updates `location.search` without pushing to the
  // back/forward stack, so a shared link reflects current state but
  // browser history stays clean.
  const redisChip = page.locator('[data-tag="redis"]');
  await redisChip.click();
  await expect.poll(() => page.url()).toMatch(/tags=databases%2Credis|tags=databases,redis/);

  // The "Clear all" link resets every filter at once (search + tags) and
  // hides itself when there is nothing left to clear.
  await clearAll.click();
  await expect(searchInput).toHaveValue('');
  await expect(databasesChip).not.toHaveClass(/\bactive\b/);
  await expect(redisChip).not.toHaveClass(/\bactive\b/);
  await expect(clearAll).toBeHidden();
  await expect.poll(() => page.url()).not.toMatch(/[?&](q|tags)=/);
});
