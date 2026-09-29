import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const astroRequire = createRequire(require.resolve('astro/package.json'));
const viteCli = path.join(path.dirname(astroRequire.resolve('vite/package.json')), 'bin', 'vite.js');

test('the catalog runs from a relocated prerender bundle without source-directory discovery', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aspire-catalog-prerender-'));
  const output = path.join(directory, 'dist', '.prerender');
  const config = path.join(directory, 'vite.config.mjs');
  const redirectsUrl = pathToFileURL(path.join(root, 'config', 'redirects.mjs')).href;
  const content = `export async function getCollection(name) {
    return name === 'docs' ? [{
      id: 'get-started/welcome',
      data: { title: 'Redirected article', description: 'Must not appear in Browse.' }
    }] : [];
  }`;
  try {
    await writeFile(config, `
      import { redirects } from ${JSON.stringify(redirectsUrl)};
      export default {
        root: ${JSON.stringify(root)},
        logLevel: 'silent',
        resolve: { alias: {
          '@data': ${JSON.stringify(path.join(root, 'src', 'data'))},
          '@utils': ${JSON.stringify(path.join(root, 'src', 'utils'))}
        } },
        define: { __ASPIRE_REDIRECT_PATHS__: JSON.stringify(Object.keys(redirects)) },
        plugins: [{
          name: 'fixture-content',
          resolveId(id) { if (id === 'astro:content') return '\\0fixture-content'; },
          load(id) { if (id === '\\0fixture-content') return ${JSON.stringify(content)}; }
        }],
        ssr: { noExternal: true },
        build: {
          ssr: ${JSON.stringify(path.join(root, 'src', 'utils', 'dev-center', 'catalog.ts'))},
          outDir: ${JSON.stringify(output)},
          rollupOptions: { output: { entryFileNames: 'catalog.mjs' } }
        }
      };
    `);
    await exec(process.execPath, [viteCli, 'build', '--config', config], { cwd: root });
    const bundle = pathToFileURL(path.join(output, 'catalog.mjs')).href;
    const { stdout } = await exec(process.execPath, ['--input-type=module', '-e', `
      const { getResourceCatalog } = await import(${JSON.stringify(bundle)});
      const resources = await getResourceCatalog();
      if (!resources.length) throw new Error('Expected the generated resource catalog.');
      if (resources.some(({ href }) => href === '/get-started/welcome/')) {
        throw new Error('Configured redirects must stay excluded after bundling.');
      }
      console.log('Prerender catalog passed');
    `], { cwd: directory });
    expect(stdout.trim()).toBe('Prerender catalog passed');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
