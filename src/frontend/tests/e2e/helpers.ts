import { expect, type Locator, type Page } from '@playwright/test';

export async function expectSearchFieldLayout(input: Locator): Promise<void> {
  const field = input.locator('..');
  const icon = field.locator('.search-field-icon');
  const clear = field.locator('.search-field-clear');
  await expect(input).toBeVisible();
  await expect(icon).toBeVisible();
  await expect
    .poll(() => input.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const icon = element.parentElement!.querySelector('.search-field-icon')!;
      const iconBox = icon.getBoundingClientRect();
      const clear = element.parentElement!.querySelector('.search-field-clear')!;
      const clearBox = clear.getBoundingClientRect();
      const textLeft = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
      const textRight = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
      // One CSS pixel accommodates subpixel layout and browser rounding.
      const tolerance = 1;
      const contains = (child: DOMRect) =>
        child.left >= box.left - tolerance && child.right <= box.right + tolerance &&
        child.top >= box.top - tolerance && child.bottom <= box.bottom + tolerance;
      const centered = (child: DOMRect) =>
        Math.abs(child.top + child.height / 2 - (box.top + box.height / 2)) <= tolerance;
      const clearVisible = clearBox.width > 0 && clearBox.height > 0;
      return {
        // Smaller inputs trigger automatic zoom when focused in iOS.
        readable: parseFloat(style.fontSize) >= 16,
        textFits: textRight > textLeft && box.height >= parseFloat(style.lineHeight),
        iconContained: contains(iconBox),
        iconCentered: centered(iconBox),
        iconClearOfText: iconBox.right <= textLeft + tolerance,
        clearContained: !clearVisible || contains(clearBox),
        clearCentered: !clearVisible || centered(clearBox),
        clearOfText: !clearVisible || clearBox.left >= textRight - tolerance,
      };
    }))
    .toEqual({
      readable: true,
      textFits: true,
      iconContained: true,
      iconCentered: true,
      iconClearOfText: true,
      clearContained: true,
      clearCentered: true,
      clearOfText: true,
    });
  if (await clear.isVisible()) {
    // WCAG 2.2 target-size minimum; larger design-system targets may evolve.
    const box = (await clear.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);
  }
}

export async function getSiteNavigationLink(page: Page, href: string): Promise<Locator> {
  const headerLink = page.locator(`header a[href="${href}"]:visible`);
  if (await headerLink.count()) return headerLink;

  const menu = page.locator('starlight-menu-button button');
  await expect(menu).toBeVisible();
  if (await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
  const link = page.locator(`.mobile-site-links a[href="${href}"]`);
  await expect(link).toBeVisible();
  return link;
}

export async function resetCookieConsentState(page: Page): Promise<void> {
  await page.context().clearCookies();
}

// WCP decides per runner region whether to show its banner. When shown, the banner
// pushes `.page` down and reveals the cookie button, so layout assertions need the
// no-consent state. A cached `false` alone does not stop live WCP showing the banner.
export async function emulateConsentNotRequiredRegion(page: Page): Promise<void> {
  await page.route(/wcpstatic\.microsoft\.com/, (route) => route.abort());
  await page.addInitScript(() => localStorage.setItem('aspireConsentRequired', 'false'));
}

export async function dismissCookieConsentIfVisible(page: Page): Promise<void> {
  const siteTourDismissButton = page.locator('[data-tour-action="dismiss"]');
  if (await siteTourDismissButton.isVisible().catch(() => false)) {
    await siteTourDismissButton.click();
  }

  const rejectAllButton = page
    .locator('#wcp-cookie-banner')
    .getByRole('button', { name: /^reject(?: all)?$/i });
  if (await rejectAllButton.isVisible().catch(() => false)) {
    await rejectAllButton.click();
    await expect(rejectAllButton).toBeHidden().catch(() => {});
  }
  // WCP can finish loading after the initial page render.
  await page
    .addLocatorHandler(rejectAllButton, async (button) => {
      await button.click();
    })
    .catch(() => {});
}

export async function waitForAccessibilityEnhancements(page: Page): Promise<void> {
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.dataset.accessibilityEnhancementsReady ?? null)
    )
    .toBe('true');
}

export async function waitForApiSidebarReady(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'C# API Reference' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.hasAttribute('data-api-sidebar-ready'))
    )
    .toBe(true);
  await expect(page.locator('#sidebar-collapse-btn')).toBeAttached();
  await expect(page.locator('#sidebar-expand-btn')).toBeAttached();
  // Topics list (always-visible after the layout restructure) must
  // render with at least one link before downstream tests interact.
  await expect(
    page.locator('.topics-sidebar[data-api-ref] .starlight-sidebar-topics').first()
  ).toBeVisible();
  await expect
    .poll(async () => {
      const isCollapsed = await page.evaluate(() =>
        document.documentElement.hasAttribute('data-sidebar-collapsed')
      );
      const collapseVisible = await page.locator('#sidebar-collapse-btn').isVisible();
      const expandVisible = await page.locator('#sidebar-expand-btn').isVisible();

      return isCollapsed ? expandVisible && !collapseVisible : collapseVisible && !expandVisible;
    })
    .toBe(true);
}

export async function waitForTopicSidebarReady(page: Page): Promise<void> {
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.hasAttribute('data-topic-sidebar-ready'))
    )
    .toBe(true);
  await expect(page.locator('#topic-sidebar-collapse-btn')).toBeAttached();
  await expect(page.locator('#topic-sidebar-expand-btn')).toBeAttached();
  await expect(page.locator('#sidebar-filter-input')).toBeAttached();
  // Topics list (always-visible after the layout restructure) must
  // render with at least one link before downstream tests interact.
  await expect(
    page.locator('.topics-sidebar[data-topic-nav] .starlight-sidebar-topics').first()
  ).toBeVisible();
  await expect
    .poll(async () => {
      const isCollapsed = await page.evaluate(() =>
        document.documentElement.hasAttribute('data-topic-sidebar-collapsed')
      );
      const collapseVisible = await page.locator('#topic-sidebar-collapse-btn').isVisible();
      const expandVisible = await page.locator('#topic-sidebar-expand-btn').isVisible();

      return isCollapsed ? expandVisible && !collapseVisible : collapseVisible && !expandVisible;
    })
    .toBe(true);
}

export function isNarrowViewport(page: Page): boolean {
  const viewport = page.viewportSize();
  return Boolean(viewport && viewport.width < 800);
}

export async function revealMobileSiteMenu(page: Page): Promise<void> {
  const button = page.locator('starlight-menu-button button');
  if (await button.isVisible() && await button.getAttribute('aria-expanded') !== 'true') {
    await button.click();
  }
}
