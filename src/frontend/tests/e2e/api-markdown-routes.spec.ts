import { expect, test } from '@playwright/test';
import { locales } from '../../config/locales';

const markdownRoutes = [
  {
    expectedText: '# C# API Reference',
    name: 'C# API index',
    path: '/reference/api/csharp.md',
  },
  {
    expectedText: '# CommunityToolkit.Aspire.Hosting.ActiveMQ',
    name: 'C# package route',
    path: '/reference/api/csharp/communitytoolkit.aspire.hosting.activemq.md',
  },
  {
    expectedText: '# ActiveMQArtemisServerResource',
    name: 'C# type route',
    path: '/reference/api/csharp/communitytoolkit.aspire.hosting.activemq/activemqartemisserverresource.md',
  },
  {
    expectedText: '# ActiveMQArtemisServerResource Constructors',
    name: 'C# member-kind route',
    path: '/reference/api/csharp/communitytoolkit.aspire.hosting.activemq/activemqartemisserverresource/constructors.md',
  },
  {
    expectedText: '# TypeScript API Reference',
    name: 'TypeScript API index',
    path: '/reference/api/typescript.md',
  },
  {
    expectedText: '# Aspire.Hosting',
    name: 'TypeScript module route',
    path: '/reference/api/typescript/aspire.hosting.md',
  },
  {
    expectedText: '# IDistributedApplicationBuilder',
    name: 'TypeScript handle route',
    path: '/reference/api/typescript/aspire.hosting/idistributedapplicationbuilder.md',
  },
  {
    expectedText: '# CommandOptions',
    name: 'TypeScript DTO route',
    path: '/reference/api/typescript/aspire.hosting/commandoptions.md',
  },
  {
    expectedText: '# CertificateTrustScope',
    name: 'TypeScript enum route',
    path: '/reference/api/typescript/aspire.hosting/certificatetrustscope.md',
  },
  {
    expectedText: '# addConnectionString',
    name: 'TypeScript function route',
    path: '/reference/api/typescript/aspire.hosting/addconnectionstring.md',
  },
  {
    expectedText: '# IDistributedApplicationBuilder.addConnectionString',
    name: 'TypeScript member route',
    path: '/reference/api/typescript/aspire.hosting/idistributedapplicationbuilder/addconnectionstring.md',
  },
  {
    // Samples reuse the same shared `markdownResponse` helper as the API
    // routes and have the same trailing-slash redirect treatment from
    // `src/middleware.ts`. The picked sample is stable in
    // `src/data/samples.json` and serves a markdown body that includes the
    // sample title as an `<h1>`.
    expectedText: '# Aspire Shop',
    name: 'Sample route',
    path: '/reference/samples/aspire-shop.md',
  },
] as const;

for (const route of markdownRoutes) {
  test(`${route.name} serves markdown`, async ({ request }) => {
    const response = await request.get(route.path);

    expect(response.ok(), `${route.path} should return 200.`).toBe(true);
    // The static preview server infers Content-Type from the `.md`
    // extension as `text/markdown`. The page-actions Copy Markdown fetch
    // does not depend on the Content-Type — it consumes the body text
    // directly — so this is purely an assertion that the route serves
    // markdown rather than HTML.
    expect(response.headers()['content-type']).toContain('text/markdown');

    const body = await response.text();

    expect(body).toContain(route.expectedText);
    expect(body).not.toContain('<!DOCTYPE html>');
  });
}

test('built homepages publish useful Markdown through their existing companion paths', async ({
  request,
}) => {
  test.skip(!process.env.CI, 'Homepage Markdown is finalized by the production build.');

  for (const locale of Object.keys(locales)) {
    const prefix = locale === 'root' ? '' : `/${locale}`;
    const response = await request.get(`${prefix || '/index'}.md`);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('text/markdown');
    const markdown = await response.text();

    expect(markdown).toMatch(/^# .+/m);
    expect(markdown).toContain('OpenTelemetry');
    expect(markdown).toContain(`](${prefix}/get-started/first-app/)`);
    expect(markdown).toContain(`](${prefix}/dashboard/standalone/)`);
    expect(markdown).toContain('```typescript\n');
    expect(markdown).toContain('```csharp\n');
    expect(markdown).not.toMatch(/<HomePage|<!DOCTYPE html>|class="code-variant"/);
  }
});

test('page Markdown actions on untranslated locale pages use the Markdown for the shown content', async ({
  page,
  request,
}) => {
  const copies: string[] = [];
  await page.exposeFunction('__captureFallbackMarkdown', (text: string) => copies.push(text));
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: (text: string) => Reflect.get(window, '__captureFallbackMarkdown')(text),
    });
  });

  // `de` renders the English fallback; `ja` has its own translated source.
  for (const { path, markdownPath, heading } of [
    {
      path: '/de/fundamentals/telemetry/',
      markdownPath: '/fundamentals/telemetry',
      heading: '# OpenTelemetry and distributed tracing in Aspire',
    },
    {
      path: '/ja/fundamentals/telemetry/',
      markdownPath: '/ja/fundamentals/telemetry',
      heading: '# テレメトリ',
    },
  ]) {
    await page.goto(path);
    const copyButtons = page.locator('[data-page-action="copy-markdown"]');
    expect(
      await copyButtons.evaluateAll((buttons) => buttons.map((button) => button.dataset.path))
    ).toEqual(Array(await copyButtons.count()).fill(markdownPath));
    const viewLinks = page.locator('a:has([data-action-icon="markdown"])');
    expect(await viewLinks.count()).toBeGreaterThan(0);
    expect(
      await viewLinks.evaluateAll((links) => links.map((link) => link.getAttribute('href')))
    ).toEqual(Array(await viewLinks.count()).fill(`${markdownPath}.md`));

    const response = await request.get(`${markdownPath}.md`);
    expect(response.ok(), `${markdownPath}.md should return 200.`).toBe(true);
    expect(response.headers()['content-type']).toContain('text/markdown');

    const copy = page.locator('[data-page-action="copy-markdown"]:visible').first();
    await copy.click();
    await expect(copy).toHaveClass(/copied/);
    expect(copies.at(-1)).toContain(heading);
  }
});
