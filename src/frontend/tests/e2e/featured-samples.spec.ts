import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('resource directory exposes keyboard-accessible discovery shortcuts', async ({ page, request }) => {
  await page.goto('/hub/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aspire resources');
  await expect(page.locator('.dev-description')).toContainText('Browse this directory');
  const shortcuts = page.getByRole('navigation', { name: 'Browse resource sections' });
  for (const link of await shortcuts.getByRole('link').all()) {
    const href = (await link.getAttribute('href'))!;
    await expect(page.locator(href)).toHaveCount(1);
    await link.focus();
    await expect(link).toHaveCSS('outline-style', 'solid');
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await shortcuts.getByRole('link', { name: 'Featured samples' }).press('Enter');
  await expect(page).toHaveURL(/#samples$/);
  const markdown = await request.get('/hub.md');
  expect(await markdown.text()).toContain('# Aspire resources');
});

test('featured samples filter real metadata and retain language when browsing all samples', async ({ page }) => {
  await page.goto('/hub/');
  const samples = page.locator('featured-samples');
  const languages = samples.getByRole('group', { name: 'Sample languages' });
  const visible = samples.locator('[data-sample-languages]:visible h3');
  await expect(samples).toHaveAttribute('data-ready', '');
  await expect(languages.getByRole('checkbox')).toHaveCount(5);
  await expect(languages.getByRole('checkbox', { checked: true })).toHaveCount(0);
  await expect(visible).toHaveCount(6);
  await expect(samples.getByRole('status')).toHaveText('6 featured samples: All languages');
  for (const [language, titles] of [
    ['csharp', ['Aspire Shop', 'Angular, React, and Vue', 'FastAPI + JavaScript', 'Persistent Volume']],
    ['go', ['Go REST API']],
    ['javascript', ['Angular, React, and Vue', 'FastAPI + JavaScript', 'Node.js Weather Explorer']],
    ['python', ['FastAPI + JavaScript']],
    ['typescript', ['Angular, React, and Vue', 'Go REST API', 'Node.js Weather Explorer']],
  ] as const) {
    const checkbox = languages.locator(`input[value="${language}"]`);
    await checkbox.check();
    await expect(visible).toHaveText([...titles]);
    await expect(page).toHaveURL(new RegExp(`sample-language=${language}`));
    await expect(samples.getByRole('status')).toContainText(`${titles.length} of 6 featured samples`);
    await checkbox.uncheck();
    await expect(page).toHaveURL(/\/hub\/$/);
    await expect(visible).toHaveCount(6);
  }
  await languages.getByRole('checkbox', { name: 'Python', exact: true }).check();
  await expect(page).toHaveURL(/sample-language=python$/);
  await languages.getByRole('checkbox', { name: 'TypeScript', exact: true }).check();
  await expect(page).toHaveURL(/sample-language=python&sample-language=typescript$/);
  await expect(visible).toHaveText(['Angular, React, and Vue', 'FastAPI + JavaScript', 'Go REST API', 'Node.js Weather Explorer']);
  await samples.getByRole('link', { name: 'All samples', exact: true }).click();
  await expect(page).toHaveURL(/\/hub\/browse\/\?type=sample&language=python&language=typescript$/, { timeout: 30_000 });
  await expect(page.locator('resource-browser')).toHaveAttribute('data-ready', '');
  const entries = await page.locator('[data-resource-entry]:not([hidden])').evaluateAll((cards) =>
    cards.map((card) => JSON.parse(card.getAttribute('data-resource-entry')!) as { type: string; language: string[] }));
  expect(entries.length).toBeGreaterThan(0);
  expect(entries.every((entry) => entry.type === 'sample' && entry.language.some((language) => ['python', 'typescript'].includes(language)))).toBe(true);
  await page.goBack();
  await expect(languages.getByRole('checkbox', { checked: true })).toHaveCount(2);
  await expect(visible).toHaveCount(4);
});

test('featured language checkboxes match any selection without duplicating multi-language samples', async ({ page }) => {
  await page.goto('/hub/?sample-language=unknown&sample-language=python&sample-language=python&sample-language=javascript');
  const samples = page.locator('featured-samples');
  const visible = samples.locator('[data-sample-languages]:visible h3');
  await expect(samples.getByRole('checkbox', { checked: true })).toHaveCount(2);
  await expect(visible).toHaveText(['Angular, React, and Vue', 'FastAPI + JavaScript', 'Node.js Weather Explorer']);
  await expect(samples.getByRole('status')).toHaveText('3 of 6 featured samples: JavaScript, Python');
  await samples.getByRole('checkbox', { name: 'Go', exact: true }).check();
  await expect(page).toHaveURL(/sample-language=go&sample-language=javascript&sample-language=python$/);
  await expect(visible).toHaveText(['Angular, React, and Vue', 'FastAPI + JavaScript', 'Go REST API', 'Node.js Weather Explorer']);
  await samples.getByRole('checkbox', { name: 'JavaScript', exact: true }).uncheck();
  await expect(page).toHaveURL(/sample-language=go&sample-language=python$/);
  await expect(visible).toHaveText(['FastAPI + JavaScript', 'Go REST API']);
});

test('featured sample deep links, reload, history, and reset preserve user intent', async ({ page }) => {
  await page.goto('/hub/?keep=1&sample-language=python#samples');
  const samples = page.locator('featured-samples');
  const python = samples.getByRole('checkbox', { name: 'Python', exact: true });
  const typescript = samples.getByRole('checkbox', { name: 'TypeScript', exact: true });
  await expect(python).toBeChecked();
  await python.focus();
  await python.press('Tab');
  await expect(typescript).toBeFocused();
  await expect(typescript).toHaveCSS('outline-style', 'solid');
  await typescript.press('Space');
  await expect(typescript).toBeChecked();
  await expect(page).toHaveURL(/keep=1&sample-language=python&sample-language=typescript#samples$/);
  await expect(typescript).toBeFocused();
  await page.reload();
  await expect(python).toBeChecked();
  await expect(typescript).toBeChecked();
  await page.goBack();
  await expect(python).toBeChecked();
  await expect(typescript).not.toBeChecked();
  await page.goForward();
  await expect(python).toBeChecked();
  await expect(typescript).toBeChecked();
  await samples.getByRole('button', { name: 'Clear language filter' }).click();
  await expect(samples.getByRole('checkbox', { checked: true })).toHaveCount(0);
  await expect(samples.getByRole('checkbox', { name: 'C#', exact: true })).toBeFocused();
  await expect(page).toHaveURL(/\/hub\/\?keep=1#samples$/);
  await expect(samples.locator('[data-sample-languages]:visible')).toHaveCount(6);
  await page.goto('/hub/?sample-language=unknown');
  await expect(samples.getByRole('checkbox', { checked: true })).toHaveCount(0);
  await expect(samples.locator('[data-sample-languages]:visible')).toHaveCount(6);
});

test('featured sample empty state recovers and unspecified samples remain visible only for all languages', async ({ page }) => {
  // Model a catalog language with no current featured selection and an untagged sample.
  await page.route('**/hub/', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/data-sample-languages="[^"]*"/g, 'data-sample-languages=""');
    await route.fulfill({ response, body });
  }, { times: 1 });
  await page.goto('/hub/');
  const samples = page.locator('featured-samples');
  await expect(samples.locator('[data-sample-languages]:visible')).toHaveCount(6);
  await samples.getByRole('checkbox', { name: 'Python', exact: true }).check();
  await expect(page).toHaveURL(/sample-language=python$/);
  await expect(samples.getByRole('heading', { name: 'No featured samples for Python', exact: true })).toBeVisible();
  await samples.getByRole('checkbox', { name: 'Go', exact: true }).check();
  await expect(page).toHaveURL(/sample-language=go&sample-language=python$/);
  await expect(samples.locator('[data-sample-languages]:visible')).toHaveCount(0);
  await expect(samples.getByRole('heading', { name: 'No featured samples for Go, Python' })).toBeVisible();
  await expect(samples.getByRole('status')).toHaveText('0 of 6 featured samples: Go, Python');
  await samples.getByRole('button', { name: 'Clear language filter' }).click();
  await expect(page).toHaveURL(/\/hub\/$/);
  await expect(samples.getByRole('checkbox', { name: 'C#', exact: true })).toBeFocused();
  await expect(samples.locator('[data-sample-languages]:visible')).toHaveCount(6);
});

test('featured filter reflows and passes focused accessibility checks in both themes', async ({ page }) => {
  await page.goto('/hub/#samples');
  const samples = page.locator('featured-samples');
  await samples.getByRole('checkbox', { name: 'TypeScript', exact: true }).check();
  await expect(page).toHaveURL(/sample-language=typescript#samples$/);
  await samples.getByRole('checkbox', { name: 'Python', exact: true }).check();
  await expect(page).toHaveURL(/sample-language=python&sample-language=typescript#samples$/);
  for (const checkbox of await samples.getByRole('checkbox').all()) {
    expect((await checkbox.locator('..').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).include('#samples').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
  }
});

test('all featured sample links work without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/hub/?sample-language=python');
  const samples = page.locator('featured-samples');
  await expect(samples.locator('.sample-filter')).toBeHidden();
  await expect(samples.locator('[data-sample-languages]:visible')).toHaveCount(6);
  await samples.getByRole('link', { name: /Go REST API/ }).click();
  await expect(page).toHaveURL(/\/reference\/samples\/golang-api\/$/);
  await context.close();
});

test('cloud entrypoints introduce connected AppHost code before deeper guides', async ({ page }) => {
  for (const [provider, heading, code, guide] of [
    ['AWS', 'Connect your app to DynamoDB Local', 'withDynamoDBLocalReference(dynamodb)', 'CloudFormation walkthrough'],
    ['Azure', 'Connect your app to Azure Blob Storage', 'withReference(blobs)', 'Connect to Azure Blob Storage'],
  ]) {
    await page.goto('/hub/');
    await page.locator('.cloud-links a').filter({ has: page.getByRole('heading', { name: provider, exact: true }) }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    const tabs = page.locator('starlight-tabs').first();
    await expect(tabs.getByRole('tab')).toHaveText(['TypeScript', 'C#']);
    await tabs.getByRole('tab', { name: 'TypeScript', exact: true }).click();
    await expect(tabs.getByRole('tabpanel')).toContainText(code);
    await tabs.getByRole('tab', { name: 'C#', exact: true }).click();
    await expect(tabs.getByRole('tabpanel')).toContainText('.WithReference(');
    const link = page.locator('.sl-markdown-content').getByRole('link', { name: guide, exact: true });
    await expect(link).toBeVisible();
    const firstCode = (await tabs.boundingBox())!;
    expect(firstCode.y).toBeLessThan((await link.boundingBox())!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (provider === 'Azure') {
      await link.click();
      await expect(page).toHaveURL(/\/azure-storage-blobs-connect\/$/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    } else {
      await expect(link).toHaveAttribute('href', /github\.com\/aws\/integrations-on-dotnet-aspire-for-aws\/.*#provisioning-application-resources-with-aws-cloudformation$/);
    }
  }
});
