import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';

const frontendRoot = join(import.meta.dirname, '../..');
const sampleRoots = ['src/content/docs', 'src/components'].map((dir) => join(frontendRoot, dir));

// AppHost APIs removed from Aspire. What's new pages may still mention them as history.
const removedApis = [{ name: 'AddNpmApp', replacement: 'AddJavaScriptApp' }];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(mdx?|astro)$/.test(name) ? [path] : [];
  });
}

describe('AppHost code samples', () => {
  test("do not call removed AppHost APIs outside What's new history", () => {
    const files = sampleRoots
      .flatMap(sourceFiles)
      .filter((path) => !path.split(sep).includes('whats-new'));
    const offenders: string[] = [];

    for (const path of files) {
      const lines = readFileSync(path, 'utf8').split('\n');
      lines.forEach((line, index) => {
        for (const { name, replacement } of removedApis) {
          if (new RegExp(`\\.\\s*${name}\\s*\\(`).test(line)) {
            offenders.push(
              `${relative(frontendRoot, path)}:${index + 1} uses ${name} (use ${replacement})`
            );
          }
        }
      });
    }

    expect(files.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
