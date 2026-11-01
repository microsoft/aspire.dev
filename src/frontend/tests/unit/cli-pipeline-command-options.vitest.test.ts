import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';

const frontendRoot = join(import.meta.dirname, '../..');
const docsRoot = join(frontendRoot, 'src/content/docs');
const commandsRoot = join(docsRoot, 'reference/cli/commands');
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
const pipelineCommands = ['deploy', 'destroy', 'do', 'publish'];

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

function documentedOptions(command: string) {
  const page = readFileSync(join(commandsRoot, `aspire-${command}.mdx`), 'utf8');
  const start = page.indexOf('## Options');
  const end = page.indexOf('\n## ', start + 1);
  const options = page.slice(start, end === -1 ? undefined : end);
  const documented = new Set<string>();
  const addTerms = (text: string) => {
    for (const [, term] of text.matchAll(/\*\*`([^`]+)`\*\*/g))
      flagsIn(term).forEach((f) => documented.add(f));
  };

  addTerms(options);
  for (const [, file] of options.matchAll(/relativePath="reference\/cli\/includes\/([^"]+)"/g)) {
    addTerms(readFileSync(join(includesRoot, file), 'utf8'));
  }
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

function undocumentedOptionsIn(text: string, documented: Map<string, Set<string>>) {
  const undocumented: { line: number; command: string; option: string }[] = [];
  const invocation = new RegExp(`\\baspire (${pipelineCommands.join('|')})\\b([^\`\\n|]*)`, 'g');

  for (const { text: logical, line } of logicalLines(text)) {
    for (const [, command, rest] of logical.matchAll(invocation)) {
      const known = documented.get(command)!;
      // Arguments after `--` go to the AppHost.
      const args = rest.split(/\s--(?:\s|$)/)[0];
      // Keys with a configuration path, such as --Parameters:name=value, are forwarded to the
      // AppHost, so they are skipped here.
      for (const [, option] of args.matchAll(/(?<![\w-])(--?[A-Za-z][\w-]*)(?![\w:])/g)) {
        if (known.has(option)) continue;
        const miscased = [...known].find((name) => name.toLowerCase() === option.toLowerCase());
        // Other PascalCase names are forwarded AppHost configuration keys, unless they only
        // differ in case from a CLI option, which System.CommandLine matches case-sensitively.
        if (!miscased && /[A-Z]/.test(option)) continue;
        undocumented.push({ line, command, option });
      }
    }
  }

  return undocumented;
}

describe('aspire pipeline command samples', () => {
  const documented = new Map(
    pipelineCommands.map((command) => [command, documentedOptions(command)])
  );

  test('checks continuation lines, option casing, and forwarded arguments', () => {
    const bash = [
      'aspire publish \\',
      '  --project AppHost/AppHost.csproj \\',
      '  --output_path ./artifacts',
      'aspire deploy --Environment Production --Parameters:hostname=api.contoso.com',
      'aspire do deploy -- --not-a-cli-option',
    ].join('\n');
    const powershell = [
      'aspire deploy `',
      '  --apphost AppHost/AppHost.csproj `',
      '  --Parameters:hostname=api.contoso.com `',
      '  --not-a-real-option',
    ].join('\n');

    expect(undocumentedOptionsIn(bash, documented)).toEqual([
      { line: 1, command: 'publish', option: '--project' },
      { line: 1, command: 'publish', option: '--output_path' },
      { line: 4, command: 'deploy', option: '--Environment' },
    ]);
    expect(undocumentedOptionsIn(powershell, documented)).toEqual([
      { line: 1, command: 'deploy', option: '--not-a-real-option' },
    ]);
  });

  test('only pass options documented in the command reference', () => {
    const files = docFiles(docsRoot).filter((path) => {
      const parts = relative(docsRoot, path).split(sep);
      return !localeDirs.has(parts[0]) && !parts.includes('whats-new');
    });
    const undocumented = files.flatMap((path) =>
      undocumentedOptionsIn(readFileSync(path, 'utf8'), documented).map(
        ({ line, command, option }) =>
          `${relative(frontendRoot, path)}:${line} aspire ${command} ${option}`
      )
    );

    expect(documented.get('deploy')).toContain('--apphost');
    expect(documented.get('deploy')).toContain('--environment');
    expect(files.length).toBeGreaterThan(0);
    expect(undocumented).toEqual([]);
  });
});
