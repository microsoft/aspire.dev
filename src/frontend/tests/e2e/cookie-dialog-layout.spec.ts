import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const consentStyles = ['aspire-brand.css', 'wcp-consent.css']
  .map((file) => readFileSync(new URL(`../../src/styles/${file}`, import.meta.url), 'utf8'))
  .join('\n');

// Mirror WCP's panel/document/form structure and conflicting layout defaults.
// Deliberately use different class names: production overrides must not depend on vendor hashes.
const fixture = `
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      --sl-font-system: sans-serif;
      --sl-color-bg: var(--aspire-color-white);
      --sl-color-text: var(--aspire-color-black);
      --sl-color-gray-5: #ddd;
      --sl-color-text-accent: #6233b8;
      --sl-color-accent-high: #4e238c;
      --sl-shadow-lg: 0 8px 24px #0003;
      --aspire-color-light: var(--aspire-color-muted);
    }
    :root[data-theme='light'] {
      --aspire-color-muted: #66697e;
    }
    :root[data-theme='dark'] {
      --sl-color-bg: #181818;
      --sl-color-text: #eee;
      --sl-color-gray-5: #444;
    }
    body { margin: 0; }
    .vendor-overlay {
      position: fixed; inset: 0; width: 100%; height: 100%; overflow: auto;
    }
    .vendor-panel {
      position: relative; top: 8%; width: 640px;
      margin: 0 auto 40px; box-sizing: border-box;
    }
    .vendor-close { float: right; margin: 2px; padding: 12px; z-index: 1; }
    [dir='rtl'] .vendor-close { float: left; }
    .vendor-body { margin: 36px 36px 0; }
    h1 { margin: 0 0 12px; font-size: 1.125rem; line-height: 1.5; }
    p { line-height: 1.5; }
    .vendor-actions { margin: 20px 0 48px; }
    .vendor-actions button { width: 278px; height: 36px; float: right; }
    @media (max-width: 640px) {
      .vendor-overlay { overflow: hidden; }
      .vendor-panel { top: 1.8%; width: 93.33%; height: 96.4%; overflow: hidden; }
      .vendor-body { margin: 24px 24px 0; height: 100%; }
    }
  </style>
  <div id="wcpCookiePreferenceCtrl" class="vendor-overlay">
    <div role="presentation" tabindex="-1"></div>
    <div role="dialog" aria-modal="true" aria-label="Manage cookie preferences" class="vendor-panel">
      <button class="vendor-close" aria-label="Close">&#x2715;</button>
      <div role="document" class="vendor-body">
        <div><h1>Manage cookie preferences</h1></div>
        <form>
          <p>Choose which optional cookies this website can use.</p>
          ${['Required', 'Analytics', 'Social media', 'Advertising']
            .map(
              (category, index) => `
                <fieldset>
                  <legend>${category}</legend>
                  <p>${'Review this category and choose whether to allow these cookies. '.repeat(8)}</p>
                  <label><input type="radio" name="category-${index}" value="yes"> Allow ${category}</label>
                  <label><input type="radio" name="category-${index}" value="no"> Reject ${category}</label>
                </fieldset>`
            )
            .join('')}
        </form>
        <div class="vendor-actions"><button>Save changes</button><button>Reset all</button></div>
      </div>
    </div>
  </div>
`;

for (const theme of ['light', 'dark']) {
  for (const surface of ['banner', 'dialog']) {
    test(`cookie ${surface} uses accessible primary-action colors in ${theme} mode`, async ({
      page,
    }) => {
      await page.setContent(fixture);
      await page.addStyleTag({ content: consentStyles });
      await page.evaluate(
        ({ theme, surface }) => {
          document.documentElement.dataset.theme = theme;
          if (surface === 'banner') {
            document.getElementById('wcpCookiePreferenceCtrl')!.remove();
            const banner = document.createElement('div');
            banner.id = 'wcpConsentBannerCtrl';
            banner.innerHTML =
              '<button>Accept</button><button>Reject</button><button>Manage cookies</button>';
            document.body.append(banner);
          }
        },
        { theme, surface }
      );

      const container = surface === 'banner' ? '#wcpConsentBannerCtrl' : '#wcpCookiePreferenceCtrl';
      const primary = page.locator(container).getByRole('button', {
        name: surface === 'banner' ? 'Accept' : 'Save changes',
        exact: true,
      });
      const colors = await page.evaluate(() => {
        const probe = document.createElement('span');
        document.body.append(probe);
        const resolve = (token: string) => {
          probe.style.color = `var(${token})`;
          return getComputedStyle(probe).color;
        };
        const colors = {
          background: resolve('--aspire-action-primary'),
          hover: resolve('--aspire-action-primary-hover'),
          text: resolve('--aspire-action-primary-text'),
        };
        probe.remove();
        return colors;
      });
      await expect(primary).toHaveCSS('background-color', colors.background);
      await expect(primary).toHaveCSS('border-top-color', colors.background);
      await expect(primary).toHaveCSS('color', colors.text);
      expect(
        (await new AxeBuilder({ page }).include(container).withRules(['color-contrast']).analyze())
          .violations
      ).toEqual([]);

      await primary.hover();
      await expect(primary).toHaveCSS('background-color', colors.hover);
      await expect(primary).toHaveCSS('border-top-color', colors.hover);
      await expect(primary).toHaveCSS('color', colors.text);
      expect(
        (await new AxeBuilder({ page }).include(container).withRules(['color-contrast']).analyze())
          .violations
      ).toEqual([]);
    });
  }

  for (const direction of ['ltr', 'rtl']) {
    test(`cookie dialog keeps its close control and actions inset in ${theme} ${direction}`, async ({
      page,
    }) => {
      await page.setContent(fixture);
      await page.addStyleTag({ content: consentStyles });
      await page.evaluate(
        ({ theme, direction }) => {
          document.documentElement.dataset.theme = theme;
          document.getElementById('wcpCookiePreferenceCtrl')!.dir = direction;
        },
        { theme, direction }
      );

      const projectViewport = page.viewportSize()!;
      for (const viewport of [
        projectViewport,
        { width: 320, height: 568 },
        { width: 844, height: 390 },
      ]) {
        await page.setViewportSize(viewport);
        const dialog = page.getByRole('dialog');
        const close = dialog.getByRole('button', { name: 'Close', exact: true });
        const heading = dialog.getByRole('heading');
        const form = dialog.locator('form');
        const actions = dialog.locator('[role="document"] > div:last-child');

        const panelBox = (await dialog.boundingBox())!;
        const closeBox = (await close.boundingBox())!;
        const headingBox = (await heading.boundingBox())!;
        const actionsBox = (await actions.boundingBox())!;
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        // Keep the panel clear of the viewport edges without pinning its padding or max-width.
        expect(panelBox.x).toBeGreaterThan(0);
        expect(panelBox.y).toBeGreaterThan(0);
        expect(panelBox.x + panelBox.width).toBeLessThan(clientWidth);
        expect(panelBox.y + panelBox.height).toBeLessThan(viewport.height);
        expect(Math.abs(panelBox.x + panelBox.width / 2 - clientWidth / 2)).toBeLessThanOrEqual(1);
        expect(closeBox.width).toBeGreaterThanOrEqual(44);
        expect(closeBox.height).toBeGreaterThanOrEqual(44);
        expect(closeBox.y).toBeGreaterThan(panelBox.y);
        expect(closeBox.x).toBeGreaterThan(panelBox.x);
        expect(closeBox.x + closeBox.width).toBeLessThan(panelBox.x + panelBox.width);
        expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(actionsBox.y);
        if (direction === 'ltr') {
          expect(headingBox.x + headingBox.width).toBeLessThanOrEqual(closeBox.x);
        } else {
          expect(headingBox.x).toBeGreaterThanOrEqual(closeBox.x + closeBox.width);
        }
        expect(headingBox.y).toBeGreaterThan(panelBox.y);
        const formBox = (await form.boundingBox())!;
        expect(headingBox.y + headingBox.height).toBeLessThanOrEqual(formBox.y);
        expect(formBox.height).toBeGreaterThan(0);
        expect(formBox.y + formBox.height).toBeLessThanOrEqual(actionsBox.y + 1);
        expect(actionsBox.y + actionsBox.height).toBeLessThan(panelBox.y + panelBox.height);
        for (const button of await actions.getByRole('button').all()) {
          const box = (await button.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(panelBox.x);
          expect(box.x + box.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
        }
        expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        expect(await form.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        await form.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        expect(await form.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
        expect((await close.boundingBox())!.y).toBeCloseTo(closeBox.y, 0);
        await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeInViewport();
        await close.focus();
        await expect(close).toBeFocused();
        await expect(close).toHaveCSS('outline-style', 'solid');
      }
    });
  }
}

test('cookie dialog remains usable with larger text', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 720 });
  await page.setContent(fixture);
  await page.addStyleTag({ content: consentStyles });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const dialog = page.getByRole('dialog');
  const form = dialog.locator('form');
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect((await form.boundingBox())!.height).toBeGreaterThan(0);
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeInViewport();
});
