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
    // The shared `markdownResponse` helper serves raw markdown as
    // `text/plain` so the browser displays it inline in a new tab rather
    // than triggering a download. The page-actions plugin's Copy Markdown
    // fetch and the "View markdown" link both rely on this behavior.
    expect(response.headers()['content-type']).toContain('text/plain');

    const body = await response.text();

    expect(body).toContain(route.expectedText);
    expect(body).not.toContain('<!DOCTYPE html>');
  });
}