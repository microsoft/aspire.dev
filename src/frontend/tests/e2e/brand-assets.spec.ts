import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  brandAccents,
  brandAssets,
  brandColors,
  brandCssVariables,
  brandDeckUrl,
  brandGradients,
} from '../../src/data/brand';
import { dismissCookieConsentIfVisible } from './helpers';

declare global {
  interface Window {
    brandCopiedValues: string[];
    brandApprovedLinks: { href: string; target: string }[];
  }
}

const routes = [
  '/community/brand/',
  '/community/brand/logos/',
  '/community/brand/colors/',
  '/community/brand/typography/',
  '/community/brand/usage/',
];

test('brand social cards are served at their advertised image paths', async ({ page, request }) => {
  for (const route of routes) {
    await page.goto(route);
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    const twitterImage = await page.locator('meta[name="twitter:image"]').getAttribute('content');
    if (!ogImage) throw new Error(`No OG image advertised for ${route}`);
    expect(twitterImage).toBe(ogImage);
    const response = await request.get(new URL(ogImage).pathname);
    expect(response.ok(), ogImage).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
    const png = await response.body();
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  }
});

test('multiline external links keep a single inline suffix in lists and prose', async ({
  page,
}) => {
  await page.goto('/community/brand/logos/');
  await dismissCookieConsentIfVisible(page);
  const link = page.locator('.sl-markdown-content li a.resource-link');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(link.locator('p')).toHaveCSS('display', 'inline');
  await expect(link.locator('svg')).toHaveCount(1);
  await expect(link.locator('svg')).toHaveCSS('margin-top', '0px');

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    await link.scrollIntoViewIfNeeded();
    const layout = await link.evaluate((anchor) => {
      const label = anchor.querySelector('p');
      const icon = anchor.querySelector('svg');
      if (!label || !icon) throw new Error('Missing external-link label or icon.');
      const labelLines = [...label.getClientRects()];
      const lastLine = labelLines.at(-1);
      if (!lastLine) throw new Error('The external-link label has no rendered line.');
      const suffix = icon.getBoundingClientRect();
      return {
        suffixOnLastLine: suffix.top < lastLine.bottom && suffix.bottom > lastLine.top,
        suffixAfterText: suffix.left >= lastLine.right,
        duplicateSuffix: getComputedStyle(anchor, '::after').content,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(layout).toEqual({
      suffixOnLastLine: true,
      suffixAfterText: true,
      duplicateSuffix: 'none',
      horizontalOverflow: false,
    });
  }

  await page.goto('/community/brand/typography/');
  const proseLink = page.locator('.sl-markdown-content p > a.resource-link').first();
  await expect(proseLink.locator('svg')).toHaveCount(1);
  await expect(proseLink.locator('svg')).toHaveCSS('display', 'inline-block');
  await expect(proseLink.locator('svg')).toHaveCSS('margin-top', '0px');
});

test('footer leads to the local overview with focused navigation and an external deck link', async ({
  page,
}) => {
  await page.goto('/community/brand/usage/');
  await dismissCookieConsentIfVisible(page);
  const footerLink = page.locator(
    'nav[aria-labelledby="footer-resources-heading"] a[href="/community/brand/"]'
  );
  await expect(footerLink).not.toHaveAttribute('target');
  await footerLink.click();
  await expect(page).toHaveURL('/community/brand/');
  await expect(page.locator('main h1')).toHaveText('Aspire brand assets');
  for (const route of routes.slice(1)) {
    await expect(page.locator(`main a[href="${route}"]`).first()).toBeVisible();
    await expect(page.locator(`.sidebar-content a[href="${route}"]`).first()).toBeAttached();
  }
  const deck = page.getByRole('button', { name: 'Download PowerPoint' });
  await expect(deck).toHaveAttribute('value', brandDeckUrl);
  await expect(deck.locator('svg').first()).toBeVisible();
  await deck.click();
  const dialog = page.getByRole('dialog', { name: 'Review the brand guidelines' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Continue to download' })).toBeDisabled();
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(deck).toBeFocused();
  await expect(page.locator('main iframe, main object, main embed')).toHaveCount(0);
});

test('the PowerPoint link requires agreement and preserves its external destination', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((deckUrl) => {
    window.brandApprovedLinks = [];
    document.addEventListener(
      'click',
      (event) => {
        const link = event.target;
        if (link instanceof HTMLAnchorElement && link.href === deckUrl) {
          event.preventDefault();
          window.brandApprovedLinks.push({ href: link.href, target: link.target });
        }
      },
      true
    );
  }, brandDeckUrl);
  await page.goto('/community/brand/');
  await dismissCookieConsentIfVisible(page);
  await page.getByRole('button', { name: 'Download PowerPoint' }).click();
  const dialog = page.getByRole('dialog', { name: 'Review the brand guidelines' });
  await dialog.locator('form').evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => window.brandApprovedLinks)).toEqual([]);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    const scan = await new AxeBuilder({ page })
      .include('brand-download-gate > dialog')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(scan.violations.map(({ id }) => id)).toEqual([]);
  }
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('link', { name: 'artwork license' }).click();
  const licenseDialog = page.getByRole('dialog', { name: 'Artwork license', exact: true });
  await expect(licenseDialog).toBeVisible();
  const licenseText = licenseDialog.getByRole('textbox');
  await expect(licenseText).toHaveAttribute('readonly');
  await expect(licenseText).toHaveValue(/CC0 1.0 Universal/);
  expect(await licenseText.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true
  );
  await licenseDialog.getByRole('button', { name: 'Close artwork license' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox')).toBeChecked();
  await dialog.getByRole('button', { name: 'Continue to download' }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => window.brandApprovedLinks)).toEqual([
    { href: brandDeckUrl, target: '_blank' },
  ]);
  await page
    .getByRole('navigation', { name: 'Brand kit sections' })
    .getByRole('link', { name: 'Logos and icons', exact: true })
    .click();
  await page.locator('main a[href="/community/brand/usage/"]').first().click();
  await page.locator('main a[href="/community/brand/#presentation-materials"]').click();
  await page.getByRole('button', { name: 'Download PowerPoint' }).click();
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Continue to download' })).toBeDisabled();
  await page.keyboard.press('Escape');
});

test('all nine official SVGs render and are available as local downloads', async ({
  page,
  request,
}) => {
  await page.goto('/community/brand/logos/');
  await dismissCookieConsentIfVisible(page);
  for (const asset of brandAssets) {
    const response = await request.get(`/brand/${asset.file}`);
    expect(response.ok(), asset.file).toBe(true);
    expect(response.headers()['content-type']).toContain('image/svg+xml');
    const svg = await response.text();
    expect(svg).toContain('<svg');
    if (asset.kind === 'logo') expect(svg).not.toMatch(/<text\b|<image\b/);
    if (asset.kind !== 'icon' || asset.width === 256) {
      const image = page.locator(`main img[src="/brand/${asset.file}"]`);
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
        .toBe(true);
    }
    const button = page.locator(`button[data-brand-download][value="/brand/${asset.file}"]`);
    await button.click();
    const dialog = page.getByRole('dialog', { name: 'Review the brand guidelines' });
    await expect(dialog.getByRole('checkbox')).not.toBeChecked();
    await expect(dialog.getByRole('button', { name: 'Continue to download' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(button).toBeFocused();
  }
  await page.getByRole('button', { name: 'Download Horizontal logo, dark SVG' }).click();
  const dialog = page.getByRole('dialog', { name: 'Review the brand guidelines' });
  const proceed = dialog.getByRole('button', { name: 'Continue to download' });
  await dialog.getByRole('checkbox').check();
  await expect(proceed).toBeEnabled();
  const pendingDownload = page.waitForEvent('download');
  await proceed.click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe('aspire-logo-dark-horizontal.svg');
  expect(await download.failure()).toBeNull();
  await page.getByRole('button', { name: 'Download Horizontal logo, dark SVG' }).click();
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();
  await expect(proceed).toBeDisabled();
  await page.keyboard.press('Escape');
});

test('copies exact color, gradient, and CSS values after repeated navigation', async ({ page }) => {
  await page.addInitScript(() => {
    window.brandCopiedValues = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (value: string) => {
          window.brandCopiedValues.push(value);
          return Promise.resolve();
        },
      },
    });
  });
  await page.goto('/community/brand/');
  await dismissCookieConsentIfVisible(page);
  await page.locator('main a[href="/community/brand/colors/"]').click();
  let copyCount = 0;
  for (let visit = 0; visit < 2; visit++) {
    const previousCopies = await page.evaluate(() => window.brandCopiedValues.length);
    for (const { name, value } of [...brandColors, ...brandAccents, ...brandGradients]) {
      const button = page.getByRole('button', { name: `Copy ${name}`, exact: true });
      if (visit === 0 && name === 'Aspire primary') {
        await button.focus();
        await button.press('Enter');
      } else {
        await button.click();
      }
      await expect(button.locator('..').getByRole('status')).toHaveText('Copied.');
      const expectedValue = value.startsWith('linear-gradient(')
        ? value.replace('(', '(\n  ').replace(/\)$/, '\n)')
        : value;
      expect(await page.evaluate(() => window.brandCopiedValues.at(-1))).toBe(expectedValue);
    }
    const primary = page.getByRole('button', { name: 'Copy Aspire primary', exact: true });
    await primary.click();
    await expect(primary).toHaveAttribute('data-state', 'copied');
    await expect
      .poll(() =>
        primary.evaluate((button) => {
          const code = document.querySelector('main .expressive-code');
          if (!code) throw new Error('Missing code-copy theme.');
          const expected = document.createElement('span');
          expected.style.color = getComputedStyle(code).getPropertyValue(
            '--ec-frm-tooltipSuccessBg'
          );
          document.body.append(expected);
          const matches =
            getComputedStyle(expected).color === getComputedStyle(button).backgroundColor;
          expected.remove();
          return matches;
        })
      )
      .toBe(true);
    await expect(primary).not.toHaveAttribute('data-state', 'copied', { timeout: 4500 });
    await page.locator('main .expressive-code .copy button').click();
    expect(await page.evaluate(() => window.brandCopiedValues.at(-1))).toBe(brandCssVariables);
    copyCount += (await page.evaluate(() => window.brandCopiedValues.length)) - previousCopies;
    await page.locator('main a[href="/community/brand/usage/"]').click();
    await page.locator('main a[href="/community/brand/colors/"]').click();
  }
  expect(copyCount).toBe(36);
});

test('reports clipboard rejection without losing the selectable value', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('Clipboard access denied')) },
    });
  });
  await page.goto('/community/brand/colors/');
  await dismissCookieConsentIfVisible(page);
  const button = page.getByRole('button', { name: 'Copy Aspire primary', exact: true });
  await button.click();
  await expect(button.locator('..').getByRole('status')).toHaveText(
    'Could not copy. Select the value and copy it manually.'
  );
  await expect(button).toBeEnabled();
  await expect(button.locator('..').locator('code')).toHaveText('#7455DD');
});

test('brand content remains readable without JavaScript, while downloads require agreement', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/community/brand/colors/');
  await expect(page.getByRole('heading', { name: 'Core palette', exact: true })).toBeVisible();
  await expect(page.locator('brand-copy-value code').first()).toHaveText('#7455DD');
  await expect(page.locator('brand-copy-value button').first()).toBeHidden();
  await page.goto('/community/brand/logos/');
  await expect(page.locator('main button[data-brand-download]')).toHaveCount(9);
  for (const button of await page.locator('main button[data-brand-download]').all()) {
    await expect(button).toBeDisabled();
  }
  await expect(page.locator('brand-download-gate noscript p')).toBeVisible();
  await expect(page.locator('brand-download-gate noscript p')).toContainText(
    'Enable JavaScript to review the licensing agreement'
  );
  await context.close();
});

for (const route of routes) {
  test(`brand content is accessible and reflows in both themes: ${route}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(route);
    await dismissCookieConsentIfVisible(page);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
      const results = await new AxeBuilder({ page })
        .include('.sl-markdown-content')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.map(({ id, nodes }) => ({
          id,
          targets: nodes.map(({ target }) => target),
        }))
      ).toEqual([]);
    }
    await page.addStyleTag({
      content: `
      .sl-markdown-content * {
        line-height: 1.5 !important;
        letter-spacing: 0.12em !important;
        word-spacing: 0.16em !important;
      }
      .sl-markdown-content p { margin-bottom: 2em !important; }
    `,
    });
    await page.setViewportSize({ width: 320, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  });
}
