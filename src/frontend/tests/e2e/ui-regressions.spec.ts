import { expect, test, type Page } from '@playwright/test';
import {
  dismissCookieConsentIfVisible,
  isNarrowViewport,
  resetCookieConsentState,
  waitForApiSidebarReady,
  waitForTopicSidebarReady,
} from '@tests/e2e/helpers';

const isSiteTourEnabled = process.env.PUBLIC_ENABLE_SITE_TOUR === 'true';

async function hasCollapsedSidebar(page: Page): Promise<boolean | null> {
  try {
    return await page.evaluate(() =>
      document.documentElement.hasAttribute('data-sidebar-collapsed')
    );
  } catch {
    return null;
  }
}

async function readSidebarCollapsedPreference(page: Page): Promise<string | null> {
  try {
    return await page.evaluate(() => localStorage.getItem('api-sidebar-collapsed'));
  } catch {
    return null;
  }
}

async function hasTopicSidebarCollapsed(page: Page): Promise<boolean | null> {
  try {
    return await page.evaluate(() =>
      document.documentElement.hasAttribute('data-topic-sidebar-collapsed')
    );
  } catch {
    return null;
  }
}

async function readTopicSidebarCollapsedPreference(page: Page): Promise<string | null> {
  try {
    return await page.evaluate(() => localStorage.getItem('topic-sidebar-collapsed'));
  } catch {
    return null;
  }
}

test('install CLI entry adapts to viewport and remembers the selected channel', async ({
  page,
}) => {
  if (isNarrowViewport(page)) {
    await page.goto('/get-started/install-cli/');
    await dismissCookieConsentIfVisible(page);
    await expect(page).toHaveURL(/\/get-started\/install-cli\/?$/);
    await expect(page.getByRole('heading', { name: /install aspire cli/i })).toBeVisible();
    return;
  }

  await page.goto('/');
  await dismissCookieConsentIfVisible(page);

  const openInstallButton = page.locator('[data-open-install-modal]:visible').first();
  await expect(openInstallButton).toBeVisible();

  await openInstallButton.click();

  const installModal = page.locator('#install-cli-modal');
  const versionSelect = installModal.locator('#version-select');
  const channelTrigger = installModal.getByRole('combobox', {
    name: 'Select release channel',
  });

  await expect(installModal).toBeVisible();
  await channelTrigger.click();
  await expect(channelTrigger).toHaveAttribute('aria-expanded', 'true');
  const channelListbox = page.getByRole('listbox', { name: 'Select release channel' });
  await expect(channelListbox).toBeVisible();
  await expect(channelListbox).toHaveAttribute('data-side', /top|bottom/);
  await channelListbox.getByRole('option', { name: /^Dev/ }).click();

  await expect(versionSelect).toHaveValue('dev');
  await expect(channelTrigger).toContainText('Dev');
  await expect(channelTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(installModal.locator('.quality-aside[data-quality="dev"]')).toBeVisible();
  await expect(installModal.locator('.code-wrapper[data-version="dev"]').first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('aspire-install-channel')))
    .toBe('dev');

  await installModal.getByRole('button', { name: /close modal/i }).click();
  await expect(installModal).not.toBeVisible();

  await openInstallButton.click();
  await expect(versionSelect).toHaveValue('dev');
  await expect(channelTrigger).toContainText('Dev');
});

test('homepage header actions stay reachable at zoomed and reflow widths', async ({ page }) => {
  test.skip(
    page.viewportSize()?.width !== 1440,
    'This regression is covered once from the desktop project with explicit narrow widths.'
  );

  // This test loops over narrow widths and, at each one, clicks the install
  // button — which navigates to /get-started/install-cli/ — before looping
  // back to the homepage. Starlight's view transitions animate each of those
  // navigations, and in headless Chromium a transition kicked off on the
  // second homepage visit can stall the compositor (requestAnimationFrame
  // stops firing), leaving the whole page frozen and unclickable. Disabling
  // motion makes Starlight skip the view-transition animations, which keeps
  // the page interactive across the repeated navigations.
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // The "Manage cookies" button is region-gated: once WCP resolves the
  // visitor's region it hides the button where consent isn't required (which
  // is how most CI runner IPs resolve). Block the WCP CDN so this layout test
  // always sees the failsafe default — every header control present — keeping
  // the expected order deterministic regardless of where the runner lives.
  await page.route(/wcpstatic\.microsoft\.com/, (route) => route.abort());

  const expectedCompactHeaderOrder = [
    'Aspire',
    'Search',
    'Open cookie preferences dialog',
    'Open install Aspire CLI dialog',
    'Docs',
    'Try',
  ];

  if (isSiteTourEnabled) {
    expectedCompactHeaderOrder.splice(2, 0, 'Start site tour');
  }

  for (const width of [640, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await resetCookieConsentState(page);
    await page.goto('/');
    await dismissCookieConsentIfVisible(page);

    const banner = page.getByRole('banner');

    await expect
      .poll(() =>
        banner.evaluate((header) =>
          Array.from(header.querySelectorAll('a, button'))
            .filter((element) => {
              if (!(element instanceof HTMLElement)) {
                return false;
              }

              const style = window.getComputedStyle(element);
              if (style.display === 'none' || style.visibility === 'hidden') {
                return false;
              }

              const rect = element.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            })
            .map((element) => {
              if (!(element instanceof HTMLElement)) {
                return '';
              }

              if (element.matches('.site-title')) {
                return 'Aspire';
              }

              if (element.matches('button[data-open-modal]')) {
                return 'Search';
              }

              const tourTarget = element.dataset.tourTarget;
              if (tourTarget === 'tour-help') {
                return 'Start site tour';
              }

              if (tourTarget === 'cookie-preferences') {
                return 'Open cookie preferences dialog';
              }

              if (tourTarget === 'install-cli') {
                return 'Open install Aspire CLI dialog';
              }

              if (element instanceof HTMLAnchorElement) {
                if (element.pathname.endsWith('/docs/')) {
                  return 'Docs';
                }

                if (element.pathname.endsWith('/get-started/first-app/')) {
                  return 'Try';
                }
              }

              return (
                element.getAttribute('aria-label')?.trim() || element.textContent?.trim() || ''
              );
            })
        )
      )
      .toEqual(expectedCompactHeaderOrder);

    await expect
      .poll(() => page.locator('main').evaluate((element) => element.getBoundingClientRect().top))
      .toBeLessThan(170);

    await expect(banner.getByRole('link', { name: 'Aspire', exact: true })).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Search' })).toBeVisible();
    await expect(banner.getByRole('link', { name: 'Docs', exact: true })).toBeVisible();
    await expect(banner.getByRole('link', { name: 'Try Aspire', exact: true })).toBeVisible();

    if (!isSiteTourEnabled) {
      await expect(banner.locator('[data-tour-trigger]')).toHaveCount(0);
    }

    await expect(
      banner.getByRole('button', { name: /open cookie preferences dialog/i }).first()
    ).toBeVisible();

    const installButton = banner
      .getByRole('button', {
        name: /open install aspire cli dialog/i,
      })
      .first();
    await expect(installButton).toBeVisible();
    await installButton.click();

    if (isNarrowViewport(page)) {
      await expect(page).toHaveURL(/\/get-started\/install-cli\/?$/);
      await expect(page.getByRole('heading', { name: /install aspire cli/i })).toBeVisible();
      continue;
    }

    const installModal = page.locator('#install-cli-modal').first();
    await expect(installModal).toBeVisible();
    await installModal.getByRole('button', { name: /close modal/i }).click();
    await expect(installModal).not.toBeVisible();
  }
});

test('localizes the shared header Docs and Try Aspire actions', async ({ page }) => {
  test.skip(
    page.viewportSize()?.width !== 1440,
    'Localized desktop and compact header labels are covered once from the desktop project.'
  );

  await page.goto('/de/');
  await dismissCookieConsentIfVisible(page);

  const banner = page.getByRole('banner');
  const desktopDocs = banner.locator('.docs-btn');
  const desktopTry = banner.locator('.try-aspire-btn');
  await expect(desktopDocs).toBeVisible();
  await expect(desktopDocs).toHaveText('Dokumentation');
  await expect(desktopDocs).toHaveAttribute('href', '/de/docs/');
  await expect(desktopTry).toBeVisible();
  await expect(desktopTry).toHaveText('Aspire ausprobieren');
  await expect(desktopTry).toHaveAttribute('href', '/de/get-started/first-app/');

  await page.setViewportSize({ width: 640, height: 900 });
  const compactDocs = banner.locator('.docs-btn-mobile');
  const compactTry = banner.locator('.try-aspire-btn-mobile');
  await expect(compactDocs).toBeVisible();
  await expect(compactDocs).toHaveText('Dokumentation');
  await expect(compactTry).toBeVisible();
  await expect(compactTry).toHaveText('Ausprobieren');
  await expect(compactTry).toHaveAccessibleName('Aspire ausprobieren');

  await page.setViewportSize({ width: 320, height: 568 });
  const layout = await banner.locator(':scope > .header').evaluate((element) => ({
    documentOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    headerOverflows: element.scrollWidth > element.clientWidth,
  }));
  expect(layout).toEqual({ documentOverflows: false, headerOverflows: false });
});

test('footer preferences persist theme and keyboard style selections', async ({ page }) => {
  await page.goto('/get-started/aspire-vscode-extension/');
  await dismissCookieConsentIfVisible(page);

  const themeToggle = page.locator('#footer-theme-toggle');
  const darkThemeButton = themeToggle.getByRole('radio', { name: 'Dark' });
  const lightThemeButton = themeToggle.getByRole('radio', { name: 'Light' });
  const autoThemeButton = themeToggle.getByRole('radio', { name: 'Auto' });
  const kbdSelect = page.locator('#footer-kbd-select');
  const languageTrigger = page.getByRole('combobox', { name: 'Select language' });
  const kbdTrigger = page.getByRole('combobox', {
    name: 'Select keyboard shortcuts style',
  });
  const languageListbox = page.locator('#footer-language-select-listbox');

  async function expectThemeSelection(selectedTheme: 'light' | 'auto' | 'dark') {
    await expect(lightThemeButton).toHaveAttribute(
      'aria-checked',
      String(selectedTheme === 'light')
    );
    await expect(autoThemeButton).toHaveAttribute('aria-checked', String(selectedTheme === 'auto'));
    await expect(darkThemeButton).toHaveAttribute('aria-checked', String(selectedTheme === 'dark'));
  }

  async function expectMatchingPreferenceSurfaces() {
    const menuBackground = await languageListbox.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );

    expect(menuBackground).not.toBe('rgba(0, 0, 0, 0)');
    await expect(themeToggle).toHaveCSS('background-color', menuBackground);
    await expect(languageTrigger).toHaveCSS('background-color', menuBackground);
  }

  await darkThemeButton.click();
  await expectThemeSelection('dark');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('starlight-theme')))
    .toBe('dark');
  await expectMatchingPreferenceSurfaces();

  await lightThemeButton.click();
  await expectThemeSelection('light');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe('light');
  await expectMatchingPreferenceSurfaces();

  await languageTrigger.click();
  await expect(languageListbox).toBeVisible();
  await expect(languageListbox).toHaveAttribute('data-side', 'top');
  await expect(languageListbox.getByRole('option')).toHaveCount(15);
  await expect(languageListbox).toHaveCSS(
    'border-radius',
    await languageTrigger.evaluate((element) => getComputedStyle(element).borderRadius)
  );
  expect(
    await languageListbox.evaluate((element) => {
      const scrollbarButton = getComputedStyle(element, '::-webkit-scrollbar-button');
      const scrollbarThumb = getComputedStyle(element, '::-webkit-scrollbar-thumb');
      const colorProbe = document.createElement('span');
      colorProbe.style.backgroundColor = 'var(--aspire-color-primary)';
      element.append(colorProbe);
      const primaryColor = getComputedStyle(colorProbe).backgroundColor;
      colorProbe.remove();

      return {
        button: {
          display: scrollbarButton.display,
          height: scrollbarButton.height,
          width: scrollbarButton.width,
        },
        thumbUsesPrimaryColor: scrollbarThumb.backgroundColor === primaryColor,
      };
    })
  ).toEqual({
    button: { display: 'none', height: '0px', width: '0px' },
    thumbUsesPrimaryColor: true,
  });
  await page.evaluate(() => window.scrollBy(0, -8));
  await expect(languageTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(languageListbox).toBeHidden();

  await kbdTrigger.click();
  await expect(kbdTrigger).toHaveAttribute('aria-expanded', 'true');
  const macOption = page
    .getByRole('listbox', { name: 'Select keyboard shortcuts style' })
    .getByRole('option', { name: 'macOS' });
  await expect(macOption).toHaveAttribute('data-detector', 'apple');
  await expect
    .poll(() => macOption.evaluate((option) => getComputedStyle(option).alignContent))
    .toBe('center');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sl-kbd-type'))).toBe('mac');
  await expect(kbdSelect).toHaveValue('mac');
  await expect(kbdTrigger).toContainText('macOS');
  await expect(page.locator('[data-sl-kbd-type="mac"][data-sl-kbd-active]').first()).toBeVisible();
  await expect(page.locator('[data-sl-kbd-type="windows"][data-sl-kbd-active]')).toHaveCount(0);

  await page.reload();

  await expectThemeSelection('light');
  await expect(kbdSelect).toHaveValue('mac');
  await expect(kbdTrigger).toContainText('macOS');
});

test('shared footer stays contained across docs page layouts', async ({ page }) => {
  await page.goto('/get-started/first-app/?aspire-lang=typescript');
  await dismissCookieConsentIfVisible(page);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 834, height: 1112 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    const footer = page.locator('.site-footer-content');
    await expect(footer).toBeVisible();

    const layout = await footer.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const controls = Array.from(element.querySelectorAll<HTMLElement>('a, button, select'))
        .filter((control) => control.getClientRects().length > 0)
        .map((control) => control.getBoundingClientRect());

      return {
        documentOverflows:
          document.documentElement.scrollWidth > document.documentElement.clientWidth,
        footerFits: bounds.left >= 0 && bounds.right <= document.documentElement.clientWidth,
        controlsFit: controls.every(
          (control) =>
            control.left >= bounds.left - 1 &&
            control.right <= bounds.right + 1 &&
            control.width <= bounds.width + 1
        ),
      };
    });

    expect(layout).toEqual({
      documentOverflows: false,
      footerFits: true,
      controlsFit: true,
    });
    const metadataLayout = await footer.locator('.footer-bottom').evaluate((element) => {
      const sha = element.querySelector<HTMLElement>('.commit-link')?.getBoundingClientRect();
      const copyright = element.querySelector<HTMLElement>('.copyright')?.getBoundingClientRect();
      return {
        order: Array.from(element.children).map((child) =>
          child.classList.contains('commit-link') ? 'commit-link' : 'copyright'
        ),
        shaBeforeCopyright:
          Boolean(sha && copyright) &&
          (sha!.top < copyright!.top ||
            (Math.abs(sha!.top - copyright!.top) < 1 && sha!.left < copyright!.left)),
      };
    });
    expect(metadataLayout.order).toEqual(['commit-link', 'copyright']);
    expect(metadataLayout.shaBeforeCopyright).toBe(true);
    await expect(footer.getByRole('link', { name: /GitHub/ })).toBeVisible();
    await expect(footer.getByRole('link', { name: /Discord/ })).toBeVisible();
    await expect(footer.locator('#footer-theme-toggle')).toBeVisible();
  }
});

test('aligns the scroll-to-top control with the header action at each breakpoint', async ({
  page,
}) => {
  test.skip(
    page.viewportSize()?.width !== 1440,
    'Breakpoint alignment is covered once from the desktop project with explicit viewport sizes.'
  );

  await page.goto('/');
  await dismissCookieConsentIfVisible(page);

  for (const viewport of [
    { width: 1440, height: 900, bottom: 32 },
    { width: 834, height: 1112, bottom: 24 },
    { width: 390, height: 844, bottom: 16 },
    { width: 320, height: 568, bottom: 16 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

    const scrollToTop = page.locator('#scroll-to-top-button');
    const headerAction = page.locator(
      viewport.width >= 800 ? '.try-aspire-btn' : '.try-aspire-btn-mobile'
    );
    await expect(scrollToTop).toBeVisible();
    await expect(headerAction).toBeVisible();

    const placement = await scrollToTop.evaluate((button, expected) => {
      const action = document.querySelector<HTMLElement>(
        window.innerWidth >= 800 ? '.try-aspire-btn' : '.try-aspire-btn-mobile'
      );
      const buttonBounds = button.getBoundingClientRect();
      const actionBounds = action?.getBoundingClientRect();
      const buttonStyle = getComputedStyle(button);
      const actionStyle = action ? getComputedStyle(action) : null;
      return {
        bottomGap: window.innerHeight - buttonBounds.bottom,
        colorsMatch:
          actionStyle !== null &&
          buttonStyle.backgroundColor === actionStyle.backgroundColor &&
          buttonStyle.borderTopColor === actionStyle.borderTopColor &&
          buttonStyle.color === actionStyle.color,
        expectedBottom: expected,
        rightEdgeDelta: actionBounds
          ? Math.abs(actionBounds.right - buttonBounds.right)
          : Number.POSITIVE_INFINITY,
      };
    }, viewport.bottom);

    expect(placement.bottomGap).toBeCloseTo(placement.expectedBottom, 0);
    expect(placement.colorsMatch).toBe(true);
    expect(placement.rightEdgeDelta).toBeLessThanOrEqual(1);
  }
});

test('terminal tabs stay synced between pages', async ({ page }) => {
  await page.goto('/dashboard/standalone/');
  await dismissCookieConsentIfVisible(page);

  const sourceTabs = page.locator('starlight-tabs[data-sync-key="terminal"]').first();
  const bashTab = sourceTabs.getByRole('tab', { name: 'Bash' });
  const powerShellTab = sourceTabs.getByRole('tab', { name: 'PowerShell' });

  await powerShellTab.click();
  await expect(powerShellTab).toHaveAttribute('aria-selected', 'true');
  await expect(bashTab).toHaveAttribute('aria-selected', 'false');

  await bashTab.click();
  await expect(bashTab).toHaveAttribute('aria-selected', 'true');
  await expect(powerShellTab).toHaveAttribute('aria-selected', 'false');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('starlight-synced-tabs__terminal')))
    .toBe('Bash');

  await page.goto('/reference/cli/microsoft-collected-cli-telemetry/');

  const destinationTabs = page.locator('starlight-tabs[data-sync-key="terminal"]').first();
  await expect(destinationTabs.getByRole('tab', { name: 'Bash' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(destinationTabs.getByRole('tab', { name: 'PowerShell' })).toHaveAttribute(
    'aria-selected',
    'false'
  );
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('starlight-synced-tabs__terminal')))
    .toBe('Bash');
});

test('API sidebar collapse state persists across reloads', async ({ page }) => {
  test.slow();

  const viewport = page.viewportSize();
  test.skip(
    !viewport || viewport.width < 1152,
    'Sidebar collapse is only available on wide desktop layouts.'
  );

  await page.goto('/reference/api/csharp/');
  await dismissCookieConsentIfVisible(page);
  await waitForApiSidebarReady(page);

  const collapseButton = page.locator('#sidebar-collapse-btn');
  const expandButton = page.locator('#sidebar-expand-btn');

  await collapseButton.click();

  await expect.poll(() => hasCollapsedSidebar(page)).toBe(true);
  await expect.poll(() => readSidebarCollapsedPreference(page)).toBe('1');
  await expect(expandButton).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForApiSidebarReady(page);

  await expect.poll(() => hasCollapsedSidebar(page)).toBe(true);
  await expect.poll(() => readSidebarCollapsedPreference(page)).toBe('1');
  await expect(page.locator('#sidebar-expand-btn')).toBeVisible();

  await page.locator('#sidebar-expand-btn').click();

  await expect.poll(() => hasCollapsedSidebar(page)).toBe(false);
  await expect.poll(() => readSidebarCollapsedPreference(page)).toBe('0');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForApiSidebarReady(page);

  await expect.poll(() => hasCollapsedSidebar(page)).toBe(false);
  await expect.poll(() => readSidebarCollapsedPreference(page)).toBe('0');
});

test('API sidebar filter empty state and topics list controls respond correctly', async ({
  page,
}) => {
  test.slow();

  const viewport = page.viewportSize();
  test.skip(
    !viewport || viewport.width < 1152,
    'Sidebar custom controls are only available on wide desktop layouts.'
  );

  await page.goto('/reference/api/csharp/');
  await dismissCookieConsentIfVisible(page);
  await waitForApiSidebarReady(page);

  const filterInput = page.locator('#sidebar-filter-input');
  const clearButton = page.locator('#sidebar-filter-clear');
  const emptyState = page.locator('#sidebar-filter-empty');
  const emptyCopy = page.locator('#sidebar-filter-empty-copy');
  const emptyAction = page.locator('#sidebar-filter-empty-action');
  const topicsList = page
    .locator('.topics-sidebar[data-api-ref] .starlight-sidebar-topics')
    .first();

  // Topics are now always visible as a list at the top of the sidebar
  // (the previous dropdown trigger/panel were removed in the layout
  // restructure). At least one topic link should be present, the current
  // topic must be marked with `aria-current="page"`, and the filter still
  // owns the no-match empty state.
  await expect(topicsList.locator('a')).not.toHaveCount(0);
  await expect(topicsList.locator('a[aria-current="page"]')).toHaveCount(1);

  await filterInput.fill('zzzz-sidebar-no-match');

  await expect(clearButton).toBeVisible();
  await expect(emptyState).toBeVisible();
  await expect(emptyCopy).toContainText('zzzz-sidebar-no-match');

  await emptyAction.click();

  await expect(filterInput).toHaveValue('');
  await expect(clearButton).toBeHidden();
  await expect(emptyState).toBeHidden();
});

test('topic sidebar custom controls persist collapse state and filter reset on reload', async ({
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(
    !viewport || viewport.width < 1152,
    'Sidebar custom controls are only available on wide desktop layouts.'
  );

  await page.goto('/app-host/certificate-configuration/');
  await dismissCookieConsentIfVisible(page);
  await waitForTopicSidebarReady(page);

  const filterInput = page.locator('#sidebar-filter-input');
  const clearButton = page.locator('#sidebar-filter-clear');
  const emptyState = page.locator('#sidebar-filter-empty');
  const collapseButton = page.locator('#topic-sidebar-collapse-btn');
  const expandButton = page.locator('#topic-sidebar-expand-btn');
  const topicsList = page
    .locator('.topics-sidebar[data-topic-nav] .starlight-sidebar-topics')
    .first();

  // Topics are now always visible as a list at the top of the sidebar
  // (the previous dropdown trigger/panel were removed in the layout
  // restructure). At least one topic link, exactly one current-topic
  // indicator, and the filter empty state are the same invariants the
  // old dropdown test checked — just without the dropdown wrapper.
  await expect(topicsList.locator('a')).not.toHaveCount(0);
  await expect(topicsList.locator('a[aria-current="page"]')).toHaveCount(1);

  await filterInput.fill('zzzz-topic-no-match');
  await expect(clearButton).toBeVisible();
  await expect(emptyState).toBeVisible();

  await collapseButton.click();

  await expect.poll(() => hasTopicSidebarCollapsed(page)).toBe(true);
  await expect.poll(() => readTopicSidebarCollapsedPreference(page)).toBe('1');
  await expect(expandButton).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForTopicSidebarReady(page);

  await expect.poll(() => hasTopicSidebarCollapsed(page)).toBe(true);
  await expect.poll(() => readTopicSidebarCollapsedPreference(page)).toBe('1');
  await expect(page.locator('#sidebar-filter-input')).toHaveValue('');
  await expect(page.locator('#sidebar-filter-clear')).toBeHidden();
  await expect(page.locator('#sidebar-filter-empty')).toBeHidden();

  await page.locator('#topic-sidebar-expand-btn').click();

  await expect.poll(() => hasTopicSidebarCollapsed(page)).toBe(false);
  await expect.poll(() => readTopicSidebarCollapsedPreference(page)).toBe('0');
});

test('persisted collapsed sidebar preference rails the topic sidebar cleanly at sub-72rem viewports', async ({
  page,
}) => {
  // The sidebar collapse/expand toggle is functional on topic-nav pages
  // from 50rem upward (the breakpoint where the sidebar becomes
  // persistent). At sub-72rem viewports a persisted collapsed
  // preference must therefore drive the full rail-mode treatment —
  // 5rem icon rail with labels hidden — exactly the same way it does
  // at desktop. Without the topic-nav-scoped rail rules at this
  // breakpoint, the sidebar visibly stays at full width when the
  // toggle is clicked, making the toggle appear broken.
  //
  // This test also covers the regression that an earlier iteration of
  // this code hit: applying `--sl-sidebar-width: 5rem` without the
  // companion label-hiding rules, which left the sidebar at 5rem with
  // full-width labels wrapping one letter per line.
  const viewport = page.viewportSize();
  test.skip(
    !viewport || viewport.width < 800 || viewport.width >= 1152,
    'Bug only reproduces between the Starlight mobile breakpoint (50rem) and the desktop collapse breakpoint (72rem).'
  );

  // Pre-seed the persisted preferences so Head.astro's inline restore script
  // applies `data-topic-sidebar-collapsed` / `data-sidebar-collapsed` to the
  // documentElement before first paint — exactly the user-reported scenario
  // of collapsing on a wide screen and then resizing/zooming down.
  await page.addInitScript(() => {
    localStorage.setItem('topic-sidebar-collapsed', '1');
    localStorage.setItem('api-sidebar-collapsed', '1');
  });

  await page.goto('/app-host/certificate-configuration/');
  await dismissCookieConsentIfVisible(page);

  // Wait for the page and the topic sidebar element itself to render before
  // we read computed styles or measure widths.
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect(page.locator('.topics-sidebar[data-topic-nav]')).toBeAttached();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.hasAttribute('data-topic-sidebar-ready'))
    )
    .toBe(true);

  // Confirm the persisted preference round-tripped (so we know we're
  // exercising the rail-mode code path, not a no-op).
  await expect.poll(() => readTopicSidebarCollapsedPreference(page)).toBe('1');
  await expect.poll(() => hasTopicSidebarCollapsed(page)).toBe(true);

  // Rail mode is active: `--sl-sidebar-width` shrinks to 5rem.
  const sidebarWidthVar = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--sl-sidebar-width').trim()
  );
  expect(sidebarWidthVar).toBe('5rem');

  // The rendered sidebar element follows suit. `.topics-sidebar` sits
  // inside `#starlight__sidebar` with Starlight's `--sl-sidebar-pad-x`
  // on both sides, so it renders narrower than the 5rem container —
  // assert "railed, not full width" rather than an exact pixel width
  // to keep the test resilient to padding tweaks.
  const topicSidebarWidth = await page.evaluate(() => {
    const el = document.querySelector('.topics-sidebar');
    if (!el) return null;
    return el.getBoundingClientRect().width;
  });
  expect(topicSidebarWidth).not.toBeNull();
  expect(topicSidebarWidth ?? 0).toBeGreaterThan(0);
  expect(topicSidebarWidth ?? 0).toBeLessThan(100);

  // The label-hiding rule is the half of the rail-mode treatment that
  // actually prevents the "one letter per line" squish. Verify the
  // text labels inside each topic link are display: none so the icon
  // rail renders icons only.
  const topicLinkLabel = page
    .locator('.starlight-sidebar-topics a > div:not(.starlight-sidebar-topics-icon)')
    .first();
  await expect(topicLinkLabel).toBeHidden();
});

test('clicking the topic sidebar toggle at sub-72rem viewports rails the sidebar', async ({
  page,
}) => {
  // Clicking the visible collapse/expand toggle at 50rem–71.999rem
  // must actually drive the rail-mode visuals end-to-end, not just
  // flip the data attribute on <html>. This is the click-side
  // counterpart of the persisted-preference test above, exercising
  // the same code path through the user-facing toggle.
  const viewport = page.viewportSize();
  test.skip(
    !viewport || viewport.width < 800 || viewport.width >= 1152,
    'Toggle interaction at the topic-nav sub-72rem breakpoint only reproduces between 50rem and 72rem (~800–1152px).'
  );

  await page.goto('/app-host/certificate-configuration/');
  await dismissCookieConsentIfVisible(page);
  await waitForTopicSidebarReady(page);

  const collapseButton = page.locator('#topic-sidebar-collapse-btn');
  const expandButton = page.locator('#topic-sidebar-expand-btn');
  const topicSidebar = page.locator('.topics-sidebar[data-topic-nav]');

  // Baseline: sidebar starts expanded with the collapse toggle visible.
  await expect(collapseButton).toBeVisible();
  await expect.poll(() => hasTopicSidebarCollapsed(page)).toBe(false);

  const expandedWidth = (await topicSidebar.boundingBox())?.width ?? 0;
  expect(expandedWidth).toBeGreaterThan(120);

  // Collapse via the toggle. The data attribute must flip, the
  // sidebar must shrink to the 5rem rail, and the expand button
  // must replace the collapse button.
  await collapseButton.click();

  await expect.poll(() => hasTopicSidebarCollapsed(page)).toBe(true);
  await expect(expandButton).toBeVisible();

  await expect
    .poll(async () => {
      const box = await topicSidebar.boundingBox();
      return box ? box.width : null;
    })
    .toBeLessThan(100);

  // Expand again and verify the rail unwinds back to the original width.
  await expandButton.click();

  await expect.poll(() => hasTopicSidebarCollapsed(page)).toBe(false);
  await expect(collapseButton).toBeVisible();

  await expect
    .poll(async () => {
      const box = await topicSidebar.boundingBox();
      return box ? box.width : null;
    })
    .toBeGreaterThan(120);
});

test('sidebar collapse toggle does not overlap the mobile "On this page" control', async ({
  page,
}) => {
  // Regression for the "toggle covers the mobile TOC dropdown" bug. At
  // viewports in [50rem, 100rem) on topic-nav pages, the persistent
  // sidebar and Starlight's mobile TOC bar
  // (`#starlight__on-this-page--mobile`) are both visible, and so is
  // the floating sidebar collapse/expand toggle
  // (`#topic-sidebar-collapse-btn`). Before the inline-with-TOC fix,
  // the toggle was parked a row below the bar where it overlaid the
  // "On this page > <current heading>" dropdown trigger.
  //
  // The bug range covers both:
  //   - tablet (≥ 50rem, < 72rem): topic-nav sidebar visible at
  //     Starlight's default sub-desktop sizing, mobile TOC visible at
  //     Starlight's default `--sl-mobile-toc-height: 3rem`.
  //   - desktop (≥ 72rem, < 100rem): mobile TOC forced visible by
  //     aspire.dev's `--sl-mobile-toc-height: 3rem` override.
  const viewport = page.viewportSize();
  test.skip(
    !viewport || viewport.width < 800 || viewport.width >= 1600,
    'Bug only reproduces where the topic-nav sidebar and the mobile TOC are simultaneously visible (≥ 50rem and < 100rem).'
  );

  await page.goto('/app-host/certificate-configuration/');
  await dismissCookieConsentIfVisible(page);
  await waitForTopicSidebarReady(page);

  const collapseButton = page.locator('#topic-sidebar-collapse-btn');
  const mobileTocSummary = page.locator('#starlight__on-this-page--mobile');
  // The visible "On this page" pill that the padding shift actually
  // moves. The summary element itself spans the full bar width and
  // anchors its left edge to the sidebar's right edge — same as the
  // toggle — so comparing against the summary's bounding box would
  // measure the bar itself, not the trigger label. Target the inner
  // `.toggle` span (the styled pill) instead so the assertion sees
  // the effect of the `padding-inline-start` rule.
  const mobileTocTrigger = mobileTocSummary.locator('.toggle');

  // Sanity check: both controls must be visible together for the
  // overlap to be a real concern. If the breakpoint stops rendering the
  // mobile TOC at this width in the future, this guard makes the
  // failure mode obvious.
  await expect(collapseButton).toBeVisible();
  await expect(mobileTocSummary).toBeVisible();
  await expect(mobileTocTrigger).toBeVisible();

  const collapseBox = await collapseButton.boundingBox();
  const summaryBox = await mobileTocSummary.boundingBox();
  const triggerBox = await mobileTocTrigger.boundingBox();
  expect(collapseBox).not.toBeNull();
  expect(summaryBox).not.toBeNull();
  expect(triggerBox).not.toBeNull();
  if (!collapseBox || !summaryBox || !triggerBox) return;

  // Horizontal: the toggle's right edge must sit at or before the
  // visible trigger pill's left edge so the two controls don't visually
  // overlap. The 1-pixel tolerance accommodates sub-pixel rounding.
  expect(collapseBox.x + collapseBox.width).toBeLessThanOrEqual(triggerBox.x + 1);

  // Vertical: the toggle must overlap the TOC bar's y-range, not be
  // stacked above OR below it. Asserting bounding-box overlap is the
  // geometric definition of "in the same row" and catches regressions
  // where the toggle jumps off the bar in either direction.
  const collapseBottom = collapseBox.y + collapseBox.height;
  const summaryBottom = summaryBox.y + summaryBox.height;
  expect(collapseBox.y).toBeLessThan(summaryBottom);
  expect(collapseBottom).toBeGreaterThan(summaryBox.y);
});

test('sidebar collapse toggle disappears below the topic-nav sidebar breakpoint', async ({
  page,
}) => {
  // The topic-nav sidebar is moved into Starlight's mobile menu below
  // 50rem (~800px). When the sidebar isn't persistently visible, the
  // floating collapse/expand toggle has nothing to control — verify it
  // hides together with the sidebar at narrow viewports.
  const viewport = page.viewportSize();
  test.skip(
    !viewport || viewport.width >= 800,
    'Sidebar visibility breakpoint only relevant at viewports narrower than 50rem (~800px).'
  );

  await page.goto('/app-host/certificate-configuration/');
  await dismissCookieConsentIfVisible(page);

  // The persistent collapse/expand toggle should NOT be visible below
  // 50rem on topic-nav pages — Starlight serves the sidebar through
  // the mobile menu (hamburger) in that range.
  const collapseButton = page.locator('#topic-sidebar-collapse-btn');
  const expandButton = page.locator('#topic-sidebar-expand-btn');
  await expect(collapseButton).toBeHidden();
  await expect(expandButton).toBeHidden();
});

test('sidebar collapse toggle stays visible without overlapping the H1 on no-TOC landing pages', async ({
  page,
}) => {
  // Regression for the "toggle covers the page H1" bug. The
  // inline-with-TOC override in Sidebar.astro that anchors the toggle
  // inside the mobile TOC bar at 50–100rem only fires when
  // `html[data-has-toc]` is set. Landing pages such as `/deployment/`
  // set `tableOfContents: false`, so before this fix the toggle fell
  // back to its floating-tab base position at the top of the article
  // column where its leftmost ~48px overlapped the page H1's first
  // letter at narrow widths.
  //
  // The fix keeps the toggle visible (it still controls the sidebar)
  // by anchoring it into a TOC-bar-height row on no-TOC pages too
  // (see Sidebar.astro), and padding the first `.content-panel`
  // container so the H1 starts below the toggle (see site.css). At
  // >= 100rem the article column is wide enough that the floating tab
  // clears the H1 on its own, and below 50rem the topic sidebar is in
  // the mobile menu, so the no-TOC anchor + padding rules are scoped
  // to the 50–100rem range.
  const viewport = page.viewportSize();
  test.skip(
    !viewport || viewport.width < 800 || viewport.width >= 1600,
    'Bug only reproduces where the topic-nav sidebar is persistent but the mobile TOC bar is unavailable (≥ 50rem and < 100rem on no-TOC pages).'
  );

  await page.goto('/deployment/');
  await dismissCookieConsentIfVisible(page);
  await waitForTopicSidebarReady(page);

  // Sanity check: this is a no-TOC page on the topic-nav layout —
  // both conditions the no-TOC anchor + padding rules depend on.
  const hasToc = await page.evaluate(() => document.documentElement.hasAttribute('data-has-toc'));
  expect(hasToc).toBe(false);
  await expect(page.locator('.topics-sidebar[data-topic-nav]')).toBeVisible();

  const collapseButton = page.locator('#topic-sidebar-collapse-btn');
  // Starlight tags the page-title H1 with `id="_top"`. On landing pages
  // like `/deployment/` the H1 lives in the first `.content-panel`
  // container (not inside `<article>`, which only wraps the body
  // content), so an `article h1` selector misses it.
  const h1 = page.locator('h1#_top');

  // The persistent collapse/expand toggle must remain visible — the
  // reader still needs to be able to hide the sidebar to gain reading
  // width. Hiding the toggle would be a usability regression in its
  // own right.
  await expect(collapseButton).toBeVisible();
  await expect(h1).toBeVisible();

  const collapseBox = await collapseButton.boundingBox();
  const h1Box = await h1.boundingBox();
  expect(collapseBox).not.toBeNull();
  expect(h1Box).not.toBeNull();
  if (!collapseBox || !h1Box) return;

  // The toggle and the H1 must not overlap. Assert bounding-box
  // separation: either the toggle sits entirely above the H1, or
  // entirely to its left. The current fix anchors the toggle into a
  // synthesized TOC-bar-height row at the top of the article column
  // and pads the title container so the H1 drops below the toggle,
  // satisfying the "above" condition. A 1-pixel tolerance covers
  // sub-pixel rounding.
  const collapseBottom = collapseBox.y + collapseBox.height;
  const collapseRight = collapseBox.x + collapseBox.width;
  const above = collapseBottom <= h1Box.y + 1;
  const leftOf = collapseRight <= h1Box.x + 1;
  expect(
    above || leftOf,
    `Toggle (${JSON.stringify(collapseBox)}) overlaps H1 (${JSON.stringify(h1Box)}); expected toggle to be above or left of H1.`
  ).toBe(true);
});
