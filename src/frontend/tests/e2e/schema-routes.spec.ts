import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(testsDir, '..', '..');
const indexFile = path.join(frontendRoot, 'src', 'data', 'schemas', 'index.json');

interface SchemaIndex {
  latest: string;
  versions: string[];
}

const index = JSON.parse(readFileSync(indexFile, 'utf-8')) as SchemaIndex;

const LATEST_PATH = '/reference/cli/configuration/schema.json';
const versionedPath = (version: string): string =>
  `/reference/cli/configuration/schema/${version}.json`;

test('latest schema endpoint serves the current schema', async ({ request }) => {
  const response = await request.get(LATEST_PATH);

  expect(response.ok(), `${LATEST_PATH} should return 200.`).toBe(true);
  expect(response.headers()['content-type']).toContain('application/schema+json');

  const body = (await response.json()) as Record<string, unknown>;

  expect(typeof body['$schema']).toBe('string');
  expect(body['$id']).toBe(`https://aspire.dev${LATEST_PATH}`);
  expect(body['type']).toBe('object');
  expect(typeof body['title']).toBe('string');
});

for (const version of index.versions) {
  const slashlessPath = versionedPath(version);
  const slashedPath = `${slashlessPath}/`;

  test(`versioned schema ${version} serves at ${slashedPath}`, async ({ request }) => {
    const response = await request.get(slashedPath);

    expect(response.ok(), `${slashedPath} should return 200.`).toBe(true);
    expect(response.headers()['content-type']).toContain('application/schema+json');

    const body = (await response.json()) as Record<string, unknown>;

    expect(body['$id']).toBe(`https://aspire.dev${slashlessPath}`);
    expect(body['type']).toBe('object');
  });

  test(`versioned schema ${version} redirects slashless → slashed`, async ({ request }) => {
    const response = await request.get(slashlessPath, { maxRedirects: 0 });

    expect(response.status(), `${slashlessPath} should 308-redirect.`).toBe(308);
    expect(response.headers()['location']).toBe(slashedPath);
  });
}

test('latest schema endpoint does not redirect', async ({ request }) => {
  // The unversioned endpoint is served directly at the `.json` path; only the
  // dynamic `[version].json` route needs the trailingSlash redirect shim.
  const response = await request.get(LATEST_PATH, { maxRedirects: 0 });

  expect(response.status()).toBe(200);
});
