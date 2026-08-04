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
  const codeDisplay = builder.locator('[data-apphost-code-display]');
  const codeStage = builder.locator('[data-code-stage]');
  const languageToggles = builder.locator('.lang-toggle');
  const typeScriptToggle = builder.locator('.lang-toggle[data-lang="typescript"]');
  const csharpToggle = builder.locator('.lang-toggle[data-lang="csharp"]');

  await expect(languageToggles).toHaveText(['TypeScript', 'C#']);
  await expect(typeScriptToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(csharpToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(codeStage).toBeVisible();
  await expect(codeStage).toHaveAttribute('data-code-lang', 'typescript');
  await expect(codeStage).toHaveAttribute('data-code-variant', 'frontend');
  await expect(codeStage).toContainText('.addViteApp("frontend"');
  await expect(typeScriptGroup).toBeHidden();
  await expect(csharpGroup).toBeHidden();

  await builder.locator('.toggle[data-toggle="database"]').click();
  await expect(codeStage).toHaveAttribute('data-code-variant', 'databaseFrontend');
  await expect(codeDisplay).toHaveAttribute('data-editor-state', 'idle');
  await expect(codeStage).toContainText('.addPostgres("db")');

  await csharpToggle.click();

  await expect(csharpToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(typeScriptToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(codeStage).toHaveAttribute('data-code-lang', 'csharp');
  await expect(codeDisplay).toHaveAttribute('data-editor-state', 'idle');
  await expect(codeStage).toContainText('AddPostgres("db")');
  await expect(csharpGroup).toBeHidden();
  await expect(typeScriptGroup).toBeHidden();
});

test('AppHost builder types additions and selects removals before deleting them', async ({
  page,
}) => {
  await page.goto('/');
  await dismissCookieConsentIfVisible(page);

  const builder = page.locator('[data-apphost-builder]').first();
  const codeDisplay = builder.locator('[data-apphost-code-display]');
  const codeStage = builder.locator('[data-code-stage]');
  const databaseToggle = builder.locator('.toggle[data-toggle="database"]');

  await expect(builder.locator('[data-editor-caret]')).toHaveCSS('position', 'absolute');
  await databaseToggle.click();
  await expect(codeDisplay).toHaveAttribute('data-editor-state', 'typing');
  await expect(codeStage.locator('[data-editor-inserting]')).toHaveCount(1);
  await expect(codeStage).toHaveAttribute('data-code-variant', 'databaseFrontend');
  await expect(codeDisplay).toHaveAttribute('data-editor-state', 'idle');

  await databaseToggle.click();
  await expect(codeDisplay).toHaveAttribute('data-editor-state', 'selecting');
  await expect(codeStage.locator('[data-editor-selection]')).not.toHaveCount(0);
  await expect(codeStage).toHaveAttribute('data-code-variant', 'frontend');
  await expect(codeDisplay).toHaveAttribute('data-editor-state', 'idle');
  await expect(codeStage).not.toContainText('.addPostgres("db")');
});

test('AppHost builder applies code changes immediately when reduced motion is requested', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await dismissCookieConsentIfVisible(page);

  const builder = page.locator('[data-apphost-builder]').first();
  const codeDisplay = builder.locator('[data-apphost-code-display]');
  const codeStage = builder.locator('[data-code-stage]');

  await builder.locator('.toggle[data-toggle="database"]').click();
  await expect(codeStage).toHaveAttribute('data-code-variant', 'databaseFrontend');
  await expect(codeDisplay).toHaveAttribute('data-editor-motion', 'reduced');
  await expect(codeDisplay).toHaveAttribute('data-editor-state', 'idle');
  await expect(codeStage.locator('[data-editor-selection], [data-editor-inserting]')).toHaveCount(
    0
  );
});

test('AppHost builder can disable typing motion and its caret', async ({ page }) => {
  await page.goto('/');
  await dismissCookieConsentIfVisible(page);

  const builder = page.locator('[data-apphost-builder]').first();
  const codeDisplay = builder.locator('[data-apphost-code-display]');
  const codeStage = builder.locator('[data-code-stage]');
  const motionToggle = builder.locator('[data-editor-motion-toggle]');
  const databaseToggle = builder.locator('.toggle[data-toggle="database"]');

  await expect(motionToggle).toBeChecked();
  await databaseToggle.click();
  await expect(codeDisplay).toHaveAttribute('data-editor-state', 'typing');

  await motionToggle.uncheck();
  await expect(builder).toHaveAttribute('data-editor-motion-enabled', 'false');
  await expect(codeDisplay).toHaveAttribute('data-editor-motion', 'disabled');
  await expect(builder.locator('[data-editor-caret]')).toBeHidden();
  await expect(codeStage).toHaveAttribute('data-code-variant', 'databaseFrontend');
  await expect(codeDisplay).toHaveAttribute('data-editor-state', 'idle');
  await expect(codeStage.locator('[data-editor-selection], [data-editor-inserting]')).toHaveCount(
    0
  );

  await builder.locator('.toggle[data-toggle="api"]').click();
  await expect(codeStage).toHaveAttribute('data-code-variant', 'databaseApiFrontend');
  await expect(codeDisplay).toHaveAttribute('data-editor-state', 'idle');
  await builder.locator('.lang-toggle[data-lang="csharp"]').click();
  await expect(codeStage).toHaveAttribute('data-code-lang', 'csharp');
  await expect(codeStage).toContainText('AddPostgres("db")');
  await expect(codeStage.locator('[data-editor-selection], [data-editor-inserting]')).toHaveCount(
    0
  );

  await motionToggle.check();
  await expect(builder).toHaveAttribute('data-editor-motion-enabled', 'true');
  await builder.locator('.toggle[data-toggle="api"]').click();
  await expect(codeDisplay).toHaveAttribute('data-editor-state', 'selecting');
  await expect(codeDisplay).toHaveAttribute('data-editor-state', 'idle');
});

test('AI context tips overlay section content on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await dismissCookieConsentIfVisible(page);

  const cases = [
    ['.home-model [data-home-agent-badge]', '.model-proof'],
    ['[data-home-environments] [data-home-agent-badge]', '.environment-switcher'],
    ['.home-dashboard [data-home-agent-badge]', '.dashboard-stage'],
  ] as const;

  for (const [index, [badgeSelector, contentSelector]] of cases.entries()) {
    const badge = page.locator(badgeSelector);
    const popover = badge.locator('[role="tooltip"]');

    await badge.scrollIntoViewIfNeeded();
    await badge.focus();
    await expect(popover).toBeVisible();

    const geometry = await page.evaluate(
      ({ badgeSelector, contentSelector }) => {
        const badge = document.querySelector<HTMLElement>(badgeSelector);
        const popover = badge?.querySelector<HTMLElement>('[role="tooltip"]');
        const content = document.querySelector<HTMLElement>(contentSelector);
        if (!popover || !content) return null;

        const popoverRect = popover.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        const overlapLeft = Math.max(popoverRect.left, contentRect.left);
        const overlapRight = Math.min(popoverRect.right, contentRect.right);
        const overlapTop = Math.max(popoverRect.top, contentRect.top);
        const overlapBottom = Math.min(popoverRect.bottom, contentRect.bottom);
        const overlaps = overlapRight > overlapLeft && overlapBottom > overlapTop;
        const pointX = overlaps ? (overlapLeft + overlapRight) / 2 : popoverRect.left + 4;
        const pointY = overlaps ? (overlapTop + overlapBottom) / 2 : popoverRect.top + 4;
        const topElement = document.elementFromPoint(pointX, pointY);

        return {
          insideViewport: popoverRect.left >= 0 && popoverRect.right <= window.innerWidth,
          overlaps,
          paintsOnTop: topElement === popover || popover.contains(topElement),
        };
      },
      { badgeSelector, contentSelector }
    );

    expect(geometry).not.toBeNull();
    expect(geometry?.insideViewport).toBe(true);
    expect(geometry?.paintsOnTop).toBe(true);
    if (index < 2) expect(geometry?.overlaps).toBe(true);
  }
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

test('homepage environment story exposes a keyboard-operable selected state', async ({ page }) => {
  await page.goto('/');
  await dismissCookieConsentIfVisible(page);

  const environment = page.locator('[data-home-environments]');
  const localButton = environment.getByRole('button', { name: 'Local' });
  const productionButton = environment.getByRole('button', { name: 'Production' });
  const localPanel = environment.locator('[data-environment-panel="local"]');
  const productionPanel = environment.locator('[data-environment-panel="production"]');

  await expect(localButton).toHaveAttribute('aria-pressed', 'true');
  await expect(localPanel).toBeVisible();
  await expect(productionPanel).toBeHidden();

  const selectedIndicator = await localButton.evaluate((button) => {
    const style = getComputedStyle(button, '::after');
    return {
      borderRadius: style.borderRadius,
      width: Number.parseFloat(style.width),
      buttonWidth: button.getBoundingClientRect().width,
    };
  });

  expect(selectedIndicator.borderRadius).not.toBe('0px');
  expect(selectedIndicator.width).toBeLessThan(selectedIndicator.buttonWidth);

  await productionButton.focus();
  await page.keyboard.press('Enter');

  await expect(productionButton).toHaveAttribute('aria-pressed', 'true');
  await expect(localButton).toHaveAttribute('aria-pressed', 'false');
  await expect(localPanel).toBeHidden();
  await expect(productionPanel).toBeVisible();
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
