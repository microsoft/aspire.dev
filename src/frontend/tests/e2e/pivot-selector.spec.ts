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

test('ApiReference chips follow the language selection through every entry point', async ({
  page,
}) => {
  // ApiReference renders both languages and lets CSS pick one from
  // `<html data-apphost-lang>` (see ApiReference.astro), so every writer of
  // that state has to keep the chips in step: the tab strip by pointer and by
  // keyboard, the PivotSelector, the `?aspire-lang=` query string, and the
  // persisted preference. The references on both pages below sit in prose,
  // outside any tab panel or pivot block, so they stay in the DOM no matter
  // which panel is showing.
  const reference = page.locator('.api-reference').first();
  const csharpChip = reference.locator('[data-lang="csharp"]');
  const typeScriptChip = reference.locator('[data-lang="typescript"]');

  // Query string initialization.
  await page.goto('/get-started/resource-mcp-servers/?aspire-lang=csharp');
  await dismissCookieConsentIfVisible(page);

  await expect(csharpChip).toBeVisible();
  await expect(csharpChip).toHaveText('WithMcpServer');
  await expect(typeScriptChip).toBeHidden();
  await expect(typeScriptChip).toHaveText('withMcpServer');
  await expect(csharpChip.locator('code > .ar-icon')).toBeVisible();
  await expect(csharpChip).toHaveAccessibleName('WithMcpServer — C# API reference');
  await expect(csharpChip).toHaveAttribute('data-tooltip-placement', 'top');
  const normalBackground = await csharpChip.locator('code').evaluate(
    (element) => getComputedStyle(element).backgroundColor
  );
  await csharpChip.hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await expect(page.getByRole('tooltip')).not.toBeEmpty();
  await expect(csharpChip.locator('code')).not.toHaveCSS('background-color', normalBackground);
  await expect(csharpChip.locator('code')).toHaveCSS('border-style', 'none');
  await page.mouse.move(0, 0);

  // Pointer: clicking the tab strip.
  const appHostTabs = page.locator('starlight-tabs[data-sync-key="aspire-lang"]').first();
  await appHostTabs.getByRole('tab', { name: 'TypeScript' }).click();

  await expect(typeScriptChip).toBeVisible();
  await expect(csharpChip).toBeHidden();
  await expect(typeScriptChip.locator('code > .ar-icon')).toBeVisible();
  await expect(typeScriptChip).toHaveAccessibleName('withMcpServer — TypeScript API reference');
  const iconCenterOffset = await typeScriptChip.evaluate((element) => {
    const code = element.querySelector('code')!.getBoundingClientRect();
    const icon = element.querySelector('.ar-icon')!.getBoundingClientRect();
    return Math.abs(icon.y + icon.height / 2 - (code.y + code.height / 2));
  });
  expect(iconCenterOffset).toBeLessThan(1);
  for (const language of ['csharp', 'typescript']) {
    const referenceIcon = reference.locator(`[data-lang="${language}"] .ar-icon`);
    const headerIcon = page.locator(`.code-block-icon[data-language="${language}"]`).first();
    const headerBackground = await headerIcon.evaluate(
      (element) => getComputedStyle(element).backgroundImage
    );
    expect(headerBackground).not.toBe('none');
    await expect(referenceIcon).toHaveCSS('background-image', headerBackground);
  }

  // Keyboard: arrowing along the same tab strip.
  await appHostTabs.locator('[role="tab"][aria-selected="true"]').focus();
  await page.keyboard.press('ArrowRight');

  await expect(appHostTabs.getByRole('tab', { name: 'C#' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(csharpChip).toBeVisible();
  await expect(typeScriptChip).toBeHidden();

  // Persisted initialization: the C# choice above was stored, so a fresh load
  // with no query string has to restore it before paint.
  await page.goto('/get-started/resource-mcp-servers/');

  await expect(csharpChip).toBeVisible();
  await expect(typeScriptChip).toBeHidden();

  // PivotSelector. Regression: the pivot wrote the storage keys and the query
  // string but never `<html data-apphost-lang>`, so the chips stayed on the
  // old language until the page was reloaded.
  await page.goto('/get-started/first-app/?aspire-lang=typescript');

  await expect(typeScriptChip).toBeVisible();
  await expect(typeScriptChip).toHaveText('createBuilder');

  await page.locator('#pivot-selector-aspire-lang').getByRole('button', { name: 'C#' }).click();

  await expect(page).toHaveURL(/\?aspire-lang=csharp$/);
  await expect(csharpChip).toBeVisible();
  await expect(csharpChip).toHaveText('CreateBuilder');
  await expect(typeScriptChip).toBeHidden();
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
  test(`ApiReference links and tooltips survive navigation and history with ${transition} swaps`, async ({
    page, isMobile,
  }) => {
    test.skip(isMobile && transition === 'native',
      'Chromium touch emulation aborts native transitions; touch projects cover the swap fallback.');
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (transition === 'fallback') {
      await page.addInitScript(() => {
        Object.defineProperty(document, 'startViewTransition', { value: undefined });
      });
    }
    await page.goto('/docs/');
    await dismissCookieConsentIfVisible(page);
    const marker = await page.evaluate(() => {
      const value = crypto.randomUUID();
      Reflect.set(window, '__apiReferenceSession', value);
      return value;
    });
    const navigate = async (action: () => Promise<unknown>) => {
      await page.evaluate(() => {
        Reflect.set(window, '__apiReferenceLoaded', false);
        document.addEventListener('astro:page-load', () => {
          Reflect.set(window, '__apiReferenceLoaded', true);
        }, { once: true });
      });
      await action();
      await expect.poll(() => page.evaluate(() => Reflect.get(window, '__apiReferenceLoaded'))).toBe(true);
      await expect(page.locator('html[data-astro-transition]')).toHaveCount(0);
      expect(await page.evaluate(() => Reflect.get(window, '__apiReferenceSession'))).toBe(marker);
    };
    await navigate(() => page.locator('a[href="/get-started/first-app/"]:visible').first().click());
    const reference = page.locator('.api-reference').first();

    for (const language of ['csharp', 'typescript'] as const) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.locator('#pivot-selector-aspire-lang').getByRole('button', {
        name: language === 'csharp' ? 'C#' : 'TypeScript', exact: true,
      }).click();
      const chip = reference.locator(`a[data-lang="${language}"]`);
      await expect(chip).toBeVisible();
      await expect(chip).toHaveAttribute('href', new RegExp(`/reference/api/${language}/`));
      const destination = new URL((await chip.getAttribute('href'))!, page.url()).href;

      await chip.focus();
      await expect(page.getByRole('tooltip')).toBeVisible();
      await expect(page.getByRole('tooltip')).not.toBeEmpty();
      await navigate(() => chip.press('Enter'));
      await expect(page).toHaveURL(destination);
      await expect(page.getByRole('tooltip')).toHaveCount(0);

      await navigate(() => page.goBack());
      await expect(page.locator('html')).toHaveAttribute('data-apphost-lang', language);
      await expect(chip).toBeVisible();
      await chip.focus();
      await expect(page.getByRole('tooltip')).toBeVisible();
      await expect(page.getByRole('tooltip')).not.toBeEmpty();
      await chip.press('Escape');
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await chip.blur();

      await navigate(() => page.goForward());
      await expect(page).toHaveURL(destination);
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await navigate(() => page.goBack());
      await expect(page.locator('html')).toHaveAttribute('data-apphost-lang', language);
      await expect(chip).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

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
