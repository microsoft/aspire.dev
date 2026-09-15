import { expect, test } from '@playwright/test';

test('Hub directory titles align with their page content', async ({ page }) => {
  for (const width of [320, 390, 834, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      const measure = async (route: string) => {
        const response = await page.goto(route);
        expect(response?.status()).toBe(200);
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
          window.scrollTo(0, 0);
          return document.fonts.ready;
        }, theme);
        return page.evaluate(() => {
          const title = document.querySelector<HTMLElement>('h1#_top')!;
          const container = title.parentElement!;
          const styles = getComputedStyle(container);
          const breadcrumbs = document.querySelector<HTMLElement>('.dev-breadcrumbs')!;
          const probe = document.createElement('div');
          probe.style.width = 'var(--sl-content-pad-x)';
          container.append(probe);
          const contentPadding = getComputedStyle(probe).width;
          probe.remove();
          return {
            paddingTop: styles.paddingTop,
            paddingRight: styles.paddingRight,
            paddingBottom: styles.paddingBottom,
            paddingLeft: styles.paddingLeft,
            titleMarginTop: getComputedStyle(title).marginTop,
            titleLeft: Math.round(title.getBoundingClientRect().left),
            contentLeft: Math.round(breadcrumbs.getBoundingClientRect().left),
            contentPadding,
          };
        });
      };

      for (const route of ['/hub/', '/hub/browse/', '/hub/glossary/']) {
        const spacing = await measure(route);
        expect(spacing, `${route} at ${width}px in ${theme}`).toEqual({
          paddingTop: '24px',
          paddingRight: spacing.contentPadding,
          paddingBottom: '24px',
          paddingLeft: spacing.contentPadding,
          titleMarginTop: '0px',
          titleLeft: spacing.contentLeft,
          contentLeft: spacing.contentLeft,
          contentPadding: spacing.contentPadding,
        });
      }
    }
  }
});
