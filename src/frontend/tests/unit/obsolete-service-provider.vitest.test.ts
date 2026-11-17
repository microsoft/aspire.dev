import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';

const frontendRoot = join(import.meta.dirname, '../..');
const packagesRoot = join(frontendRoot, 'src/data/pkgs');
const sampleRoots = ['src/content/docs', 'src/components'].map((dir) => join(frontendRoot, dir));

type PackageApi = {
  types: {
    name: string;
    members?: { name: string; attributes?: { name: string; constructorArguments?: string[] }[] }[];
  }[];
};

function obsoleteServiceProviderTypes() {
  const types = new Set<string>();
  for (const file of readdirSync(packagesRoot).filter((name) => name.endsWith('.json'))) {
    const api = JSON.parse(readFileSync(join(packagesRoot, file), 'utf8')) as PackageApi;
    for (const type of api.types) {
      const member = type.members?.find((m) => m.name === 'ServiceProvider');
      const obsolete = member?.attributes?.find((a) => a.name === 'System.ObsoleteAttribute');
      if (obsolete?.constructorArguments?.some((arg) => arg.includes('Services'))) {
        types.add(type.name);
      }
    }
  }
  return types;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(mdx?|astro)$/.test(name) ? [path] : [];
  });
}

describe('AppHost context samples', () => {
  test('ExecuteCommandContext.ServiceProvider is an obsolete alias for Services', () => {
    expect(obsoleteServiceProviderTypes()).toContain('ExecuteCommandContext');
  });

  test('use Services instead of the obsolete ServiceProvider alias', () => {
    const files = sampleRoots
      .flatMap(sourceFiles)
      .filter((path) => !path.split(sep).includes('whats-new'));
    const offenders: string[] = [];

    for (const path of files) {
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          // IServiceScope.ServiceProvider is not obsolete, so `scope.ServiceProvider` stays valid.
          if (/(?<!\bscope)\.ServiceProvider\b/.test(line)) {
            offenders.push(`${relative(frontendRoot, path)}:${index + 1}`);
          }
        });
    }

    expect(files.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
