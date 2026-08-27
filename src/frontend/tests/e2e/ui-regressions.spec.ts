import { expect, test, type Page } from '@playwright/test';
import {
  dismissCookieConsentIfVisible,
  isNarrowViewport,
  resetCookieConsentState,
  waitForApiSidebarReady,
  waitForTopicSidebarReady,
} from '@tests/e2e/helpers';

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

test('homepage header matches the compact mobile action geometry at reflow widths', async ({
  page,
}) => {
  test.skip(
    page.viewportSize()?.width !== 1440,
    'This regression is covered once from the desktop project with explicit narrow widths.'
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });

  // Keep the region-gated preference action eligible so this verifies the
  // compact header hides it rather than relying on WCP to do so.
  await page.route(/wcpstatic\.microsoft\.com/, (route) => route.abort());

  const expectedCompactHeaderOrder = ['Aspire', 'Search', 'Docs', 'Try'];

  for (const width of [640, 440, 320]) {
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

    await expect(banner.locator('.right-group-mobile .install-cli-btn')).toBeHidden();
    await expect(banner.locator('.right-group-mobile .cookie-consent-btn')).toBeHidden();
    await expect(banner.locator('.right-group-mobile .tour-help-btn')).toBeHidden();

    const controls = [
      banner.getByRole('button', { name: 'Search' }),
      banner.getByRole('link', { name: 'Docs', exact: true }),
      banner.getByRole('link', { name: 'Try Aspire', exact: true }),
    ];
    const controlBoxes = await Promise.all(controls.map((control) => control.boundingBox()));
    expect(controlBoxes.every((box) => box !== null)).toBe(true);
    expect(controlBoxes.every((box) => Math.abs((box?.height ?? 0) - 32) <= 0.5)).toBe(true);
    expect(
      Math.max(...controlBoxes.map((box) => (box?.y ?? 0) + (box?.height ?? 0) / 2)) -
        Math.min(...controlBoxes.map((box) => (box?.y ?? 0) + (box?.height ?? 0) / 2))
    ).toBeLessThanOrEqual(1);

    const sortedControlBoxes = controlBoxes
      .filter((box): box is NonNullable<typeof box> => box !== null)
      .sort((a, b) => a.x - b.x);
    const controlGaps = sortedControlBoxes
      .slice(1)
      .map((box, index) => box.x - (sortedControlBoxes[index].x + sortedControlBoxes[index].width));
    expect(controlGaps.every((gap) => gap >= 7 && gap <= 9)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width
    );
  }
});

test('mobile docs chrome prioritizes reading and keeps navigation geometry consistent', async ({
  page,
}) => {
  test.skip(
    page.viewportSize()?.width !== 1440,
    'The mobile chrome matrix is covered once from the desktop project with explicit widths.'
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/whats-new/aspire-13-5/');
  await dismissCookieConsentIfVisible(page);

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => localStorage.setItem('starlight-theme', value), theme);
    await page.reload();
    await dismissCookieConsentIfVisible(page);

    const banner = page.getByRole('banner');
    const searchButton = banner.getByRole('button', { name: 'Search' });
    const tryLink = banner.locator('.try-aspire-btn-mobile');
    const menuButton = page.locator('starlight-menu-button').getByRole('button', { name: 'Menu' });

    await expect(searchButton).toBeVisible();
    await expect(tryLink).toBeVisible();
    await expect(menuButton).toBeVisible();
    await expect(banner.locator('.right-group-mobile .docs-btn-mobile')).toBeHidden();
    await expect(banner.locator('.right-group-mobile .install-cli-btn')).toBeHidden();
    await expect(banner.locator('.right-group-mobile .cookie-consent-btn')).toBeHidden();
    await expect(banner.locator('.right-group-mobile .tour-help-btn')).toBeHidden();

    const headerBox = await banner.boundingBox();
    const controlBoxes = await Promise.all(
      [searchButton, tryLink, menuButton].map((control) => control.boundingBox())
    );
    const menuButtonBox = controlBoxes[2];
    expect(headerBox).not.toBeNull();
    expect(controlBoxes.every((box) => box !== null)).toBe(true);
    expect(
      Math.max(...controlBoxes.map((box) => (box?.y ?? 0) + (box?.height ?? 0) / 2)) -
        Math.min(...controlBoxes.map((box) => (box?.y ?? 0) + (box?.height ?? 0) / 2))
    ).toBeLessThanOrEqual(1);
    expect(controlBoxes.every((box) => (box?.y ?? 0) - (headerBox?.y ?? 0) >= 8)).toBe(true);
    expect(
      controlBoxes.every(
        (box) =>
          (headerBox?.y ?? 0) + (headerBox?.height ?? 0) - ((box?.y ?? 0) + (box?.height ?? 0)) >= 8
      )
    ).toBe(true);
    const sortedControlBoxes = controlBoxes
      .filter((box): box is NonNullable<typeof box> => box !== null)
      .sort((a, b) => a.x - b.x);
    const controlGaps = sortedControlBoxes
      .slice(1)
      .map((box, index) => box.x - (sortedControlBoxes[index].x + sortedControlBoxes[index].width));
    expect(controlGaps.every((gap) => gap >= 7 && gap <= 9)).toBe(true);
    await expect(searchButton).toHaveCSS('border-top-width', '1px');
    await expect(menuButton).toHaveCSS('border-top-width', '1px');
    await expect(searchButton).toHaveCSS('border-radius', '6px');
    await expect(menuButton).toHaveCSS('border-radius', '6px');
    const searchIconBox = await searchButton.locator('svg').boundingBox();
    const menuIconBox = await menuButton.locator('.open-menu').boundingBox();
    expect(searchIconBox).not.toBeNull();
    expect(menuIconBox).not.toBeNull();
    expect(menuIconBox?.width).toBe(searchIconBox?.width);
    expect(menuIconBox?.height).toBe(searchIconBox?.height);
    expect(
      Math.abs(
        (menuIconBox?.x ?? 0) +
          (menuIconBox?.width ?? 0) / 2 -
          ((menuButtonBox?.x ?? 0) + (menuButtonBox?.width ?? 0) / 2)
      )
    ).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(
        (menuIconBox?.y ?? 0) +
          (menuIconBox?.height ?? 0) / 2 -
          ((menuButtonBox?.y ?? 0) + (menuButtonBox?.height ?? 0) / 2)
      )
    ).toBeLessThanOrEqual(0.5);

    const mobileTocToggle = page.locator('mobile-starlight-toc summary .toggle');
    await expect(mobileTocToggle).toBeVisible();
    await expect(mobileTocToggle).toHaveCSS('border-top-width', '1px');

    const actionButtons = page.locator('.actions-container .action-button');
    await expect(actionButtons).toHaveCount(3);
    const actionBoxes = await actionButtons.evaluateAll((controls) =>
      controls.map((control) => {
        const bounds = control.getBoundingClientRect();
        return { y: bounds.y };
      })
    );
    expect(actionBoxes[0].y).toBeLessThan(actionBoxes[1].y);
    expect(Math.abs(actionBoxes[1].y - actionBoxes[2].y)).toBeLessThanOrEqual(1);

    await menuButton.click();

    const sidebar = page.locator('#starlight__sidebar');
    const topics = page.locator('#starlight__sidebar .starlight-sidebar-topics').first();
    const filter = page.locator('#starlight__sidebar .sidebar-filter-input').first();
    const groupSummary = page
      .locator('#starlight__sidebar .top-level > li > details > summary')
      .first();
    const nestedLink = page.locator('#starlight__sidebar .top-level li li a').first();

    await expect(sidebar.locator('starlight-theme-select, starlight-lang-select')).toHaveCount(0);
    await expect
      .poll(() =>
        topics.evaluate(
          (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length
        )
      )
      .toBe(2);

    for (const control of [topics.locator('a').first(), filter]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    for (const control of [groupSummary, nestedLink]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
      expect(box?.height ?? Infinity).toBeLessThan(44);
    }

    const nestedLabelInsets = await nestedLink.evaluate((element) => {
      const label = element.querySelector(':scope > span:first-child');
      if (!label) return null;

      const controlBounds = element.getBoundingClientRect();
      const labelRange = document.createRange();
      labelRange.selectNodeContents(label);
      const labelBounds = labelRange.getBoundingClientRect();

      return {
        top: labelBounds.top - controlBounds.top,
        bottom: controlBounds.bottom - labelBounds.bottom,
      };
    });
    expect(nestedLabelInsets).not.toBeNull();
    expect(
      Math.abs((nestedLabelInsets?.top ?? 0) - (nestedLabelInsets?.bottom ?? 0))
    ).toBeLessThanOrEqual(0.75);

    const topLevelItems = page.locator('#starlight__sidebar .top-level > li');
    const firstTopLevelItemBox = await topLevelItems.nth(0).boundingBox();
    const secondTopLevelItemBox = await topLevelItems.nth(1).boundingBox();
    expect(firstTopLevelItemBox).not.toBeNull();
    expect(secondTopLevelItemBox).not.toBeNull();
    expect(
      (secondTopLevelItemBox?.y ?? 0) -
        ((firstTopLevelItemBox?.y ?? 0) + (firstTopLevelItemBox?.height ?? 0))
    ).toBeGreaterThanOrEqual(7);
    expect(
      (secondTopLevelItemBox?.y ?? 0) -
        ((firstTopLevelItemBox?.y ?? 0) + (firstTopLevelItemBox?.height ?? 0))
    ).toBeLessThanOrEqual(9);

    await sidebar.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    const bottomClearance = await sidebar.evaluate((element) => {
      const footer = element.querySelector('.sidebar-bottom');
      if (!footer) return -1;
      return element.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom;
    });
    expect(bottomClearance).toBeGreaterThanOrEqual(15);

    await menuButton.click();
  }

  await page.setViewportSize({ width: 320, height: 568 });
  await page.reload();
  await dismissCookieConsentIfVisible(page);

  const compactMenuButton = page
    .locator('starlight-menu-button')
    .getByRole('button', { name: 'Menu' });
  await compactMenuButton.click();

  const compactTopicMetrics = await page
    .locator('#starlight__sidebar .starlight-sidebar-topics a')
    .evaluateAll((links) =>
      links.map((link) => {
        const label = link.querySelector(':scope > div:not(.starlight-sidebar-topics-icon)');
        const linkBounds = link.getBoundingClientRect();
        const labelBounds = label?.getBoundingClientRect();
        const labelStyles = label ? getComputedStyle(label) : null;
        return {
          height: linkBounds.height,
          labelOffset: labelBounds ? labelBounds.x - linkBounds.x : -1,
          labelHeight: labelBounds?.height ?? Infinity,
          lineHeight: labelStyles ? Number.parseFloat(labelStyles.lineHeight) : 0,
        };
      })
    );
  expect(compactTopicMetrics.every(({ height }) => height >= 48)).toBe(true);
  expect(
    Math.max(...compactTopicMetrics.map(({ height }) => height)) -
      Math.min(...compactTopicMetrics.map(({ height }) => height))
  ).toBeLessThanOrEqual(1);
  expect(
    compactTopicMetrics.every(({ labelHeight, lineHeight }) => labelHeight <= lineHeight + 1)
  ).toBe(true);
  expect(
    Math.max(...compactTopicMetrics.map(({ labelOffset }) => labelOffset)) -
      Math.min(...compactTopicMetrics.map(({ labelOffset }) => labelOffset))
  ).toBeLessThanOrEqual(1);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
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

test('language selector stays open while its listbox is scrolled', async ({ page }) => {
  await page.goto('/get-started/aspire-vscode-extension/');
  await dismissCookieConsentIfVisible(page);

  const languageTrigger = page.getByRole('combobox', { name: 'Select language' });
  const languageListbox = page.locator('#footer-language-select-listbox');
  const options = languageListbox.getByRole('option');

  await languageTrigger.click();
  await expect(languageListbox).toBeVisible();
  await expect(options).toHaveCount(15);

  // The 15 locales overflow the capped listbox, so it scrolls internally.
  const isScrollable = await languageListbox.evaluate(
    (element) => element.scrollHeight > element.clientHeight + 1
  );
  expect(isScrollable).toBe(true);

  // Regression: a capture-phase window scroll listener used to close the menu on
  // *any* descendant scroll, so scrolling within the listbox (wheel/touch, or the
  // programmatic scrollIntoView triggered by keyboard navigation) dismissed it and
  // left below-the-fold locales unreachable. Scrolling inside must keep it open.
  await languageListbox.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect(languageTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(languageListbox).toBeVisible();

  // Regression: on small touch viewports the tap that scrolls the footer control
  // into view can deliver a window `scroll` event a frame after the menu opens.
  // Because it reports the same scroll offset the menu was opened at, it must be
  // ignored instead of dismissing the freshly opened menu (only a real page
  // scroll, below, should close it).
  await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
  await expect(languageTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(languageListbox).toBeVisible();

  const lastOption = options.last();
  await expect(lastOption).toBeInViewport();
  await lastOption.hover();
  await expect(languageListbox).toBeVisible();

  // Keyboard paging to the last option calls scrollIntoView() on the listbox; the
  // menu must stay open and move the active option all the way to the bottom.
  await page.keyboard.press('End');
  await expect(languageTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(languageListbox).toBeVisible();
  await expect(lastOption).toHaveAttribute('data-active', '');
  await expect(languageTrigger).toHaveAttribute(
    'aria-activedescendant',
    (await lastOption.getAttribute('id')) ?? ''
  );

  // Scrolling the page (not the listbox) still dismisses the menu as intended.
  await page.evaluate(() => window.scrollBy(0, -8));
  await expect(languageTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(languageListbox).toBeHidden();
});

test('language selector closes when an ancestor element scrolls', async ({ page }) => {
  await page.goto('/get-started/aspire-vscode-extension/');
  await dismissCookieConsentIfVisible(page);

  const languageTrigger = page.getByRole('combobox', { name: 'Select language' });
  const languageListbox = page.locator('#footer-language-select-listbox');

  await languageTrigger.click();
  await expect(languageListbox).toBeVisible();

  // Regression: the open-time guard that ignores a stale, same-offset scroll keys
  // off window.scrollX/Y, which do NOT move when an ancestor *element* (e.g. a
  // scrollable modal body) scrolls. That scroll still slides the trigger out from
  // under the position:fixed listbox, so an element scroll must always dismiss the
  // menu — only page/window scrolls are eligible for the stale-offset guard.
  const dispatched = await page.evaluate(() => {
    const listbox = document.getElementById('footer-language-select-listbox');
    const root = listbox?.closest('[data-custom-select]');
    const ancestor = root?.parentElement;
    if (!ancestor || ancestor === document.body || ancestor === document.documentElement) {
      return false;
    }
    ancestor.dispatchEvent(new Event('scroll'));
    return true;
  });
  expect(dispatched).toBe(true);
  await expect(languageTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(languageListbox).toBeHidden();
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

test('Aspire 13.5 preserves published section anchors', async ({ page }) => {
  test.skip(
    page.viewportSize()?.width !== 1440,
    'The release-note anchor contract only needs one browser project.'
  );

  await page.goto('/whats-new/aspire-13-5/');

  for (const anchor of [
    'deployment-and-integrations',
    'new-and-updated-integrations',
    'breaking-changes',
    'known-issues',
  ]) {
    await expect(page.locator(`#${anchor}`), `Expected one #${anchor} target`).toHaveCount(1);
  }
});

test('docs reading hierarchy adapts across themes and responsive widths', async ({ page }) => {
  test.skip(
    page.viewportSize()?.width !== 1440,
    'The responsive matrix is covered once from the desktop project with explicit viewport sizes.'
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/whats-new/aspire-13-5/');
  await dismissCookieConsentIfVisible(page);
  const mobileWordSpacingByTheme = new Map<'light' | 'dark', number>();

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('starlight-theme', value), theme);
    await page.reload();
    await dismissCookieConsentIfVisible(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    let expectedAsideBackground: string | undefined;

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 834, height: 1112 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo(0, 0));

      const content = page.locator('.sl-markdown-content');
      const copyButton = content.locator('figure.frame .copy button').first();
      await expect(content).toBeVisible();
      await expect(copyButton).toBeVisible();

      const metrics = await content.evaluate((root) => {
        const paragraph = root.querySelector<HTMLElement>(':scope > p');
        const inlineCode = root.querySelector<HTMLElement>('p code');
        const strong = root.querySelector<HTMLElement>('strong');
        const asideCode = root.querySelector<HTMLElement>('.starlight-aside code');
        const codeAside = asideCode?.closest<HTMLElement>('.starlight-aside');
        const asideLink = root.querySelector<HTMLElement>(
          '.starlight-aside__content a:not([role="tab"])'
        );
        const codeTitleIcon = root.querySelector<HTMLElement>('.code-block-icon');
        const paragraphStyle = paragraph ? getComputedStyle(paragraph) : null;
        const inlineCodeStyle = inlineCode ? getComputedStyle(inlineCode) : null;
        const asideCodeStyle = asideCode ? getComputedStyle(asideCode) : null;
        const codeAsideStyle = codeAside ? getComputedStyle(codeAside) : null;
        const asideLinkStyle = asideLink ? getComputedStyle(asideLink) : null;

        const spacing = (value: string | undefined) =>
          value === undefined || value === 'normal' ? 0 : Number.parseFloat(value);

        return {
          bodyFontSize: spacing(paragraphStyle?.fontSize),
          asideCodeBackgroundDiffers:
            asideCodeStyle?.backgroundColor !== codeAsideStyle?.backgroundColor,
          asideCodeUsesBodyText: asideCodeStyle?.color === codeAsideStyle?.color,
          asideBackground: codeAsideStyle?.backgroundColor,
          asideLinkBackground: asideLinkStyle?.backgroundColor,
          asideLinkDecoration: asideLinkStyle?.textDecorationLine,
          asideLinkPadding: asideLinkStyle?.padding,
          codeTitleIconDisplay: codeTitleIcon ? getComputedStyle(codeTitleIcon).display : null,
          contentWidth: root.getBoundingClientRect().width,
          documentOverflows:
            document.documentElement.scrollWidth > document.documentElement.clientWidth,
          inlineCodeBorderWidth: spacing(inlineCodeStyle?.borderTopWidth),
          inlineCodeFontSize: spacing(inlineCodeStyle?.fontSize),
          letterSpacing: spacing(paragraphStyle?.letterSpacing),
          paragraphWidth: paragraph?.getBoundingClientRect().width ?? 0,
          strongWeight: strong ? Number.parseInt(getComputedStyle(strong).fontWeight, 10) : 0,
          wordSpacing: spacing(paragraphStyle?.wordSpacing),
        };
      });

      expect(metrics.bodyFontSize).toBeGreaterThanOrEqual(16);
      expect(metrics.inlineCodeFontSize).toBe(metrics.bodyFontSize);
      expect(metrics.inlineCodeBorderWidth).toBe(0);
      expect(metrics.strongWeight).toBe(600);
      expect(metrics.asideCodeBackgroundDiffers).toBe(true);
      expect(metrics.asideCodeUsesBodyText).toBe(true);
      expectedAsideBackground ??= metrics.asideBackground;
      expect(metrics.asideBackground).toBe(expectedAsideBackground);
      expect(metrics.asideLinkBackground).toBe('rgba(0, 0, 0, 0)');
      expect(metrics.asideLinkDecoration).toContain('underline');
      expect(metrics.asideLinkPadding).toBe('0px');
      expect(metrics.documentOverflows).toBe(false);

      if (viewport.width < 800) {
        expect(metrics.letterSpacing).toBeGreaterThan(0);
        expect(metrics.wordSpacing).toBeGreaterThan(0);
        expect(metrics.codeTitleIconDisplay).toBe('none');
        if (viewport.width === 390) {
          mobileWordSpacingByTheme.set(theme, metrics.wordSpacing);
        }
      } else {
        expect(metrics.letterSpacing).toBe(0);
        expect(metrics.wordSpacing).toBe(0);
        expect(metrics.codeTitleIconDisplay).not.toBe('none');
      }

      if (viewport.width === 390) {
        const tabs = content.locator('starlight-tabs[data-sync-key="aspire-lang"]').first();
        const typeScriptTab = tabs.getByRole('tab', { name: 'TypeScript' });
        await typeScriptTab.click();
        await expect(typeScriptTab).toHaveAttribute('aria-selected', 'true');

        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const scrollToTop = page.locator('#scroll-to-top-button');
        await expect(scrollToTop).toBeVisible();
        await expect
          .poll(() =>
            scrollToTop.evaluate((button) => {
              const bounds = button.getBoundingClientRect();
              return [Math.round(bounds.width), Math.round(bounds.height)];
            })
          )
          .toEqual([48, 48]);
        await scrollToTop.click();
        await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(0);
      }

      if (viewport.width === 1920) {
        expect(Math.abs(metrics.paragraphWidth - metrics.contentWidth)).toBeLessThanOrEqual(1);
      }
    }
  }

  const lightWordSpacing = mobileWordSpacingByTheme.get('light');
  const darkWordSpacing = mobileWordSpacingByTheme.get('dark');
  if (lightWordSpacing === undefined || darkWordSpacing === undefined) {
    throw new Error('Missing mobile word-spacing metrics for one or more themes.');
  }
  expect(darkWordSpacing).toBeCloseTo(lightWordSpacing, 3);
});

test('docs reading hierarchy leaves the API reference canvas unconstrained', async ({ page }) => {
  test.slow();
  test.skip(
    page.viewportSize()?.width !== 1440,
    'The API reference guard is covered once from the desktop project.'
  );

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/reference/api/csharp/');
  await dismissCookieConsentIfVisible(page);
  await waitForApiSidebarReady(page);

  const layout = await page.locator('.api-ref-landing').evaluate((landing) => {
    const content = landing.closest<HTMLElement>('.sl-markdown-content');
    const landingWidth = landing.getBoundingClientRect().width;
    const contentWidth = content?.getBoundingClientRect().width ?? 0;

    return {
      documentOverflows:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
      fillsTechnicalCanvas: Math.abs(landingWidth - contentWidth) <= 1,
    };
  });

  expect(layout).toEqual({
    documentOverflows: false,
    fillsTechnicalCanvas: true,
  });
});
