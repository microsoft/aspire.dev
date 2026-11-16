import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';

const frontendRoot = join(import.meta.dirname, '../..');
const packagesRoot = join(frontendRoot, 'src/data/pkgs');
const docsRoot = join(frontendRoot, 'src/content/docs');

type PackageApi = {
  package: { name: string };
  types: {
    name: string;
    members?: { name: string; attributes?: { name: string; constructorArguments?: string[] }[] }[];
  }[];
};

function obsoleteInitBindMountPackages() {
  const packages = new Set<string>();
  for (const file of readdirSync(packagesRoot).filter((name) => name.endsWith('.json'))) {
    const api = JSON.parse(readFileSync(join(packagesRoot, file), 'utf8')) as PackageApi;
    for (const type of api.types) {
      for (const member of type.members ?? []) {
        if (!member.name.startsWith('WithInitBindMount')) continue;
        const obsolete = member.attributes?.find((a) => a.name === 'System.ObsoleteAttribute');
        if (obsolete?.constructorArguments?.some((arg) => arg.includes('WithInitFiles'))) {
          packages.add(api.package.name);
        }
      }
    }
  }
  return packages;
}

function docFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return docFiles(path);
    return /\.mdx?$/.test(name) ? [path] : [];
  });
}

describe('database init file samples', () => {
  test('WithInitBindMount is obsolete in favor of WithInitFiles', () => {
    expect([...obsoleteInitBindMountPackages()]).toEqual(
      expect.arrayContaining([
        'Aspire.Hosting.MongoDB',
        'Aspire.Hosting.MySql',
        'Aspire.Hosting.PostgreSQL',
      ])
    );
  });

  test('docs use WithInitFiles instead of the obsolete WithInitBindMount', () => {
    const files = docFiles(docsRoot).filter((path) => !path.split(sep).includes('whats-new'));
    const offenders: string[] = [];

    for (const path of files) {
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (/\bwithInitBindMount\b/i.test(line)) {
            offenders.push(`${relative(frontendRoot, path)}:${index + 1}`);
          }
        });
    }

    expect(files.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
