import { expect, test, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';
import { renderMermaid } from '../../src/utils/mermaid.mjs';

async function expectCenteredDiagrams(page: Page): Promise<void> {
  const diagrams = page.locator('.sl-markdown-content pre.mermaid:visible');
  await expect(diagrams.first().locator(':scope > svg')).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => diagrams.evaluateAll((elements) => {
    return elements.every((element) => {
      const svg = element.querySelector('svg');
      if (!svg) return false;
      const container = element.getBoundingClientRect();
      const diagram = svg.getBoundingClientRect();
      const centerOffset = Math.abs(
        diagram.x + diagram.width / 2 - (container.x + container.width / 2),
      );
      return centerOffset < 2 && diagram.width <= container.width && diagram.height > 0;
    });
  }), { timeout: 15000 }).toBe(true);
}

async function navigateClient(page: Page, destination: string): Promise<void> {
  await page.evaluate((href) => {
    Reflect.set(window, '__mermaidPageLoaded', false);
    document.addEventListener('astro:page-load', () => {
      Reflect.set(window, '__mermaidPageLoaded', true);
    }, { once: true });
    // Use a real anchor to exercise ClientRouter even on mobile's collapsed sidebar.
    const link = document.createElement('a');
    link.id = 'mermaid-navigation-link';
    link.href = href;
    link.textContent = 'Navigate to diagram test page';
    link.style.cssText = 'position:fixed;top:80px;left:0;z-index:2147483647';
    document.body.append(link);
  }, destination);
  await page.locator('#mermaid-navigation-link').click();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__mermaidPageLoaded')), {
    timeout: 30000,
  }).toBe(true);
  await expect(page.locator('html[data-astro-transition]')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, '__mermaidSession'))).toBe(true);
}

for (const theme of ['light', 'dark'] as const) {
  test(`architecture labels and nested boxes have breathing room in ${theme} mode`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('starlight-theme', value), theme);
    await page.goto('/integrations/caching/redis/redis-get-started/');
    await dismissCookieConsentIfVisible(page);
    await expect(page.locator('svg.pele-architecture')).toBeVisible();
    const nested = renderMermaid(`architecture-beta
      group outer(server)[Application resources]
      group inner(server)[Wide WWW consuming application resources] in outer
      service app(server)[Application] in inner
      service cache(database)[Cache] in outer
      app:R --> L:cache`);
    await page.locator('pre.mermaid').evaluate((element, svg) => {
      const fixture = element.cloneNode(false) as HTMLElement;
      fixture.innerHTML = svg;
      element.after(fixture);
    }, nested);
    await page.evaluate(() => document.fonts.ready);
    const measurements = await page.locator('pre.mermaid').evaluateAll((diagrams) => {
      const paragraph = document.querySelector('.sl-markdown-content p')!;
      const contains = (outer: DOMRect, inner: DOMRect) => inner.left > outer.left
        && inner.right < outer.right && inner.top > outer.top && inner.bottom < outer.bottom;
      return diagrams.map((diagram) => {
        const svg = diagram.querySelector('svg')!;
        const svgBounds = svg.getBoundingClientRect();
        const groups = [...svg.querySelectorAll<SVGGElement>('.pele-cluster')];
        return {
          fontSize: getComputedStyle(svg).fontSize,
          bodyFontSize: getComputedStyle(paragraph).fontSize,
          fitsFrame: contains(diagram.getBoundingClientRect(), svgBounds),
          groups: groups.map((group) => {
            const rect = group.querySelector('rect')!;
            const bounds = rect.getBoundingClientRect();
            const icon = group.querySelector<SVGSVGElement>('svg')!;
            const label = group.querySelector('text')!;
            const text = label.getBoundingClientRect();
            return {
              gap: text.left - icon.getBoundingClientRect().right,
              fits: contains(bounds, text) && contains(svgBounds, bounds),
              dashed: getComputedStyle(rect).strokeDasharray !== 'none',
              fill: getComputedStyle(rect).fill,
              matchesServiceLabel: getComputedStyle(label).fill
                === getComputedStyle(svg.querySelector('.pele-service .pele-label')!).fill,
            };
          }),
          services: [...svg.querySelectorAll<SVGRectElement>('.pele-service > rect')].map((rect) => {
            const box = rect.getBoundingClientRect();
            const iconElement = rect.parentElement!.querySelector<SVGSVGElement>('svg')!;
            const icon = iconElement.getBoundingClientRect();
            const viewport = iconElement.viewBox.baseVal;
            // Center the viewport, not asymmetric artwork such as puzzle pieces and logos.
            const iconCenter = new DOMPoint(
              viewport.x + viewport.width / 2,
              viewport.y + viewport.height / 2,
            ).matrixTransform(iconElement.getScreenCTM()!);
            const label = rect.parentElement!.querySelector('text')!.getBoundingClientRect();
            // Check the innermost enclosing group so an ancestor cannot mask overlaps.
            const group = groups.filter((candidate) => {
              return contains(candidate.querySelector('rect')!.getBoundingClientRect(), box);
            }).sort((a, b) => {
              const first = a.querySelector('rect')!.getBoundingClientRect();
              const second = b.querySelector('rect')!.getBoundingClientRect();
              return first.width * first.height - second.width * second.height;
            })[0];
            const groupBounds = group?.querySelector('rect')!.getBoundingClientRect();
            const header = group?.querySelector('text')!.getBoundingClientRect();
            return {
              iconFits: contains(box, icon),
              // Allow subpixel rounding, not a particular icon or box size.
              centerOffset: Math.max(
                Math.abs(iconCenter.x - (box.x + box.width / 2)),
                Math.abs(iconCenter.y - (box.y + box.height / 2)),
              ),
              labelBelowBox: label.top > box.bottom,
              dash: getComputedStyle(rect).strokeDasharray,
              contained: groupBounds !== undefined && header !== undefined
                && contains(groupBounds, label) && box.top > header.bottom,
            };
          }),
          nestedClearance: groups.length === 2 && groups[0].dataset.id === 'outer'
            ? groups[1].querySelector('rect')!.getBoundingClientRect().top
              - groups[0].querySelector('text')!.getBoundingClientRect().bottom
            : null,
        };
      });
    });
    for (const diagram of measurements) {
      expect(diagram.fontSize).toBe(diagram.bodyFontSize);
      expect(diagram.fitsFrame).toBe(true);
      for (const group of diagram.groups) {
        expect(group.gap).toBeGreaterThan(0);
        expect(group.fits).toBe(true);
        expect(group.dashed).toBe(true);
        expect(group.fill).toBe('none');
        expect(group.matchesServiceLabel).toBe(true);
      }
      for (const service of diagram.services) {
        expect(service.iconFits).toBe(true);
        expect(service.centerOffset).toBeLessThan(1);
        expect(service.labelBelowBox).toBe(true);
        expect(service.dash).toBe('none');
        expect(service.contained).toBe(true);
      }
      if (diagram.nestedClearance !== null) expect(diagram.nestedClearance).toBeGreaterThan(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test(`monochrome technology logos follow the foreground in ${theme} mode`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('starlight-theme', value), theme);
    await page.goto('/integrations/caching/redis/redis-get-started/');
    await dismissCookieConsentIfVisible(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const names = ['logos:openai-icon', 'logos:ollama', 'logos:kafka-icon'];
    const svg = renderMermaid(`architecture-beta\n${names.map(
      (name, index) => `service brand${index}(${name})[${name.split(':')[1]}]`,
    ).join('\n')}`);
    const diagram = page.locator('pre.mermaid');
    await diagram.evaluate((element, markup) => { element.innerHTML = markup; }, svg);
    const foreground = await diagram.locator('.pele-label').first()
      .evaluate((label) => getComputedStyle(label).fill);
    for (const name of names) {
      const path = diagram.locator(`svg[data-icon="${name}"] path`).first();
      await expect(path).toHaveCSS('fill', foreground);
      await expect(path).toHaveCSS('stroke', 'none');
    }
  });

  test(`local brand artwork loads with the correct variant in ${theme} mode`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('starlight-theme', value), theme);
    await page.goto('/integrations/cloud/azure/azure-ai-foundry/azure-ai-foundry-get-started/');
    await dismissCookieConsentIfVisible(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const diagram = page.locator('pre.mermaid');
    await expect(diagram.locator('.pele-label').filter({ hasText: /^Microsoft Foundry$/ })).toBeVisible();
    await expect(diagram.locator('svg[data-icon="iconoir:sparks"]')).toBeVisible();
    const names = ['microsoft-foundry', 'azure-key-vault', 'mailpit', 'ravendb'];
    const svg = renderMermaid(`architecture-beta\n${names.map(
      (name, index) => `service brand${index}(aspire:${name})[${name}]`,
    ).join('\n')}`);
    await diagram.evaluate((element, markup) => { element.innerHTML = markup; }, svg);
    for (const name of names) {
      const artwork = diagram.locator(`svg[data-icon="aspire:${name}"] image`);
      await expect(artwork.filter({ visible: true })).toHaveCount(1);
      if (name === 'mailpit' || name === 'ravendb') {
        await expect(diagram.locator(`svg[data-icon="aspire:${name}"] image[data-theme="${theme}"]`))
          .toBeVisible();
      }
    }
    const sources = await diagram.locator('image:visible')
      .evaluateAll((images) => images.map((image) => image.getAttribute('href')!));
    await page.evaluate(async (urls) => {
      await Promise.all(urls.map(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
      }));
    }, sources);
  });

  test(`Mermaid stays centered and responsive after client navigation in ${theme} mode`, async ({
    page,
    isMobile,
  }) => {
    test.setTimeout(120000);
    if (isMobile) {
      // Exercise ClientRouter's swap fallback, as in the API navigation suite.
      await page.addInitScript(() => {
        Object.defineProperty(document, 'startViewTransition', {
          configurable: true,
          value: undefined,
        });
      });
    }
    await page.addInitScript((value) => localStorage.setItem('starlight-theme', value), theme);
    await page.goto('/get-started/app-host/');
    await dismissCookieConsentIfVisible(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expectCenteredDiagrams(page);
    await page.evaluate(() => Reflect.set(window, '__mermaidSession', true));

    for (let visit = 0; visit < 2; visit++) {
      await navigateClient(page, '/docs/');
      await navigateClient(page, '/get-started/app-host/');
      await expectCenteredDiagrams(page);
    }
  });
}
