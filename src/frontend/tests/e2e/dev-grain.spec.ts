import { expect, test } from '@playwright/test';
import sharp from 'sharp';

for (const route of ['/hub/browse/', '/hub/glossary/']) {
  test(`${route} controls container reuses passive static Hub grain`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('aspireConsentRequired', 'false'));
    await page.goto(`${route}?q=zzzz-no-match&topic=foundations`);
    const empty = page.locator('.search-empty:visible');
    const controls = page.locator('.browse-controls, .glossary-filter-panel');
    await expect(empty).toBeVisible();
    await expect(empty).not.toHaveClass(/hub-grain/);
    await page.evaluate(() => document.fonts.ready);
    for (const theme of ['light', 'dark']) {
      await page.locator('html').evaluate((html, value) => html.dataset.theme = value, theme);
      const texture = await controls.evaluate((element) => {
        const style = getComputedStyle(element, '::before');
        return { image: style.backgroundImage, opacity: style.opacity, pointerEvents: style.pointerEvents, animation: style.animationName };
      });
      expect(texture.image).toContain('repeating-conic-gradient');
      expect(texture.opacity).toBe('0.11');
      expect(texture.pointerEvents).toBe('none');
      expect(texture.animation).toBe('none');
      const options = { animations: 'disabled', scale: 'css' } as const;
      const image = await controls.screenshot(options);
      const { width } = await sharp(image).metadata();
      // Measure exposed background, not text, focus, or rounded-border rasterization.
      const strip = { left: 16, top: 3, width: width! - 32, height: 10 };
      const pixels = await sharp(image).extract(strip).removeAlpha().raw().toBuffer();
      const nextPixels = await sharp(await controls.screenshot(options)).extract(strip).removeAlpha().raw().toBuffer();
      expect(pixels.equals(nextPixels)).toBe(true);
      const hidden = await page.addStyleTag({ content: '.hub-grain::before { opacity: 0 !important; }' });
      const baselineImage = await controls.screenshot(options);
      await hidden.evaluate((element) => element.remove());
      const baseline = await sharp(baselineImage).extract(strip).removeAlpha().raw().toBuffer();
      let difference = 0;
      for (let index = 0; index < pixels.length; index++) difference += Math.abs(pixels[index] - baseline[index]);
      const meanDifference = difference / pixels.length;
      expect(meanDifference, 'The grain must actually render').toBeGreaterThan(0.02);
      expect(meanDifference, 'The texture must remain subtle behind the text').toBeLessThan(8);
    }
    await page.emulateMedia({ forcedColors: 'active' });
    expect(await controls.evaluate((element) => getComputedStyle(element, '::before').display)).toBe('none');
    await page.emulateMedia({ forcedColors: 'none' });
    await empty.getByRole('button', { name: 'Clear search', exact: true }).click();
    await expect(empty).toBeHidden();
    await expect(page.locator('main .search-field-input')).toBeFocused();
    await expect(page).toHaveURL(/topic=foundations/);
    await expect.poll(() => new URL(page.url()).searchParams.has('q')).toBe(false);
    if (route === '/hub/browse/') {
      await page.locator('[data-filter-group="type"] summary').click();
      if (page.viewportSize()!.width < 600) {
        expect(await page.evaluate(() => {
          const headerBottom = document.querySelector('header')!.getBoundingClientRect().bottom;
          return document.elementFromPoint(4, Math.ceil(headerBottom + 1))?.classList.contains('browse-filter-backdrop');
        })).toBe(true);
      }
      await page.locator('[data-filter-group="type"] input[value="glossary"]').check();
      await expect(page).toHaveURL(/type=glossary/);
    }
  });
}

function textureStats(pixels: number[], size: number) {
  const mean = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  const centered = pixels.map((value) => value - mean);
  const deviation = Math.sqrt(centered.reduce((sum, value) => sum + value ** 2, 0) / pixels.length);
  let repetition = 0;
  // A tiled dot/grid texture has strongly correlated rows or columns at its repeat interval.
  for (let shift = 2; shift <= 24; shift++) {
    for (const [dx, dy] of [[shift, 0], [0, shift], [shift, shift], [shift, -shift]]) {
      let product = 0;
      let energyA = 0;
      let energyB = 0;
      for (let y = Math.max(0, -dy); y < size - Math.max(0, dy); y++) {
        for (let x = 0; x < size - dx; x++) {
          const a = centered[y * size + x];
          const b = centered[(y + dy) * size + x + dx];
          product += a * b;
          energyA += a * a;
          energyB += b * b;
        }
      }
      repetition = Math.max(repetition, product / Math.sqrt(energyA * energyB || 1));
    }
  }
  return { mean, deviation, repetition };
}

for (const theme of ['light', 'dark']) {
  for (const [surface, route, selector] of [
    ['Browse', '/hub/browse/?type=guide', '.browse-card-artwork:visible'],
  ]) {
    test(`${surface} ${theme} grain is fine, irregular, restrained, and edge-biased`, async ({ page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(route);
        await expect(page.locator('resource-browser')).toHaveAttribute('data-ready', '');
        await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
        await page.evaluate(() => document.fonts.ready);
        const target = page.locator(selector).first();
        await target.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        // Lazy language icons are part of the capture, but not the texture under test.
        await target.evaluate((element) =>
          Promise.all([...element.querySelectorAll('img')].map((image) => image.decode())));
        // Fractional-width rounded borders can rasterize differently between captures.
        const options = {
          scale: 'css',
          animations: 'disabled',
          style: `${selector.replace(':visible', '')} { border-radius: 0 !important; }`,
        } as const;
        const image = await target.screenshot(options);
        const nextImage = await target.screenshot(options);
        if (!image.equals(nextImage)) {
          await testInfo.attach(`${width}px first capture`, { body: image, contentType: 'image/png' });
          await testInfo.attach(`${width}px second capture`, { body: nextImage, contentType: 'image/png' });
        }
        expect(image.equals(nextImage), 'Texture must not animate or reshuffle').toBe(true);
        const hidden = await page.addStyleTag({ content: `${selector.replace(':visible', '')}::before { opacity: 0 !important; }` });
        const withoutTexture = await target.screenshot(options);
        await hidden.evaluate((element) => element.remove());
        const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const baseline = await sharp(withoutTexture).removeAlpha().raw().toBuffer();
        const region = (left: number, top: number) => {
          const pixels: number[] = [];
          for (let y = top; y < top + 64; y++) {
            for (let x = left; x < left + 64; x++) {
              const offset = (y * info.width + x) * info.channels;
              pixels.push((Math.abs(data[offset] - baseline[offset]) + Math.abs(data[offset + 1] - baseline[offset + 1]) + Math.abs(data[offset + 2] - baseline[offset + 2])) / 3);
            }
          }
          return textureStats(pixels, 64);
        };
        const edge = [region(16, 16), region(info.width - 80, 16), region(16, info.height - 80), region(info.width - 80, info.height - 80)]
          .reduce((a, b) => a.mean > b.mean ? a : b);
        const quiet = region(Math.floor(info.width / 2) - 32, Math.floor(info.height / 2) - 32);
        await testInfo.attach(`${width}px texture statistics`, { body: JSON.stringify({ edge, quiet }), contentType: 'application/json' });
        expect(edge.deviation, 'Visible fine speckle, not a flat tint').toBeGreaterThan(0.2);
        expect(edge.mean, 'Decorative grain must remain low contrast').toBeLessThan(12);
        expect(edge.repetition, 'No dominant rows, columns, or diagonal repeat').toBeLessThan(0.45);
        expect(edge.mean, 'Keep texture away from the icon/text focus').toBeGreaterThan(quiet.mean * 1.5);
      }
    });
  }
}
