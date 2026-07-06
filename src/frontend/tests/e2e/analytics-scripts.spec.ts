import { expect, test } from '@playwright/test';

const analyticsScripts = [
  {
    path: '/scripts/analytics/1ds.js',
    marker: 'oneDS.ApplicationInsights',
  },
  {
    path: '/scripts/analytics/track.js',
    marker: 'capturePageAction',
  },
];

for (const analyticsScript of analyticsScripts) {
  test(`${analyticsScript.path} returns javascript`, async ({ request }) => {
    const response = await request.get(analyticsScript.path);
    const contentType = response.headers()['content-type'] ?? '';
    const body = await response.text();

    expect(response.ok()).toBeTruthy();
    expect(contentType).toContain('javascript');
    expect(body.trimStart().startsWith('<')).toBeFalsy();
    expect(body).toContain(analyticsScript.marker);
  });
}

test('home page references static analytics assets', async ({ request }) => {
  const response = await request.get('/');
  const html = await response.text();

  expect(response.ok()).toBeTruthy();
  expect(html).toContain('/scripts/analytics/1ds.js');
  expect(html).toContain('/scripts/analytics/track.js');
  expect(html).not.toContain('src="/1ds/"');
  expect(html).not.toContain('src="/track/"');
});
