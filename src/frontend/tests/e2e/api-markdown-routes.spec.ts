import { expect, test } from '@playwright/test';

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
    expectedText: '# AppHost API Reference',
    name: 'AppHost API index',
    path: '/reference/api/apphost.md',
  },
  {
    expectedText: '# Aspire.Hosting',
    name: 'AppHost module route',
    path: '/reference/api/apphost/aspire.hosting.md',
  },
  {
    expectedText: '# IDistributedApplicationBuilder',
    name: 'AppHost handle route',
    path: '/reference/api/apphost/aspire.hosting/idistributedapplicationbuilder.md',
  },
  {
    expectedText: '# CommandOptions',
    name: 'AppHost DTO route',
    path: '/reference/api/apphost/aspire.hosting/commandoptions.md',
  },
  {
    expectedText: '# CertificateTrustScope',
    name: 'AppHost enum route',
    path: '/reference/api/apphost/aspire.hosting/certificatetrustscope.md',
  },
  {
    expectedText: '# addConnectionString',
    name: 'AppHost function route',
    path: '/reference/api/apphost/aspire.hosting/addconnectionstring.md',
  },
  {
    expectedText: '# IDistributedApplicationBuilder.addConnectionString',
    name: 'AppHost member route',
    path: '/reference/api/apphost/aspire.hosting/idistributedapplicationbuilder/addconnectionstring.md',
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

test('legacy TypeScript markdown routes preserve the exact canonical target', async ({ request }) => {
  const legacyPath = '/reference/api/typescript/aspire.hosting.md';
  const canonicalPath = '/reference/api/apphost/aspire.hosting.md';
  const response = await request.get(legacyPath, {
    maxRedirects: 0,
  });

  if (response.status() === 308) {
    // Astro dev executes the endpoint and preserves its permanent redirect.
    expect(response.headers().location).toBe(canonicalPath);
    return;
  }

  // Astro preview serves prerendered redirects as static files, so the
  // endpoint status and Location header become a 200 redirect document.
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/markdown');

  const body = await response.text();

  expect(body).toContain(`<meta http-equiv="refresh" content="0;url=${canonicalPath}">`);
  expect(body).toContain(
    `<link rel="canonical" href="https://aspire.dev${canonicalPath}">`
  );
  expect(body).toContain(`<a href="${canonicalPath}">`);
  expect(body).not.toContain('# Aspire.Hosting');

  const canonicalResponse = await request.get(canonicalPath);

  expect(canonicalResponse.ok(), `${canonicalPath} should return 200.`).toBe(true);
  expect(canonicalResponse.headers()['content-type']).toContain('text/markdown');
  expect(await canonicalResponse.text()).toContain('# Aspire.Hosting');
});
