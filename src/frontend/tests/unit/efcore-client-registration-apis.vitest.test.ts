import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';

const frontendRoot = join(import.meta.dirname, '../..');
const docsRoot = join(frontendRoot, 'src/content/docs');
const packagesRoot = join(frontendRoot, 'src/data/pkgs');

type PackageApi = {
  types: { members?: { name: string }[] }[];
};

function docFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return docFiles(path);
    return /\.mdx?$/.test(name) ? [path] : [];
  });
}

function efCoreRegistrationMethods() {
  const methods = new Set<string>();

  for (const file of readdirSync(packagesRoot).filter((name) =>
    name.includes('EntityFrameworkCore')
  )) {
    const api = JSON.parse(readFileSync(join(packagesRoot, file), 'utf8')) as PackageApi;
    for (const type of api.types) {
      for (const member of type.members ?? []) methods.add(member.name);
    }
  }

  return methods;
}

describe('EF Core client integration docs', () => {
  test('only reference DbContext registration methods that exist in the package APIs', () => {
    const methods = efCoreRegistrationMethods();
    const files = docFiles(docsRoot).filter((path) => !path.split(sep).includes('whats-new'));
    const missing: string[] = [];

    for (const path of files) {
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          // Provider-specific Aspire methods such as AddCosmosDbContext or EnrichNpgsqlDbContext.
          // EF Core's own AddDbContext/AddDbContextPool have nothing between the verb and DbContext.
          for (const [, method] of line.matchAll(/\b((?:Add|Enrich)\w+DbContext)\b/g)) {
            if (!methods.has(method)) {
              missing.push(`${relative(frontendRoot, path)}:${index + 1} ${method}`);
            }
          }
        });
    }

    expect(methods).toContain('AddCosmosDbContext');
    expect(methods).toContain('EnrichSqlServerDbContext');
    expect(missing).toEqual([]);
  });
});
