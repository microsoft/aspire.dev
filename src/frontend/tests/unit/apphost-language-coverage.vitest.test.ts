import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProcessor } from '@mdx-js/mdx';
import { expect, test } from 'vitest';

import {
  appHostLanguageConfig,
  getEnabledAppHostLanguages,
} from '../../src/utils/apphost-languages';

interface MdxNode {
  type?: string;
  name?: string;
  value?: string;
  lang?: string;
  meta?: string;
  attributes?: MdxAttribute[];
  children?: MdxNode[];
  position?: {
    start?: {
      line?: number;
    };
  };
}

interface MdxAttribute {
  type?: string;
  name?: string;
  value?: string | {
    data?: {
      estree?: {
        body?: Array<{
          expression?: {
            type?: string;
            properties?: Array<{
              type?: string;
              key?: { type?: string; name?: string; value?: unknown };
            }>;
          };
        }>;
      };
    };
  };
}

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const docsDirectory = path.resolve(testDirectory, '..', '..', 'src', 'content', 'docs');
const parser = createProcessor();
const excludedTopLevel = new Set([
  'da',
  'de',
  'es',
  'fr',
  'hi',
  'id',
  'it',
  'ja',
  'ko',
  'pt-br',
  'ru',
  'tr',
  'uk',
  'whats-new',
  'zh-cn',
]);
const specializedParityTopLevel = new Set(['diagnostics', 'integrations']);
const standaloneAppHostExamplePages = new Set([
  'app-host/go-apphost.mdx',
  'app-host/java-apphost.mdx',
  'app-host/python-apphost.mdx',
  'app-host/rust-apphost.mdx',
  'app-host/typescript-apphost.mdx',
  'community/contributor-guide.mdx',
]);
const appHostBuilderPattern =
  /\b(?:DistributedApplication\.(?:CreateBuilder|createBuilder)|aspire\.CreateBuilder|createBuilder|create_builder)\s*\(/;
const appHostEntryPointPattern = /\bapphost\.(?:cs|go|java|mts|py|rs|ts)\b/i;

function getStringAttribute(node: MdxNode, name: string): string | undefined {
  const attribute = node.attributes?.find(
    (candidate) => candidate.type === 'mdxJsxAttribute' && candidate.name === name
  );
  return typeof attribute?.value === 'string' ? attribute.value : undefined;
}

function getLimitationIds(node: MdxNode): Set<string> {
  const attribute = node.attributes?.find(
    (candidate) =>
      candidate.type === 'mdxJsxAttribute' && candidate.name === 'limitations'
  );
  if (!attribute || typeof attribute.value === 'string') {
    return new Set();
  }

  const expression = attribute.value?.data?.estree?.body?.[0]?.expression;
  if (expression?.type !== 'ObjectExpression') {
    return new Set();
  }

  return new Set(
    (expression.properties ?? [])
      .filter((property) => property.type === 'Property')
      .map((property) =>
        property.key?.type === 'Identifier'
          ? property.key.name
          : property.key?.type === 'Literal'
            ? property.key.value
            : undefined
      )
      .filter((value): value is string => typeof value === 'string')
  );
}

function getActiveEnglishDocs(): string[] {
  const files: string[] = [];

  function visit(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (
        entry.isDirectory() &&
        directory === docsDirectory &&
        excludedTopLevel.has(entry.name.toLowerCase())
      ) {
        continue;
      }

      const resolved = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(resolved);
      } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
        files.push(resolved);
      }
    }
  }

  visit(docsDirectory);
  return files;
}

function inspectNode(
  node: MdxNode,
  requiredLanguages: readonly string[],
  relativePath: string,
  violations: string[],
  state: { selector: boolean; pivots: Set<string> },
  insideLanguageComponent = false
): void {
  const isLanguageComponent =
    node.type === 'mdxJsxFlowElement' &&
    (node.name === 'AppHostTabs' || node.name === 'AppHostLanguagePivot');
  const languageComponentAncestor = insideLanguageComponent || isLanguageComponent;

  if (node.type === 'mdxJsxFlowElement' && node.name === 'AppHostTabs') {
    const slots = new Set(
      (node.children ?? [])
        .filter(
          (child) =>
            child.type === 'mdxJsxFlowElement' &&
            child.name === 'Fragment'
        )
        .map((child) => getStringAttribute(child, 'slot'))
        .filter((value): value is string => Boolean(value))
    );
    const limitations = getLimitationIds(node);

    for (const language of requiredLanguages) {
      if (!slots.has(language) && !limitations.has(language)) {
        violations.push(
          `${relativePath}: AppHostTabs omits ${language} without a limitation`
        );
      }
    }
  }

  if (node.type === 'mdxJsxFlowElement' && node.name === 'AppHostLanguageSelector') {
    state.selector = true;
  }

  if (node.type === 'mdxJsxFlowElement' && node.name === 'AppHostLanguagePivot') {
    const id = getStringAttribute(node, 'id');
    if (id) {
      state.pivots.add(id);
    }
  }

  if (
    node.type === 'code' &&
    !languageComponentAncestor &&
    !standaloneAppHostExamplePages.has(relativePath) &&
    (appHostBuilderPattern.test(node.value ?? '') ||
      (appHostEntryPointPattern.test(node.meta ?? '') &&
        !/^\s*#:package\b/.test(node.value ?? '')))
  ) {
    violations.push(
      `${relativePath}:${node.position?.start?.line ?? '?'} has an AppHost builder example outside AppHostTabs or AppHostLanguagePivot`
    );
  }

  for (const child of node.children ?? []) {
    inspectNode(
      child,
      requiredLanguages,
      relativePath,
      violations,
      state,
      languageComponentAncestor
    );
  }
}

test('AppHost language examples account for every required language', () => {
  const requiredLanguages =
    process.env.APPHOST_LANGUAGE_AUDIT_ALL === '1'
      ? appHostLanguageConfig.languages.map((language) => language.id)
      : getEnabledAppHostLanguages().map((language) => language.id);
  const violations: string[] = [];

  for (const file of getActiveEnglishDocs()) {
    const relativePath = path.relative(docsDirectory, file).replaceAll('\\', '/');
    const source = fs.readFileSync(file, 'utf8');
    const staleQuery = source.match(
      /[?&](?:lang|language)=(?:typescript|csharp|python|go|java|rust)\b/i
    );
    if (staleQuery) {
      violations.push(
        `${relativePath} uses obsolete AppHost selector query "${staleQuery[0]}"`
      );
    }

    let tree: MdxNode;
    try {
      tree = parser.parse(source) as MdxNode;
    } catch (error) {
      violations.push(
        `${relativePath}: MDX parse failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      continue;
    }

    if (specializedParityTopLevel.has(relativePath.split('/')[0])) {
      continue;
    }

    const state = { selector: false, pivots: new Set<string>() };
    inspectNode(tree, requiredLanguages, relativePath, violations, state);

    if (state.selector) {
      for (const language of requiredLanguages) {
        if (!state.pivots.has(language)) {
          violations.push(
            `${relativePath}: AppHostLanguageSelector has no ${language} pivot`
          );
        }
      }
    }
  }

  expect(violations).toEqual([]);
});
