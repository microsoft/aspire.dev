import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { appHostLanguageConfig } from '../../src/utils/apphost-languages';

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const docsDirectory = path.resolve(testsDirectory, '..', '..', 'src', 'content', 'docs');
const integrationDirectory = path.join(docsDirectory, 'integrations');
const scopedCategories = [
  'frameworks',
  'compute',
  'dotnet',
  'devtools',
  'custom-integrations',
];
const appHostBuilderPattern =
  /\b(?:DistributedApplication\.CreateBuilder|createBuilder|create_builder|aspire\.CreateBuilder)\s*\(/;

function getMdxFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return getMdxFiles(resolved);
    }

    return entry.isFile() && entry.name.endsWith('.mdx') ? [resolved] : [];
  });
}

function getScopedMdxFiles(): string[] {
  return scopedCategories.flatMap((category) =>
    getMdxFiles(path.join(integrationDirectory, category))
  );
}

describe('integration AppHost language parity', () => {
  test('accounts for all six AppHost languages in the assigned categories', () => {
    const violations: string[] = [];

    for (const file of getScopedMdxFiles()) {
      const source = fs.readFileSync(file, 'utf8');
      const appHostTabs = source.matchAll(
        /<AppHostTabs\b(?<attributes>[\s\S]*?)>(?<content>[\s\S]*?)<\/AppHostTabs>/g
      );

      for (const match of appHostTabs) {
        const attributes = match.groups?.attributes ?? '';
        const content = match.groups?.content ?? '';
        const line = source.slice(0, match.index).split('\n').length;

        for (const language of appHostLanguageConfig.languages) {
          const hasSlot = new RegExp(
            String.raw`\bslot\s*=\s*(['"])${language.id}\1`
          ).test(content);
          const hasLimitation = new RegExp(
            String.raw`\b${language.id}\s*:`
          ).test(attributes);

          if (!hasSlot && !hasLimitation) {
            violations.push(
              `${path.relative(docsDirectory, file)}:${line} is missing ${language.id}`
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('wraps standalone AppHost builder examples for language accounting', () => {
    const violations: string[] = [];

    for (const file of getScopedMdxFiles()) {
      const source = fs.readFileSync(file, 'utf8');
      const appHostTabRanges = Array.from(
        source.matchAll(/<AppHostTabs\b[\s\S]*?<\/AppHostTabs>/g),
        (match) => ({
          start: match.index,
          end: match.index + match[0].length,
        })
      );

      for (const codeFence of source.matchAll(
        /```(?<language>csharp|typescript|python|go|java|rust)\b[^\n]*\n(?<code>[\s\S]*?)```/g
      )) {
        if (!appHostBuilderPattern.test(codeFence.groups?.code ?? '')) {
          continue;
        }

        const isAccountedFor = appHostTabRanges.some(
          (range) => codeFence.index >= range.start && codeFence.index < range.end
        );

        if (!isAccountedFor) {
          const line = source.slice(0, codeFence.index).split('\n').length;
          violations.push(
            `${path.relative(docsDirectory, file)}:${line} has a standalone ${codeFence.groups?.language} AppHost builder fence`
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
