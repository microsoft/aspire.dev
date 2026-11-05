import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';

const frontendRoot = join(import.meta.dirname, '../..');
const docsRoot = join(frontendRoot, 'src/content/docs');

function docFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return docFiles(path);
    return /\.mdx?$/.test(name) ? [path] : [];
  });
}

describe('endpoint allocation event samples', () => {
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
