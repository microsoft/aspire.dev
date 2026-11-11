// Loads the unified/remark stack from src/frontend/node_modules.
//
// src/site has no node_modules of its own yet, and pnpm does not hoist transitive packages (remark-parse,
// remark-mdx, acorn, yaml) to the top of src/frontend/node_modules: they live in node_modules/.pnpm/node_modules.
// This resolver looks in both places and imports the package's ESM entry by file URL, so the converter runs with
// `(cd src/frontend && bunx tsx ../site/scripts/convert-mdx/convert.ts)` without adding dependencies.
// CONVERT_MDX_NODE_MODULES overrides the folder.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '../../../..');
const nodeModules =
  process.env.CONVERT_MDX_NODE_MODULES ?? path.join(repoRoot, 'src', 'frontend', 'node_modules');

function packageDir(name: string): string {
  for (const dir of [path.join(nodeModules, name), path.join(nodeModules, '.pnpm', 'node_modules', name)]) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
  }
  throw new Error(`convert-mdx: package '${name}' not found under ${nodeModules}`);
}

function pickExport(entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry;
  if (Array.isArray(entry)) {
    for (const e of entry) {
      const r = pickExport(e);
      if (r) return r;
    }
    return undefined;
  }
  if (entry && typeof entry === 'object') {
    const o = entry as Record<string, unknown>;
    for (const condition of ['import', 'node', 'default']) {
      if (condition in o) {
        const r = pickExport(o[condition]);
        if (r) return r;
      }
    }
  }
  return undefined;
}

async function load<T = any>(name: string): Promise<T> {
  const dir = packageDir(name);
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  let entry: string | undefined;
  if (pkg.exports !== undefined) {
    const root = typeof pkg.exports === 'object' && !Array.isArray(pkg.exports) && '.' in pkg.exports ? pkg.exports['.'] : pkg.exports;
    entry = pickExport(root);
  }
  entry ??= pkg.module ?? pkg.main ?? 'index.js';
  return import(pathToFileURL(path.join(dir, entry!)).href) as Promise<T>;
}

const [unifiedMod, remarkParseMod, remarkMdxMod, remarkGfmMod, remarkDirectiveMod, acornMod, yamlMod] = await Promise.all([
  load('unified'),
  load('remark-parse'),
  load('remark-mdx'),
  load('remark-gfm'),
  load('remark-directive'),
  load('acorn'),
  load('yaml'),
]);

export const unified = unifiedMod.unified as () => any;
export const remarkParse = remarkParseMod.default;
export const remarkMdx = remarkMdxMod.default;
export const remarkGfm = remarkGfmMod.default;
export const remarkDirective = remarkDirectiveMod.default;
export const acorn = acornMod as { parseExpressionAt: (input: string, pos: number, options: any) => any };
export const YAML: any = yamlMod.default ?? yamlMod;
