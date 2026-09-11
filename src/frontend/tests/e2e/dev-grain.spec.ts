import { expect, test } from '@playwright/test';
import sharp from 'sharp';

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
    ['Browse', '/dev/browse/?type=guide', '.browse-card-artwork:visible'],
    ['Quickstart', '/dev/', '.resource-primary .resource-card'],
  ]) {
    test(`${surface} ${theme} grain is fine, irregular, restrained, and edge-biased`, async ({ page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(route);
        if (surface === 'Browse') await expect(page.locator('resource-browser')).toHaveAttribute('data-ready', '');
        await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
        await page.evaluate(() => document.fonts.ready);
        const target = page.locator(selector).first();
        await target.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        const options = { scale: 'css', animations: 'disabled' } as const;
        const image = await target.screenshot(options);
        expect(await target.screenshot(options), 'Texture must not animate or reshuffle').toEqual(image);
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
        const edge = (surface === 'Browse'
          ? [region(16, 16), region(info.width - 80, 16), region(16, info.height - 80), region(info.width - 80, info.height - 80)]
          : [region(info.width - 80, 16)]).reduce((a, b) => a.mean > b.mean ? a : b);
        const quiet = surface === 'Browse'
          ? region(Math.floor(info.width / 2) - 32, Math.floor(info.height / 2) - 32)
          : region(16, 16);
        await testInfo.attach(`${width}px texture statistics`, { body: JSON.stringify({ edge, quiet }), contentType: 'application/json' });
        expect(edge.deviation, 'Visible fine speckle, not a flat tint').toBeGreaterThan(0.2);
        expect(edge.mean, 'Decorative grain must remain low contrast').toBeLessThan(12);
        expect(edge.repetition, 'No dominant rows, columns, or diagonal repeat').toBeLessThan(0.45);
        expect(edge.mean, 'Keep texture away from the icon/text focus').toBeGreaterThan(quiet.mean * 1.5);
      }
    });
  }
}
