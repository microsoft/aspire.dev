#!/usr/bin/env node
// Bundles the client scripts of the site (M3 of docs/douze-migration-plan.md, section 4.4).
//
//   node scripts/build-client.mjs [inputDir] [outputDir]
//
// inputDir defaults to src/site/scripts/client (a folder holding scripts/client/site.ts, such as the batch
// step's inputs folder, works too) and outputDir to src/site; the bundles are written to <outputDir>/assets/js.
// The workflow runs it as a batch command step (`node scripts/build-client.mjs {{ inputs }} {{ outputs }}`);
// by hand, run `node scripts/build-client.mjs` from src/site.
//
// Outputs (gitignored build outputs):
//   assets/js/site.js            the single ES module entry (scripts/client/site.ts), with linked source map
//   assets/js/ResourceBrowser.js the <resource-browser> controller, a second entry that the browse page loads as a
//                                module script (ResourceBrowser.astro's page script): the window's load event waits
//                                for it, which the catalog's readiness script relies on, and the e2e specs block
//                                **/*ResourceBrowser* to simulate it failing
//   assets/js/chunks/*.js        the lazy chunks (mermaid, asciinema-player, page-specific scripts)
//   assets/js/inline/*.js        the pre-paint scripts (scripts/client/inline/*.ts) as minified IIFEs, for the
//                                partials to load as classic blocking scripts or to inline
//   assets/js/vendor/*.css       third party stylesheets the scripts need (tippy.js, asciinema-player)
//
// esbuild and the third party packages (mermaid, tippy.js, asciinema-player) are resolved from
// src/frontend/node_modules until src/site has its own package.json (M6).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendRoot = path.resolve(siteRoot, '../frontend');
const nodeModules = [path.join(siteRoot, 'node_modules'), path.join(frontendRoot, 'node_modules')].filter((p) =>
  fs.existsSync(p)
);

function loadEsbuild() {
  const bases = [
    path.join(siteRoot, 'package.json'),
    path.join(frontendRoot, 'package.json'),
    // pnpm keeps transitive packages (esbuild comes with astro/vite) in its virtual store.
    path.join(frontendRoot, 'node_modules/.pnpm/node_modules/'),
  ];
  for (const base of bases) {
    try {
      return createRequire(base)('esbuild');
    } catch {}
  }
  throw new Error('esbuild not found: run `bun install` in src/frontend.');
}

const esbuild = loadEsbuild();

const inputDir = path.resolve(siteRoot, process.argv[2] ?? 'scripts/client');
// The second argument is a folder that mirrors the site (the batch step's outputs folder): the bundles go
// to <outputDir>/assets/js. Without it they go to src/site/assets/js.
const outDir = path.resolve(process.argv[3] ?? siteRoot, 'assets/js');

// When Douze passes the batch inputs folder, the sources are at their site path under it.
const clientDir = fs.existsSync(path.join(inputDir, 'scripts/client/site.ts'))
  ? path.join(inputDir, 'scripts/client')
  : inputDir;
const fromFrontend = path.join(clientDir, 'from-frontend');

const common = {
  bundle: true,
  minify: true,
  target: 'es2022',
  platform: 'browser',
  legalComments: 'none',
  logLevel: 'warning',
  nodePaths: nodeModules,
  // The helpers copied from src/frontend keep their import aliases (src/frontend/tsconfig.json paths).
  alias: {
    '@utils': path.join(fromFrontend, 'src/utils'),
    '@components': path.join(fromFrontend, 'src/components'),
    '@scripts': path.join(fromFrontend, 'src/scripts'),
  },
  // Pagefind's files exist only in the built site.
  external: ['/pagefind/*'],
  // CSS imported by third party modules is shipped separately (assets/js/vendor).
  loader: { '.css': 'empty' },
};

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

await esbuild.build({
  ...common,
  entryPoints: {
    site: path.join(clientDir, 'site.ts'),
    ResourceBrowser: path.join(fromFrontend, 'src/components/dev-center/ResourceBrowser.ts'),
  },
  outdir: outDir,
  format: 'esm',
  splitting: true,
  sourcemap: 'linked',
  chunkNames: 'chunks/[name]-[hash]',
  entryNames: '[name]',
});

const inlineDir = path.join(clientDir, 'inline');
const inlineEntries = fs.existsSync(inlineDir)
  ? fs.readdirSync(inlineDir).filter((f) => f.endsWith('.ts')).map((f) => path.join(inlineDir, f))
  : [];
if (inlineEntries.length > 0) {
  await esbuild.build({
    ...common,
    entryPoints: inlineEntries,
    outdir: path.join(outDir, 'inline'),
    format: 'iife',
    sourcemap: false,
  });
}

const vendorCss = {
  'tippy.css': 'tippy.js/dist/tippy.css',
  'asciinema-player.css': 'asciinema-player/dist/bundle/asciinema-player.css',
};
fs.mkdirSync(path.join(outDir, 'vendor'), { recursive: true });
for (const [name, request] of Object.entries(vendorCss)) {
  const source = nodeModules.map((p) => path.join(p, request)).find((p) => fs.existsSync(p));
  if (!source) throw new Error(`build-client: ${request} not found in ${nodeModules.join(', ')}`);
  fs.copyFileSync(source, path.join(outDir, 'vendor', name));
}

const files = fs.readdirSync(outDir, { recursive: true }).filter((f) => !fs.statSync(path.join(outDir, f)).isDirectory());
console.log(`build-client: ${files.length} files in ${path.relative(process.cwd(), outDir) || '.'}`);

// The pre-paint scripts are also written as Liquid partials (templates/partials/inline/<name>.liquid), so that the
// head and sidebar partials inline them in <script> elements, as the former site did: a page must apply the theme and
// the stored preferences before the first paint, and the specs block external script requests.
{
  const outInline = path.join(outDir, 'inline');
  const partials = path.join(siteRoot, 'templates', 'partials', 'inline');
  if (fs.existsSync(outInline)) {
    fs.mkdirSync(partials, { recursive: true });
    for (const f of fs.readdirSync(outInline).filter((f) => f.endsWith('.js'))) {
      const js = fs.readFileSync(path.join(outInline, f), 'utf8');
      if (js.includes('{{') || js.includes('{%')) throw new Error(`${f} contains Liquid syntax; it cannot be inlined as a partial`);
      fs.writeFileSync(path.join(partials, f.replace(/\.js$/, '.liquid')), js);
    }
  }
}
