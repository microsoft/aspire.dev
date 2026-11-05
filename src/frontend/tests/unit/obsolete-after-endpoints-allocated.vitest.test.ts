import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';

const frontendRoot = join(import.meta.dirname, '../..');
const packagesRoot = join(frontendRoot, 'src/data/pkgs');
const docsRoot = join(frontendRoot, 'src/content/docs');

type PackageApi = {
  types: {
    name: string;
    attributes?: { name: string; constructorArguments?: string[] }[];
  }[];
};

function latestHostingApi(): string {
  const versions = readdirSync(packagesRoot)
    .map((name) => /^Aspire\.Hosting\.(\d+(?:\.\d+)*)\.json$/.exec(name)?.[1])
    .filter((version): version is string => Boolean(version))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const latest = versions.at(-1);
  if (!latest) throw new Error('No stable Aspire.Hosting package API data found.');
  return join(packagesRoot, `Aspire.Hosting.${latest}.json`);
}

function docFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return docFiles(path);
    return /\.mdx?$/.test(name) ? [path] : [];
  });
}

describe('endpoint allocation event samples', () => {
  test('AfterEndpointsAllocatedEvent is obsolete in favor of ResourceEndpointsAllocatedEvent', () => {
    const api = JSON.parse(readFileSync(latestHostingApi(), 'utf8')) as PackageApi;
    const type = api.types.find((t) => t.name === 'AfterEndpointsAllocatedEvent');
    const obsolete = type?.attributes?.find((a) => a.name === 'System.ObsoleteAttribute');

    expect(obsolete?.constructorArguments?.join(' ')).toContain('ResourceEndpointsAllocatedEvent');
  });

  test('docs do not use the obsolete AfterEndpointsAllocatedEvent', () => {
    const files = docFiles(docsRoot).filter((path) => !path.split(sep).includes('whats-new'));
    const offenders: string[] = [];

    for (const path of files) {
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (/\bAfterEndpointsAllocatedEvent\b/.test(line)) {
            offenders.push(`${relative(frontendRoot, path)}:${index + 1}`);
          }
        });
    }

    expect(files.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
