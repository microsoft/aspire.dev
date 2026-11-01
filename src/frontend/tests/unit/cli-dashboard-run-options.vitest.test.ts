import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';

const frontendRoot = join(import.meta.dirname, '../..');
const docsRoot = join(frontendRoot, 'src/content/docs');
const referencePage = join(docsRoot, 'reference/cli/commands/aspire-dashboard-run.mdx');
const includesRoot = join(docsRoot, 'reference/cli/includes');
const localeDirs = new Set([
  'ja',
  'ru',
  'ko',
  'zh-cn',
  'fr',
  'pt-br',
  'hi',
  'de',
  'uk',
  'es',
  'it',
  'tr',
  'da',
  'id',
]);

function docFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return docFiles(path);
    return /\.mdx?$/.test(name) ? [path] : [];
  });
}

function flagsIn(text: string) {
  return [...text.matchAll(/(?<![\w-])(--?[A-Za-z][\w-]*)/g)].map((match) => match[1]);
}

function documentedOptions() {
  const page = readFileSync(referencePage, 'utf8');
  const options = page.slice(page.indexOf('## Options'), page.indexOf('## Examples'));
  const documented = new Set<string>();

  for (const [, file] of options.matchAll(/relativePath="reference\/cli\/includes\/([^"]+)"/g)) {
    const include = readFileSync(join(includesRoot, file), 'utf8');
    for (const [, term] of include.matchAll(/\*\*`([^`]+)`\*\*/g))
      flagsIn(term).forEach((f) => documented.add(f));
  }
  for (const [, term] of options.matchAll(/\*\*`([^`]+)`\*\*/g))
    flagsIn(term).forEach((f) => documented.add(f));

  return documented;
}

describe('aspire dashboard run reference', () => {
  test('documents every option the docs pass to aspire dashboard run', () => {
    const documented = documentedOptions();
    const files = docFiles(docsRoot).filter((path) => {
      const parts = relative(docsRoot, path).split(sep);
      return !localeDirs.has(parts[0]) && !parts.includes('whats-new');
    });
    const undocumented: string[] = [];

    for (const path of files) {
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          for (const [, args] of line.matchAll(/\baspire dashboard run\b([^`\n|]*)/g)) {
            // PascalCase arguments such as --Dashboard:Api:AuthMode=ApiKey or --AllowedHosts=...
            // are forwarded to the dashboard as configuration keys, not CLI options.
            const options = [...args.matchAll(/(?<![\w-])(--?[a-z][a-z0-9-]*)(?![\w:])/g)].map(
              (match) => match[1]
            );
            for (const option of options) {
              if (!documented.has(option)) {
                undocumented.push(`${relative(frontendRoot, path)}:${index + 1} ${option}`);
              }
            }
          }
        });
    }

    expect(documented).toContain('--frontend-url');
    expect(files.length).toBeGreaterThan(0);
    expect(undocumented).toEqual([]);
  });
});
