#!/usr/bin/env node
// Bundles the site's stylesheet with Lightning CSS (a native Rust CSS parser, bundler and minifier).
//
//   assets/css/site-entry.css  (source of truth: the @import order, see its header)
//     -> assets/css/site.css   (build output, gitignored: imports inlined, @layer order kept, minified,
//                               lowered for the browser targets below, with a linked source map)
//
// Usage (from src/site): node scripts/build-css.mjs [entry] [output]
// As a workflow step: `node scripts/build-css.mjs assets/css/site-entry.css {{ outputs }}/assets/css/site.css`.
//
// It calls the `lightningcss` package's native binding (`bundleAsync`), which is the same engine as
// `lightningcss --bundle --minify --targets ...` (the lightningcss-cli package); the binding is already installed
// with the frontend's dependencies (resolved from src/site/node_modules first, then from src/frontend's), so no
// extra package is needed. An @import of a missing `api-*.css` file (the API reference workstream's) is replaced by
// nothing with a warning, so the chrome builds before those files exist; any other missing import is an error.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.resolve(siteDir, process.argv[2] ?? 'assets/css/site-entry.css');
const output = path.resolve(siteDir, process.argv[3] ?? 'assets/css/site.css');

function loadLightningCss() {
  const candidates = [
    path.join(siteDir, 'package.json'),
    path.join(siteDir, '../frontend/package.json'),
    path.join(siteDir, '../frontend/node_modules/.pnpm/node_modules/lightningcss/package.json'),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      return createRequire(candidate)(candidate.endsWith('lightningcss/package.json') ? path.dirname(candidate) : 'lightningcss');
    } catch {
      // try the next location
    }
  }
  throw new Error('lightningcss not found: install it in src/site (or src/frontend)');
}

const { bundleAsync } = loadLightningCss();

// Vite's default build targets (the "baseline widely available" browsers the Astro build compiled for).
const version = (major, minor = 0) => (major << 16) | (minor << 8);
const targets = { chrome: version(107), edge: version(107), firefox: version(104), safari: version(16) };

const optionalMissing = /(^|[\\/])api-[^\\/]*\.css$/;
const warnings = [];

const result = await bundleAsync({
  filename: entry,
  minify: true,
  sourceMap: true,
  targets,
  errorRecovery: false,
  resolver: {
    read(file) {
      if (!existsSync(file) && optionalMissing.test(file)) {
        warnings.push(`optional import missing, skipped: ${path.relative(siteDir, file)}`);
        return '';
      }
      return readFileSync(file, 'utf8');
    },
  },
});

for (const warning of result.warnings ?? []) {
  warnings.push(`${warning.message} (${warning.loc ? `${path.relative(siteDir, warning.loc.filename)}:${warning.loc.line}` : 'no location'})`);
}

mkdirSync(path.dirname(output), { recursive: true });
const mapName = `${path.basename(output)}.map`;
writeFileSync(output, `${result.code.toString()}\n/*# sourceMappingURL=${mapName} */\n`);
if (result.map) writeFileSync(path.join(path.dirname(output), mapName), result.map);

for (const warning of warnings) console.warn(`build-css: ${warning}`);
console.log(`build-css: ${path.relative(process.cwd(), output)} (${(result.code.length / 1024).toFixed(0)} KB)`);
