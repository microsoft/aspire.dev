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
    const close = new RegExp(`^\\s*${open[2][0]}{${open[2].length},}\\s*$`);
    while (++index < lines.length && !close.test(lines[index])) body.push(lines[index]);
    const sample = body.join('\n');
    if (sample.includes('createBuilder')) samples.push(sample);
  }
  return samples;
}

function casingMismatches(sample: string, exported: Set<string>, byLowerCase: Map<string, string>) {
  const calls: string[] = [];
  const mismatches: string[] = [];
  for (const [, name] of sample.matchAll(/\.\s*([A-Za-z]\w*)\s*(?:<[^()]*>)?\s*\(/g)) {
    calls.push(name);
    const expected = byLowerCase.get(name.toLowerCase());
    if (expected && !exported.has(name)) mismatches.push(`${name} -> ${expected}`);
  }
  return { calls, mismatches };
}

describe('TypeScript AppHost samples', () => {
  const exported = exportedFunctionNames();
  const byLowerCase = new Map([...exported].map((name) => [name.toLowerCase(), name]));

  test('detects casing mismatches in every character of a method name', () => {
    const sample = [
      'const builder = await createBuilder();',
      'const db = await builder.addAzureCosmosDb("cosmos-db");',
      'const db2 = await builder.AddAzureCosmosDB("cosmos-db");',
      'const db3 = await builder.addAzureCosmosDB("cosmos-db");',
    ].join('\n');

    expect(casingMismatches(sample, exported, byLowerCase).mismatches).toEqual([
      'addAzureCosmosDb -> addAzureCosmosDB',
      'AddAzureCosmosDB -> addAzureCosmosDB',
    ]);
  });

  test('ends a sample at a longer closing fence', () => {
    const source = [
      '```typescript',
      'const builder = await createBuilder();',
      '````',
      '```csharp',
      'var builder = DistributedApplication.CreateBuilder(args);',
      '```',
    ].join('\n');

    expect(typeScriptAppHostSamples(source)).toEqual(['const builder = await createBuilder();']);
  });

  test('use the exact casing of exported Aspire TypeScript APIs', () => {
    const mismatches: string[] = [];
    let calls = 0;

    for (const path of englishDocs(docsRoot)) {
      for (const sample of typeScriptAppHostSamples(readFileSync(path, 'utf8'))) {
        const result = casingMismatches(sample, exported, byLowerCase);
        calls += result.calls.length;
        for (const mismatch of result.mismatches) {
          mismatches.push(`${relative(frontendRoot, path)}: ${mismatch}`);
        }
      }
    }

    expect(calls).toBeGreaterThan(0);
    expect(mismatches).toEqual([]);
  });
});
