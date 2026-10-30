import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

const frontendRoot = join(import.meta.dirname, '../..');
const docsRoot = join(frontendRoot, 'src/content/docs');
const modulesRoot = join(frontendRoot, 'src/data/ts-modules');
const localeDirectories = new Set([
  'da',
  'de',
  'es',
  'fr',
  'hi',
  'id',
  'it',
  'ja',
  'ko',
  'pt-br',
  'ru',
  'tr',
  'uk',
  'zh-cn',
]);

type TypeScriptModule = { functions: { name: string }[] };

function exportedFunctionNames() {
  const names = new Set<string>();
  for (const file of readdirSync(modulesRoot).filter((name) => name.endsWith('.json'))) {
    const module = JSON.parse(readFileSync(join(modulesRoot, file), 'utf8')) as TypeScriptModule;
    for (const fn of module.functions) names.add(fn.name);
  }
  return names;
}

function englishDocs(directory: string, files: string[] = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (directory !== docsRoot || !localeDirectories.has(entry.name)) englishDocs(path, files);
    } else if (/\.mdx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

function typeScriptAppHostSamples(source: string) {
  const samples: string[] = [];
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const open = /^(\s*)(`{3,}|~{3,})\s*(?:typescript|ts)\b/i.exec(lines[index]);
    if (!open) continue;
    const body: string[] = [];
    while (++index < lines.length && lines[index].trim() !== open[2]) body.push(lines[index]);
    const sample = body.join('\n');
    if (sample.includes('createBuilder')) samples.push(sample);
  }
  return samples;
}

describe('TypeScript AppHost samples', () => {
  test('use the exact casing of exported Aspire TypeScript APIs', () => {
    const exported = exportedFunctionNames();
    const byLowerCase = new Map([...exported].map((name) => [name.toLowerCase(), name]));
    const mismatches: string[] = [];
    let calls = 0;

    for (const path of englishDocs(docsRoot)) {
      for (const sample of typeScriptAppHostSamples(readFileSync(path, 'utf8'))) {
        for (const [, name] of sample.matchAll(/\.\s*([a-z]\w*)\s*(?:<[^()]*>)?\s*\(/g)) {
          calls++;
          const expected = byLowerCase.get(name.toLowerCase());
          if (expected && !exported.has(name)) {
            mismatches.push(`${relative(frontendRoot, path)}: ${name} -> ${expected}`);
          }
        }
      }
    }

    expect(calls).toBeGreaterThan(0);
    expect(mismatches).toEqual([]);
  });
});
