import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { appHostLanguageConfig } from '../../src/utils/apphost-languages';

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const docsDirectory = path.resolve(testsDirectory, '..', '..', 'src', 'content', 'docs');
const integrationsDirectory = path.join(docsDirectory, 'integrations');
const scopedPaths = [
  'caching',
  'compute',
  'custom-integrations',
  'databases',
  'devtools',
  'dotnet',
  'frameworks',
  'messaging',
  'observability',
  'reverse-proxies',
  'security',
];

function getScopedDocs(): string[] {
  const files = [path.join(integrationsDirectory, 'overview.mdx')];

  function visit(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const resolved = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(resolved);
      } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
        files.push(resolved);
      }
    }
  }

  for (const scopedPath of scopedPaths) {
    visit(path.join(integrationsDirectory, scopedPath));
  }

  return files;
}

function getAppHostTabs(source: string): RegExpMatchArray[] {
  return Array.from(
    source.matchAll(/<AppHostTabs(?<attributes>[^>]*)>(?<content>[\s\S]*?)<\/AppHostTabs>/g)
  );
}

describe('integration AppHost language parity', () => {
  test('accounts for every AppHost language in the scoped integration docs', () => {
    const violations: string[] = [];

    for (const file of getScopedDocs()) {
      const source = fs.readFileSync(file, 'utf8');
      const appHostTabs = getAppHostTabs(source);

      for (const [index, match] of appHostTabs.entries()) {
        const attributes = match.groups?.attributes ?? '';
        const content = match.groups?.content ?? '';

        for (const language of appHostLanguageConfig.languages) {
          const hasSlot = new RegExp(`<Fragment\\s+slot=(['"])${language.id}\\1`).test(content);
          const hasLimitation = new RegExp(`\\b${language.id}\\s*:`).test(attributes);

          if (!hasSlot && !hasLimitation) {
            violations.push(
              `${path.relative(docsDirectory, file)} AppHostTabs ${index + 1} omits ${language.id}`
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('uses safe generated SDK patterns in Go and Rust examples', () => {
    const violations: string[] = [];

    for (const file of getScopedDocs()) {
      const source = fs.readFileSync(file, 'utf8');

      for (const [tabIndex, tab] of getAppHostTabs(source).entries()) {
        const content = tab.groups?.content ?? '';
        const goFences = content.matchAll(/```go\b[^\n]*\n(?<code>[\s\S]*?)```/g);

        for (const fence of goFences) {
          const code = fence.groups?.code ?? '';
          for (const resourceCall of code.matchAll(/builder(?:\s*\.\s*)?Add[A-Z]\w*\s*\(/g)) {
            if (resourceCall.index === undefined) {
              continue;
            }

            const lineStart = code.lastIndexOf('\n', resourceCall.index) + 1;
            const linePrefix = code.slice(lineStart, resourceCall.index);
            if (!linePrefix.includes(':=')) {
              violations.push(
                `${path.relative(docsDirectory, file)} AppHostTabs ${tabIndex + 1} does not assign a Go resource for an immediate Err() check`
              );
            }
          }

          const assignments = Array.from(
            code.matchAll(/^\s*(?<resource>\w+)\s*:=\s*builder(?:\s*\.\s*)?Add[A-Z]\w*\s*\(/gm)
          );

          for (const assignment of assignments) {
            const resource = assignment.groups?.resource;
            if (!resource || assignment.index === undefined) {
              continue;
            }

            const remainder = code.slice(assignment.index + assignment[0].length);
            const nextOperation = remainder.search(
              /^\s*(?:\w+(?:\s*,\s*\w+)?\s*:=|app\s*,\s*err\s*:=\s*builder\.Build\(\))/m
            );
            const immediateBlock =
              nextOperation === -1 ? remainder : remainder.slice(0, nextOperation);
            const escapedResource = resource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            if (
              !new RegExp(
                `if\\s+err\\s*:=\\s*${escapedResource}\\.Err\\(\\);\\s*err\\s*!=\\s*nil`
              ).test(immediateBlock)
            ) {
              violations.push(
                `${path.relative(docsDirectory, file)} AppHostTabs ${tabIndex + 1} does not immediately check ${resource}.Err()`
              );
            }
          }
        }

        const rustFences = content.matchAll(/```rust\b[^\n]*\n(?<code>[\s\S]*?)```/g);
        for (const fence of rustFences) {
          const code = fence.groups?.code ?? '';
          let referenceIndex = code.indexOf('.with_reference(');

          while (referenceIndex !== -1) {
            const referenceEnd = code.indexOf('?;', referenceIndex);
            const referenceCall = code.slice(
              referenceIndex,
              referenceEnd === -1 ? undefined : referenceEnd
            );

            if (!referenceCall.includes('.handle().to_json()')) {
              violations.push(
                `${path.relative(docsDirectory, file)} AppHostTabs ${tabIndex + 1} passes a Rust reference without handle().to_json()`
              );
            }

            referenceIndex = code.indexOf('.with_reference(', referenceIndex + 1);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('does not leave AppHost source fences outside AppHostTabs', () => {
    const violations: string[] = [];

    for (const file of getScopedDocs()) {
      const source = fs.readFileSync(file, 'utf8');
      const withoutAppHostWrappers = source
        .replace(/<AppHostTabs[^>]*>[\s\S]*?<\/AppHostTabs>/g, '')
        .replace(/<AppHostLanguagePivot[^>]*>[\s\S]*?<\/AppHostLanguagePivot>/g, '');
      const sourceFences = withoutAppHostWrappers.matchAll(
        /```(?<language>csharp|typescript|python|go|java|rust|xml)\b(?<metadata>[^\n]*)\n(?<code>[\s\S]*?)```/g
      );

      for (const match of sourceFences) {
        const language = match.groups?.language ?? '';
        const metadata = match.groups?.metadata ?? '';
        const code = match.groups?.code ?? '';
        const titleMatch = metadata.match(/\btitle=(?:"(?<double>[^"]+)"|'(?<single>[^']+)'|(?<bare>\S+))/);
        const title =
          titleMatch?.groups?.double ??
          titleMatch?.groups?.single ??
          titleMatch?.groups?.bare ??
          '';
        const nonemptyLines = code
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        const isPackageDirectiveOnly =
          nonemptyLines.length > 0 && nonemptyLines.every((line) => line.startsWith('#:package '));
        const isProjectFile = language === 'xml' || /\.(?:csproj|fsproj|vbproj)$/i.test(title);
        const isAppHostFence =
          /(?:^|[\\/])apphost\.(?:cs|mts|ts|py|go|java|rs)$/i.test(title) ||
          /DistributedApplication\.CreateBuilder|createBuilder\(\)|create_builder\(|CreateBuilder\(\)/.test(
            code
          );

        if (isAppHostFence && !isPackageDirectiveOnly && !isProjectFile) {
          const line = source.slice(0, match.index).split('\n').length;
          violations.push(
            `${path.relative(docsDirectory, file)}:${line} has a standalone AppHost source fence`
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
