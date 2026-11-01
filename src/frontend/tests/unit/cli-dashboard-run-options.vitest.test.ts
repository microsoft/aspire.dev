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

// Joins Bash (`\`) and PowerShell (`` ` ``) continuation lines into one logical command,
// keeping the 1-based line number where each command starts.
function logicalLines(text: string) {
  const result: { text: string; line: number }[] = [];
  let current: { text: string; line: number } | undefined;

  text.split('\n').forEach((raw, index) => {
    const continued = /\s[\\`]\s*$/.test(raw);
    const part = continued ? raw.replace(/\s[\\`]\s*$/, ' ') : raw;
    if (current) current.text += part;
    else current = { text: part, line: index + 1 };
    if (!continued) {
      result.push(current);
      current = undefined;
    }
  });
  if (current) result.push(current);

  return result;
}

function undocumentedOptionsIn(text: string, documented: Set<string>) {
  const undocumented: { line: number; option: string }[] = [];

  for (const { text: command, line } of logicalLines(text)) {
    for (const [, args] of command.matchAll(/\baspire dashboard run\b([^`\n|]*)/g)) {
      // PascalCase arguments such as --Dashboard:Api:AuthMode=ApiKey or --AllowedHosts=...
      // are forwarded to the dashboard as configuration keys, not CLI options.
      for (const [, option] of args.matchAll(/(?<![\w-])(--?[a-z][a-z0-9-]*)(?![\w:])/g)) {
        if (!documented.has(option)) undocumented.push({ line, option });
      }
    }
  }

  return undocumented;
}

describe('aspire dashboard run reference', () => {
  test('detects options on Bash and PowerShell continuation lines', () => {
    const documented = new Set(['--frontend-url']);
    const bash = [
      '```bash',
      'aspire dashboard run \\',
      '    --frontend-url http://localhost:9000 \\',
      '    --Dashboard:Api:AuthMode=ApiKey \\',
      '    --not-a-real-option',
      '```',
    ].join('\n');
    const powershell = [
      '```powershell',
      'aspire dashboard run `',
      '    --frontend-url http://localhost:9000 `',
      '    --Dashboard:Api:AuthMode=ApiKey `',
      '    --not-a-real-option',
      '```',
    ].join('\n');

    expect(undocumentedOptionsIn(bash, documented)).toEqual([
      { line: 2, option: '--not-a-real-option' },
    ]);
    expect(undocumentedOptionsIn(powershell, documented)).toEqual([
      { line: 2, option: '--not-a-real-option' },
    ]);
  });

  test('documents every option the docs pass to aspire dashboard run', () => {
    const documented = documentedOptions();
    const files = docFiles(docsRoot).filter((path) => {
      const parts = relative(docsRoot, path).split(sep);
      return !localeDirs.has(parts[0]) && !parts.includes('whats-new');
    });
    const undocumented = files.flatMap((path) =>
      undocumentedOptionsIn(readFileSync(path, 'utf8'), documented).map(
        ({ line, option }) => `${relative(frontendRoot, path)}:${line} ${option}`
      )
    );

    expect(documented).toContain('--frontend-url');
    expect(files.length).toBeGreaterThan(0);
    expect(undocumented).toEqual([]);
  });
});
