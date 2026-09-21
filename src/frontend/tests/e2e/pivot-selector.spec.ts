import { expect, test } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

test('Dev Hub TypeScript quickstart overrides a saved C# preference', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('aspire-lang', 'csharp');
    localStorage.setItem('starlight-synced-tabs__aspire-lang', 'C#');
  });
  await page.goto('/hub/');
  await dismissCookieConsentIfVisible(page);

  const link = page.locator('.language-links').getByRole('link', { name: /JavaScript \/ TypeScript/ });
  await expect(link).toHaveAttribute('href', '/get-started/first-app/?aspire-lang=typescript');
  await link.click();

  await expect(page).toHaveURL(/\/get-started\/first-app\/\?aspire-lang=typescript$/);
  await expect(page.locator('#pivot-selector-aspire-lang [data-pivot-option="typescript"]')).toHaveClass(/active/);
  await expect(page.getByText('This quickstart uses the JavaScript starter template', { exact: false })).toBeVisible();
});

test('prerequisites apphost tabs default to TypeScript and persist selection', async ({
  page,
}) => {
  await page.goto('/get-started/prerequisites/');
  await dismissCookieConsentIfVisible(page);

  const appHostTabs = page.locator('starlight-tabs[data-sync-key="aspire-lang"]').first();
  const csharpTab = appHostTabs.getByRole('tab', { name: 'C#' });
  const typeScriptTab = appHostTabs.getByRole('tab', { name: 'TypeScript' });
  const csharpContent = page.getByText('The .NET 10.0 SDK is required for C# AppHosts', {
    exact: false,
  });
  const typeScriptContent = page.getByRole('link', { name: 'Node.js installation instructions' });

  await expect(appHostTabs.getByRole('tab').first()).toHaveText('TypeScript');
  await expect(typeScriptTab).toHaveAttribute('aria-selected', 'true');
  await expect(csharpTab).toHaveAttribute('aria-selected', 'false');
  await expect(typeScriptContent).toBeVisible();
  await expect(csharpContent).toBeHidden();

  await csharpTab.click();

  await expect(csharpTab).toHaveAttribute('aria-selected', 'true');
  await expect(typeScriptTab).toHaveAttribute('aria-selected', 'false');
  await expect(csharpContent).toBeVisible();
  await expect(typeScriptContent).toBeHidden();

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('starlight-synced-tabs__aspire-lang')))
    .toBe('C#');

  await page.reload();
  await dismissCookieConsentIfVisible(page);

  await expect(csharpTab).toHaveAttribute('aria-selected', 'true');
  await expect(csharpContent).toBeVisible();
  await expect(typeScriptContent).toBeHidden();
});

test('apphost tabs restore and sync the aspire-lang query string', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('aspire-lang', 'csharp');
    localStorage.setItem('starlight-synced-tabs__aspire-lang', 'C#');
  });

  await page.goto('/get-started/prerequisites/?aspire-lang=typescript');
  await dismissCookieConsentIfVisible(page);

  const appHostTabs = page.locator('starlight-tabs[data-sync-key="aspire-lang"]').first();
  const csharpTab = appHostTabs.getByRole('tab', { name: 'C#' });
  const typeScriptTab = appHostTabs.getByRole('tab', { name: 'TypeScript' });
  const csharpContent = page.getByText('The .NET 10.0 SDK is required for C# AppHosts', {
    exact: false,
  });
  const typeScriptContent = page.getByRole('link', { name: 'Node.js installation instructions' });

  await expect(page).toHaveURL(/\?aspire-lang=typescript$/);
  await expect(typeScriptTab).toHaveAttribute('aria-selected', 'true');
  await expect(csharpTab).toHaveAttribute('aria-selected', 'false');
  await expect(typeScriptContent).toBeVisible();
  await expect(csharpContent).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('aspire-lang')))
    .toBe('typescript');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('starlight-synced-tabs__aspire-lang')))
    .toBe('TypeScript');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.apphostLang))
    .toBe('typescript');

  await csharpTab.click();

  await expect(page).toHaveURL(/\?aspire-lang=csharp$/);
  await expect(csharpTab).toHaveAttribute('aria-selected', 'true');
  await expect(typeScriptTab).toHaveAttribute('aria-selected', 'false');
  await expect(csharpContent).toBeVisible();
  await expect(typeScriptContent).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('aspire-lang')))
    .toBe('csharp');
});

test('postgres apphost tabs use the shared aspire-lang query string', async ({ page }) => {
  await page.goto('/integrations/databases/postgres/postgres-host/?aspire-lang=typescript');
  await dismissCookieConsentIfVisible(page);

  const appHostTabs = page.locator('starlight-tabs[data-sync-key="aspire-lang"]').first();
  const csharpTab = appHostTabs.getByRole('tab', { name: 'C#' });
  const typeScriptTab = appHostTabs.getByRole('tab', { name: 'TypeScript' });
  const typeScriptPanel = appHostTabs.locator(':scope > [role="tabpanel"]').nth(0);
  const csharpPanel = appHostTabs.locator(':scope > [role="tabpanel"]').nth(1);

  await expect(typeScriptTab).toHaveAttribute('aria-selected', 'true');
  await expect(csharpTab).toHaveAttribute('aria-selected', 'false');
  await expect(typeScriptPanel).toBeVisible();
  await expect(csharpPanel).toBeHidden();
});

test('app host page restores pivot state from the lang query string', async ({ page }) => {
  await page.goto('/get-started/app-host/?lang=nodejs');
  await dismissCookieConsentIfVisible(page);

  const pivotSelector = page.locator('#pivot-selector-lang');
  const nodeJsButton = pivotSelector.getByRole('button', { name: 'Node.js' });
  const javaButton = pivotSelector.getByRole('button', { name: 'Java' });
  const nodeJsContent = page.getByText(
    'This architecture demonstrates a Node.js API connecting to a PostgreSQL database',
    {
      exact: false,
    }
  );
  const csharpContent = page.getByText(
    'This architecture demonstrates a .NET API connecting to a PostgreSQL database',
    {
      exact: false,
    }
  );
  const javaContent = page.getByText(
    'This architecture demonstrates a Java API (using Spring Boot) connecting to a PostgreSQL database',
    {
      exact: false,
    }
  );

  await expect(page).toHaveURL(/\?lang=nodejs$/);
  await expect(nodeJsButton).toHaveClass(/active/);
  await expect(nodeJsContent).toBeVisible();
  await expect(csharpContent).toBeHidden();

  await javaButton.click();

  await expect(page).toHaveURL(/\?lang=java$/);
  await expect(javaButton).toHaveClass(/active/);
  await expect(nodeJsButton).not.toHaveClass(/active/);
  await expect(javaContent).toBeVisible();
  await expect(nodeJsContent).toBeHidden();
});

test('first-app pivots default to TypeScript and preserve history and shared preferences', async ({
  page,
}) => {
  await page.goto('/get-started/first-app/?keep=1');
  await dismissCookieConsentIfVisible(page);
  const selector = page.locator('#pivot-selector-aspire-lang');
  await expect(selector).toHaveAttribute('data-pivot-initialized', 'true');
  await expect(selector.getByRole('button').first()).toHaveText('TypeScript');
  await expect(selector.getByRole('button', { name: 'TypeScript' })).toHaveClass(/active/);
  await expect(page.locator('[data-pivot-block="typescript"]').first()).toBeVisible();
  await expect(page.locator('[data-pivot-block="csharp"]').first()).toBeHidden();

  const index = await page.evaluate(() => {
    const state = history.state as { index: number };
    history.replaceState({ ...state, pivotTest: 'preserved' }, '');
    return state.index;
  });
  expect(index).toEqual(expect.any(Number));
  await selector.getByRole('button', { name: 'C#', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\?keep=1&aspire-lang=csharp$/);
  await expect(page.locator('[data-pivot-block="csharp"]').first()).toBeVisible();
  await expect(page.locator('[data-pivot-block="typescript"]').first()).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        state: history.state,
        preference: localStorage.getItem('aspire-lang'),
        tabs: localStorage.getItem('starlight-synced-tabs__aspire-lang'),
        language: document.documentElement.dataset.apphostLang,
      }))
    )
    .toMatchObject({
      state: { index, pivotTest: 'preserved' },
      preference: 'csharp',
      tabs: 'C#',
      language: 'csharp',
    });

  await page.goto('/get-started/first-app/?aspire-lang=typescript&keep=2');
  await expect(selector.getByRole('button', { name: 'TypeScript' })).toHaveClass(/active/);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('aspire-lang')))
    .toBe('typescript');
});

test('floating pivot controls clear the TOC across its responsive breakpoint', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto('/get-started/first-app/');
  await dismissCookieConsentIfVisible(page);
  const root = page.locator('aspire-pivot-selector[data-pivot-key="aspire-lang"]');
  await expect(root.locator('.pivot-selector')).toHaveAttribute('data-pivot-initialized', 'true');
  await root.getByRole('button', { name: 'C#', exact: true }).click();
  const expand = root.getByRole('button', { name: 'Expand selector', exact: true });
  const collapse = root.getByRole('button', { name: 'Collapse selector', exact: true });
  const toc = page.locator('#starlight__on-this-page--mobile');

  for (const width of [390, 834, 1152, 1440, 1599, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect(root).not.toHaveClass(/floating/);
    await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }));
    await expect(root).toHaveClass(/floating/);
    await expect(root).toHaveClass(/collapsed/);

    if (width < 1600) {
      await expect(toc).toBeVisible();
      await expect
        .poll(async () => {
          const buttonBox = await expand.boundingBox();
          const tocBox = await toc.boundingBox();
          // The shared border can overlap by one pixel, but the control must clear the TOC.
          return buttonBox && tocBox ? buttonBox.y + 1 >= tocBox.y + tocBox.height : false;
        })
        .toBe(true);
    } else {
      await expect(toc).toBeHidden();
    }
    await expand.click();
    await expect(root).not.toHaveClass(/collapsed/);
    await expect(root.getByRole('button', { name: 'C#', exact: true })).toHaveClass(/active/);
    await collapse.click();
    await expect(root).toHaveClass(/collapsed/);

    if (width < 1600) {
      await toc.click();
      await expect(page.locator('#starlight__mobile-toc')).toHaveJSProperty('open', true);
      await toc.press('Escape');
      await expect(page.locator('#starlight__mobile-toc')).toHaveJSProperty('open', false);
    }
  }
});

for (const transition of ['native', 'fallback'] as const) {
  test(`pivot lifecycle survives repeated visits and history with ${transition} swaps`, async ({
    page, isMobile,
  }) => {
    test.skip(isMobile && transition === 'native',
      'Chromium touch emulation aborts native transitions; touch projects cover the swap fallback.');
    test.setTimeout(120_000);
    const warnings: string[] = [];
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning' && /pivot.*not found/i.test(message.text())) {
        warnings.push(message.text());
      }
    });
    page.on('pageerror', (error) => errors.push(error.message));
    if (transition === 'fallback') {
      await page.addInitScript(() => {
        Object.defineProperty(document, 'startViewTransition', { value: undefined });
      });
    }
    await page.goto('/docs/');
    await dismissCookieConsentIfVisible(page);
    const documentMarker = await page.evaluate(() => {
      const marker = crypto.randomUUID();
      Object.defineProperty(window, '__pivotNavigationMarker', { value: marker });
      return marker;
    });
    const selector = page.locator('#pivot-selector-aspire-lang');
    const root = page.locator('aspire-pivot-selector[data-pivot-key="aspire-lang"]');
    const navigate = async (action: () => Promise<unknown>) => {
      await page.evaluate(() => {
        Reflect.set(window, '__pivotPageLoaded', false);
        document.addEventListener('astro:page-load', () => {
          Reflect.set(window, '__pivotPageLoaded', true);
        }, { once: true });
      });
      await action();
      await expect.poll(() => page.evaluate(() => Reflect.get(window, '__pivotPageLoaded'))).toBe(true);
      await expect(page.locator('html[data-astro-transition]')).toHaveCount(0);
    };

    for (let visit = 0; visit < 3; visit++) {
      await navigate(() => page.locator('a[href="/get-started/first-app/"]:visible').first().click());
      await expect(selector).toHaveAttribute('data-pivot-initialized', 'true');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await selector.getByRole('button', { name: 'C#', exact: true }).click();
      await expect(page).toHaveURL(/\/get-started\/first-app\/\?aspire-lang=csharp$/);
      await expect
        .poll(() => page.evaluate(() => history.state))
        .toMatchObject({
          index: expect.any(Number),
        });
      await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }));
      await expect(root).toHaveClass(/floating/);
      await expect(root).toHaveClass(/collapsed/);
      await root.getByRole('button', { name: 'Expand selector', exact: true }).click();
      await expect(root).not.toHaveClass(/collapsed/);

      // Leave while the old selector still owns its five-second expansion timer.
      await navigate(() => page.locator('header a[href="/"]:visible').click());
      await expect(page).toHaveURL(url => url.pathname === '/');
      await expect(root).toHaveCount(0);
      await expect(page.locator('.pivot-placeholder')).toHaveCount(0);
      await navigate(() => page.goBack());
      await expect(selector).toHaveAttribute('data-pivot-initialized', 'true');
      await expect(selector.locator('[data-pivot-option="csharp"]')).toHaveClass(/active/);
      await expect
        .poll(() => page.evaluate(() => history.state))
        .toMatchObject({
          index: expect.any(Number),
        });
      await navigate(() => page.goForward());
      await expect(page).toHaveURL(url => url.pathname === '/');
      await expect(root).toHaveCount(0);
      await page.evaluate(() => {
        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
      });
      await expect
        .poll(() => page.evaluate(() => Reflect.get(window, '__pivotNavigationMarker')))
        .toBe(documentMarker);
    }
    expect(warnings).toEqual([]);
    expect(errors).toEqual([]);
  });
}
