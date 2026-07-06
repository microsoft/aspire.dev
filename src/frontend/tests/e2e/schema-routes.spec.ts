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

// These tests run against `astro dev` locally and `astro preview` in CI, so:
// - Under preview, prerendered endpoint `Response` headers (e.g.
//   `application/schema+json`) are not preserved; the static server MIME-types
//   by extension (`application/json`).
// - Under preview, the dev-only middleware that redirects slashless `.json`
//   paths to their slashed form does not run; the static server serves the
//   file directly at the slashless URL.
// We therefore assert the canonical slashless URL is reachable and returns the
// expected schema payload — true in both environments.

const LATEST_PATH = '/reference/cli/configuration/schema.json';
const versionedPath = (version: string): string =>
  `/reference/cli/configuration/schema/${version}.json`;

function expectJsonContentType(headerValue: string | undefined): void {
  // Matches both our endpoint's `application/schema+json` and the static
  // preview server's default `application/json`.
  expect(headerValue, 'expected a JSON-family content type').toMatch(
    /application\/(?:schema\+)?json/
  );
}

test('latest schema endpoint serves the current schema', async ({ request }) => {
  const response = await request.get(LATEST_PATH);

  expect(response.ok(), `${LATEST_PATH} should return 200.`).toBe(true);
  expectJsonContentType(response.headers()['content-type']);

  const body = (await response.json()) as Record<string, unknown>;

  expect(typeof body['$schema']).toBe('string');
  expect(body['$id']).toBe(`https://aspire.dev${LATEST_PATH}`);
  expect(body['type']).toBe('object');
  expect(typeof body['title']).toBe('string');
});

for (const version of index.versions) {
  const slashlessPath = versionedPath(version);

  test(`versioned schema ${version} serves at ${slashlessPath}`, async ({ request }) => {
    const response = await request.get(slashlessPath);

    expect(response.ok(), `${slashlessPath} should return 200.`).toBe(true);
    expectJsonContentType(response.headers()['content-type']);

    const body = (await response.json()) as Record<string, unknown>;

    expect(body['$id']).toBe(`https://aspire.dev${slashlessPath}`);
    expect(body['type']).toBe('object');
    expect(typeof body['$schema']).toBe('string');
    expect(typeof body['title']).toBe('string');
  });
}
