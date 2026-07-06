import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(testsDir, '..', '..');

function read(relativePath: string): string {
  return readFileSync(path.join(frontendRoot, relativePath), 'utf8');
}

function exists(relativePath: string): boolean {
  return existsSync(path.join(frontendRoot, relativePath));
}

test('head attrs reference static analytics scripts', () => {
  const headAttrs = read('config/head.attrs.ts');

  expect(headAttrs).toMatch(/src:\s*'\/scripts\/analytics\/1ds\.js'/);
  expect(headAttrs).toMatch(/src:\s*'\/scripts\/analytics\/track\.js'/);
  expect(headAttrs).not.toMatch(/src:\s*'\/1ds\//);
  expect(headAttrs).not.toMatch(/src:\s*'\/track\//);
});

test('analytics scripts live in public assets and legacy routes are gone', () => {
  expect(exists('public/scripts/analytics/1ds.js')).toBe(true);
  expect(exists('public/scripts/analytics/track.js')).toBe(true);
  expect(exists('public/scripts/1ds.js')).toBe(false);
  expect(exists('public/scripts/track.js')).toBe(false);
  expect(exists('src/pages/1ds.js')).toBe(false);
  expect(exists('src/pages/track.js')).toBe(false);
});

test('analytics asset files contain javascript bootstrap code', () => {
  const oneDsScript = read('public/scripts/analytics/1ds.js');
  const trackScript = read('public/scripts/analytics/track.js');

  expect(oneDsScript).toMatch(/oneDS\.ApplicationInsights/);
  expect(trackScript).toMatch(/capturePageAction/);
  expect(oneDsScript.trimStart().startsWith('<')).toBe(false);
  expect(trackScript.trimStart().startsWith('<')).toBe(false);
});
