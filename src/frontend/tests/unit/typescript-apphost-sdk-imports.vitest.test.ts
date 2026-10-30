import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';

const frontendRoot = join(import.meta.dirname, '../..');
const docsRoot = join(frontendRoot, 'src/content/docs');
const currentSdkImport = './.aspire/modules/aspire.mjs';

function docs(directory: string, files: string[] = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) docs(path, files);
    else if (/\.mdx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

function typeScriptFences(source: string) {
  const fences: { line: number; info: string; body: string }[] = [];
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const open = /^\s*(`{3,}|~{3,})\s*(?:typescript|ts|tsx)\b(.*)$/i.exec(lines[index]);
    if (!open) continue;
    const line = index + 1;
    const close = new RegExp(`^\\s*${open[1][0]}{${open[1].length},}\\s*$`);
    const body: string[] = [];
    while (++index < lines.length && !close.test(lines[index])) body.push(lines[index]);
    fences.push({ line, info: open[2], body: body.join('\n') });
  }
  return fences;
}

function legacySdkImports(source: string) {
  const problems: string[] = [];
  for (const fence of typeScriptFences(source)) {
    for (const [, specifier] of fence.body.matchAll(
      /\bfrom\s+['"]([^'"]*modules\/aspire\.m?js)['"]/g
    )) {
      if (specifier !== currentSdkImport) problems.push(`line ${fence.line}: ${specifier}`);
    }
    if (fence.body.includes(currentSdkImport) && /title="[^"]*\bapphost\.ts\b/.test(fence.info)) {
      problems.push(`line ${fence.line}: title names apphost.ts`);
    }
  }
  return problems;
}

describe('TypeScript AppHost SDK imports', () => {
  test('flags the pre-13.4 apphost.ts layout', () => {
    const source = [
      '```typescript title="TypeScript — apphost.ts"',
      "import { createBuilder } from './.modules/aspire.js';",
      '```',
      '```typescript title="apphost.ts"',
      "import { createBuilder } from './.aspire/modules/aspire.mjs';",
      '```',
      '```typescript title="apphost.mts"',
      "import { createBuilder } from './.aspire/modules/aspire.mjs';",
      '```',
    ].join('\n');

    expect(legacySdkImports(source)).toEqual([
      'line 1: ./.modules/aspire.js',
      'line 4: title names apphost.ts',
    ]);
  });

  test('samples in every locale use the apphost.mts layout', () => {
    const problems: string[] = [];
    for (const path of docs(docsRoot)) {
      const page = relative(docsRoot, path).split(sep).join('/');
      // Release notes intentionally show the legacy layout they migrate from.
      if (/^(?:[a-z]{2}(?:-[a-z]{2})?\/)?whats-new\//.test(page)) continue;
      for (const problem of legacySdkImports(readFileSync(path, 'utf8'))) {
        problems.push(`${page}: ${problem}`);
      }
    }

    expect(problems).toEqual([]);
  });
});
