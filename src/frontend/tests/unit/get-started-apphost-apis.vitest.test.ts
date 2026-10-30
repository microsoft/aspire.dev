import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

const frontendRoot = join(import.meta.dirname, '../..');
const getStartedRoot = join(frontendRoot, 'src/content/docs/get-started');
const packagesRoot = join(frontendRoot, 'src/data/pkgs');

type PackageApi = { types: { members?: { name: string }[] }[] };

function publishedMemberNames() {
  const names = new Set<string>();
  for (const file of readdirSync(packagesRoot).filter((name) => name.endsWith('.json'))) {
    const api = JSON.parse(readFileSync(join(packagesRoot, file), 'utf8')) as PackageApi;
    for (const type of api.types) {
      for (const member of type.members ?? []) names.add(member.name.split('<')[0]);
    }
  }
  return names;
}

function csharpAppHostSamples(source: string) {
  const samples: string[] = [];
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const open = /^(\s*)(`{3,}|~{3,})\s*(?:csharp|cs|c#)\b/i.exec(lines[index]);
    if (!open) continue;
    const body: string[] = [];
    while (++index < lines.length && lines[index].trim() !== open[2]) body.push(lines[index]);
    const sample = body.join('\n');
    if (sample.includes('DistributedApplication.CreateBuilder')) samples.push(sample);
  }
  return samples;
}

describe('get-started AppHost samples', () => {
  test('only call AppHost builder APIs published by the current Aspire packages', () => {
    const members = publishedMemberNames();
    const missing: string[] = [];
    let calls = 0;

    for (const file of readdirSync(getStartedRoot).filter((name) => /\.mdx?$/.test(name))) {
      const path = join(getStartedRoot, file);
      for (const sample of csharpAppHostSamples(readFileSync(path, 'utf8'))) {
        for (const [, name] of sample.matchAll(
          /\bbuilder\s*\.\s*(Add[A-Z]\w*)\s*(?:<[^()]*>)?\s*\(/g
        )) {
          calls++;
          if (!members.has(name)) missing.push(`${relative(frontendRoot, path)}: ${name}`);
        }
      }
    }

    expect(calls).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
