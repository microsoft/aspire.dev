import { expect, test } from '@playwright/test';

import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

test('themed animations load one initial source and preserve playback when switching themes', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('starlight-theme', 'light'));
  const animationRequests: string[] = [];
  page.on('request', (request) => {
    if (/dashboard-geni-visualizer-(light|dark)/.test(request.url())) {
      animationRequests.push(request.url());
    }
  });

  await page.goto('/dashboard/explore/');
  await dismissCookieConsentIfVisible(page);
  const wrapper = page.locator('.looping-image-wrapper[data-themed-animation]');
  const image = wrapper.locator('img.looping-image');
  const button = wrapper.locator('.looping-image-toggle');
  const canvas = wrapper.locator('canvas');
  const prefersNoHover = await page.evaluate(() => window.matchMedia('(hover: none)').matches);

  async function togglePlayback() {
    if (prefersNoHover) {
      await wrapper.tap();
    } else {
      await wrapper.hover();
      await button.click();
    }
  }

  await expect(image).toHaveAttribute('src', /dashboard-geni-visualizer-light/);
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)
    )
    .toBe(true);
  expect(animationRequests.some((url) => url.includes('visualizer-light'))).toBe(true);
  expect(animationRequests.some((url) => url.includes('visualizer-dark'))).toBe(false);

  await wrapper.scrollIntoViewIfNeeded();
  await togglePlayback();
  await expect(button).toHaveAttribute('data-state', 'paused');
  await expect(canvas).toBeVisible();
  const lightPixel = await canvas.evaluate((element: HTMLCanvasElement) =>
    Array.from(element.getContext('2d')!.getImageData(0, 0, 1, 1).data)
  );

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await expect(image).toHaveAttribute('src', /dashboard-geni-visualizer-dark/);
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)
    )
    .toBe(true);
  await expect(button).toHaveAttribute('data-state', 'paused');
  await expect(canvas).toBeVisible();
  await expect
    .poll(() =>
      canvas.evaluate((element: HTMLCanvasElement) =>
        Array.from(element.getContext('2d')!.getImageData(0, 0, 1, 1).data)
      )
    )
    .not.toEqual(lightPixel);

  await togglePlayback();
  await expect(button).toHaveAttribute('data-state', 'playing');
  await expect(canvas).toBeHidden();
  await expect(image).toHaveCSS('opacity', '1');

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await expect(image).toHaveAttribute('src', /dashboard-geni-visualizer-light/);
  await expect(button).toHaveAttribute('data-state', 'playing');
});
