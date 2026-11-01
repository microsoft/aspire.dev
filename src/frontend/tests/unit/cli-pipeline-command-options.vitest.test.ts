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

describe('aspire pipeline command samples', () => {
  test('only pass options documented in the command reference', () => {
    const documented = new Map(
      pipelineCommands.map((command) => [command, documentedOptions(command)])
    );
    const files = docFiles(docsRoot).filter((path) => {
      const parts = relative(docsRoot, path).split(sep);
      return !localeDirs.has(parts[0]) && !parts.includes('whats-new');
    });
    const undocumented: string[] = [];
    const invocation = new RegExp(`\\baspire (${pipelineCommands.join('|')})\\b([^\`\\n|]*)`, 'g');

    for (const path of files) {
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          for (const [, command, rest] of line.matchAll(invocation)) {
            // Arguments after `--` go to the AppHost, and PascalCase keys such as
            // --Parameters:name=value are forwarded as AppHost configuration.
            const args = rest.split(/\s--(?:\s|$)/)[0];
            for (const [, option] of args.matchAll(/(?<![\w-])(--?[a-z][a-z0-9-]*)(?![\w:])/g)) {
              if (!documented.get(command)!.has(option)) {
                undocumented.push(
                  `${relative(frontendRoot, path)}:${index + 1} aspire ${command} ${option}`
                );
              }
            }
          }
        });
    }

    expect(documented.get('deploy')).toContain('--apphost');
    expect(files.length).toBeGreaterThan(0);
    expect(undocumented).toEqual([]);
  });
});
