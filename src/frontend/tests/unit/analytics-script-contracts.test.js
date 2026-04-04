import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(testsDir, '..', '..');

function read(relativePath) {
  return readFileSync(path.join(frontendRoot, relativePath), 'utf8');
}

function exists(relativePath) {
  return existsSync(path.join(frontendRoot, relativePath));
}

test('head attrs reference static analytics scripts', () => {
  const headAttrs = read('config/head.attrs.ts');

  assert.match(headAttrs, /src:\s*'\/scripts\/analytics\/1ds\.js'/);
  assert.match(headAttrs, /src:\s*'\/scripts\/analytics\/track\.js'/);
  assert.doesNotMatch(headAttrs, /src:\s*'\/1ds\/'/);
  assert.doesNotMatch(headAttrs, /src:\s*'\/track\/'/);
});

test('analytics scripts live in public assets and legacy routes are gone', () => {
  assert.equal(exists('public/scripts/analytics/1ds.js'), true);
  assert.equal(exists('public/scripts/analytics/track.js'), true);
  assert.equal(exists('public/scripts/1ds.js'), false);
  assert.equal(exists('public/scripts/track.js'), false);
  assert.equal(exists('src/pages/1ds.js'), false);
  assert.equal(exists('src/pages/track.js'), false);
});

test('analytics asset files contain javascript bootstrap code', () => {
  const oneDsScript = read('public/scripts/analytics/1ds.js');
  const trackScript = read('public/scripts/analytics/track.js');

  assert.match(oneDsScript, /oneDS\.ApplicationInsights/);
  assert.match(trackScript, /capturePageAction/);
  assert.equal(oneDsScript.trimStart().startsWith('<'), false);
  assert.equal(trackScript.trimStart().startsWith('<'), false);
});
