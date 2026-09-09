import { readdirSync, readFileSync } from 'node:fs';
import { createProcessor } from '@mdx-js/mdx';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { getAppHostLanguages, getEnabledAppHostLanguages } from '../../src/utils/apphost-languages';
import { renderAppHostTabsInMarkdown } from '../../config/apphost-language-markdown.mjs';

const diagnosticsRoot = new URL('../../src/content/docs/diagnostics/', import.meta.url);
const parser = createProcessor();
const languages = getAppHostLanguages();
const enabledLanguages = getEnabledAppHostLanguages();
const pages = readdirSync(diagnosticsRoot)
  .filter((name) => name.endsWith('.mdx'))
  .map((name) => ({
    name,
    source: readFileSync(new URL(name, diagnosticsRoot), 'utf8'),
  }));
const modulesRoot = new URL('../../src/data/apphost-modules/', import.meta.url);
const apiPackages = new Map<string, Set<string>>();
for (const file of readdirSync(modulesRoot).filter((file) => file.endsWith('.json'))) {
  const module: {
    package: { name: string };
    items: Array<{
      kind: string;
      projections?: {
        typescript?: {
          status?: string;
          identifier?: string;
        };
      };
    }>;
  } = JSON.parse(readFileSync(new URL(file, modulesRoot), 'utf8'));
  for (const item of module.items) {
    const projection = item.projections?.typescript;
    if (
      item.kind !== 'capability' ||
      projection?.status !== 'supported' ||
      !projection.identifier
    ) {
      continue;
    }
    const packages = apiPackages.get(projection.identifier) ?? new Set<string>();
    packages.add(module.package.name);
    apiPackages.set(projection.identifier, packages);
  }
}

describe('diagnostics AppHost language examples', () => {
  test.each(pages)(
    '$name uses canonical, TypeScript-first language tabs and twoslash',
    ({ source }) => {
      expect(() => parser.parse(source.replace(/^---\r?\n[\s\S]*?\r?\n---/, ''))).not.toThrow();
      expect(source).not.toMatch(/<Tabs\b[^>]*syncKey=['"]aspire-lang['"]/);
      const documentedPackages = new Set(
        [
          'Aspire.Hosting',
          ...source.matchAll(
            /\b(?:CommunityToolkit\.)?Aspire\.Hosting(?:\.[A-Za-z][A-Za-z0-9]*)+/g
          ),
        ].map((match) => (typeof match === 'string' ? match : match[0]))
      );
      const languageGroups = [
        ...source.matchAll(
          /<AppHostTabs\b(?:[^>"'`]|"[^"]*"|'[^']*'|`[^`]*`)*>([\s\S]*?)<\/AppHostTabs>/g
        ),
      ];

      if (languageGroups.length > 0) {
        expect(source).toContain('/diagnostics/overview/#experimental-apphost-examples');
      }

      for (const [wrapper, group] of languageGroups) {
        expect(source).toContain("import AppHostTabs from '@components/AppHostTabs.astro';");
        const slots = [
          ...group.matchAll(/<Fragment\s+slot=['"]([^'"]+)['"]>([\s\S]*?)<\/Fragment>/g),
        ];
        const ids = slots.map(([, id]) => id);
        expect(ids).toEqual(languages.filter(({ id }) => ids.includes(id)).map(({ id }) => id));
        expect(new Set(ids).size).toBe(ids.length);
        const allLanguageMarkdown = renderAppHostTabsInMarkdown(
          wrapper,
          languages.map((language) => ({ ...language, enabled: true }))
        );
        for (const language of languages) {
          expect(
            allLanguageMarkdown,
            `Provide a ${language.id} example or a specific SDK limitation before activation.`
          ).toContain(`### ${language.label}`);
        }
        const markdown = renderAppHostTabsInMarkdown(wrapper, languages);
        for (const language of enabledLanguages) {
          // A missing slot must have an explicit, readable limitation, just as in the renderer.
          expect(markdown).toContain(`### ${language.label}`);
        }
        for (const language of languages.filter(({ enabled }) => !enabled)) {
          expect(markdown).not.toContain(`### ${language.label}`);
        }
        for (const [, id, content] of slots) {
          const language = languages.find((language) => language.id === id)!;
          expect(content).toContain(`\`\`\`${language.codeFence}`);
          if (language.experimental) {
            expect(content).toContain(`title="${language.appHostFile}"`);
            expect(content).not.toMatch(/```[^\n]*\btwoslash\b/);
            expect(content).not.toMatch(/\bTODO\b|not yet (?:implemented|validated)/i);
          }
        }
      }

      for (const block of source.matchAll(/```([\w+-]+)\b[^\n]*\n([\s\S]*?)```/g)) {
        const title = block[0]
          .slice(0, block[0].indexOf('\n'))
          .match(/\btitle\s*=\s*["']([^"']+)["']/)?.[1];
        const appHostFileTitle = /\bapphost\.(?:cs|mts|py|go|java|rs)\b/i.test(title ?? '');
        if (
          !appHostFileTitle &&
          !/\b(?:createBuilder|CreateBuilder|create_builder)\s*\(|\bbuilder\s*\.\s*(?:[Aa]dd|[Bb]uild|[Ww]ith)/.test(
            block[2]
          )
        ) {
          continue;
        }
        if (
          block[1] === 'csharp' &&
          block[2]
            .trim()
            .split(/\r?\n/)
            .every((line) => !line.trim() || line.trim().startsWith('#:package '))
        ) {
          continue;
        }
        if (
          languageGroups.some(
            (group) =>
              block.index >= group.index &&
              block.index + block[0].length <= group.index + group[0].length
          )
        ) {
          continue;
        }

        expect(block[1], 'AppHost builder examples belong in AppHostTabs.').toBe('csharp');
        if (
          /\bthis\s+(?:IResourceBuilder<|IDistributedApplicationBuilder\b)/.test(block[2]) &&
          !/\bCreateBuilder\s*\(/.test(block[2])
        ) {
          expect(source).toContain('C#-only integration-authoring examples');
          continue;
        }
        const precedingProse = source
          .slice(0, block.index)
          .replace(/```[\s\S]*?```/g, '')
          .slice(-1800);
        if (
          /#pragma warning disable\b|#:property\s+NoWarn\b|\bSuppressMessage\s*\(/.test(block[2])
        ) {
          expect(precedingProse).toMatch(/suppress(?:ion|ing| the| in)/i);
          continue;
        }
        expect(
          precedingProse,
          'A standalone C# AppHost example needs a nearby, specific C#-only explanation.'
        ).toMatch(/C#-only|requires? (?:a )?C#|apply only to C#/);
      }

      for (const block of source.matchAll(/```(?:typescript|ts|tsx)\b([^\n]*)\n([\s\S]*?)```/g)) {
        expect(block[1]).toMatch(/\btwoslash\b/);
        expect(block[1]).toMatch(/title=['"]apphost\.mts['"]/);
        expect(block[2]).not.toMatch(/@ts-(?:ignore|expect-error)|\/\/\s*@errors:|\bas any\b/);
        expect(
          languageGroups.some(([, group]) =>
            [...group.matchAll(/<Fragment\s+slot=['"]typescript['"]>([\s\S]*?)<\/Fragment>/g)].some(
              ([, content]) => content.includes(block[0])
            )
          )
        ).toBe(true);
        const syntax = ts.createSourceFile('apphost.mts', block[2], ts.ScriptTarget.Latest, true);
        function checkAwaitedCalls(node: ts.Node): void {
          if (ts.isCallExpression(node)) {
            const expression = node.expression;
            const name = ts.isIdentifier(expression)
              ? expression.text
              : ts.isPropertyAccessExpression(expression)
                ? expression.name.text
                : '';
            if (name === 'createBuilder' || name === 'run' || apiPackages.has(name)) {
              let call = node;
              // SDK thenable wrappers also support awaiting the complete fluent chain.
              while (
                ts.isPropertyAccessExpression(call.parent) &&
                ts.isCallExpression(call.parent.parent) &&
                call.parent.parent.expression === call.parent
              ) {
                call = call.parent.parent;
              }
              expect(
                ts.isAwaitExpression(call.parent),
                `Await SDK call: ${node.getText(syntax)}`
              ).toBe(true);
            }
          }
          ts.forEachChild(node, checkAwaitedCalls);
        }
        checkAwaitedCalls(syntax);
        for (const [, method] of block[2].matchAll(/\.(\w+)\s*\(/g)) {
          const packages = apiPackages.get(method);
          if (packages) {
            expect(
              [...packages].some((name) => documentedPackages.has(name)),
              `Document the package for ${method}: ${[...packages].join(', ')}`
            ).toBe(true);
          }
        }
      }
    }
  );

  test('shared APIs retain language examples even on compiler diagnostic pages', () => {
    for (const name of [
      'aspire006.mdx',
      'aspireacadomains001.mdx',
      'aspireacanaming001.mdx',
      'aspireacanaming002.mdx',
      'aspireazure002.mdx',
      'aspireazure003.mdx',
      'aspireblazor001.mdx',
      'aspirebrowserlogs001.mdx',
      'aspirecertificates001.mdx',
      'aspirecommand001.mdx',
      'aspirecompute001.mdx',
      'aspirecompute002.mdx',
      'aspirecompute003.mdx',
      'aspirecosmosdb001.mdx',
      'aspirecsharpapps001.mdx',
      'aspiredockerfilebuilder001.mdx',
      'aspiredotnetproject001.mdx',
      'aspiredotnettool001.mdx',
      'aspiredurabletask001.mdx',
      'aspirehostingpython001.mdx',
      'aspireinteraction001.mdx',
      'aspirejavascript001.mdx',
      'aspiremcp001.mdx',
      'aspirepersistence001.mdx',
      'aspirepipelines001.mdx',
      'aspirepipelines003.mdx',
      'aspirepostgres001.mdx',
      'aspireprobes001.mdx',
      'aspireprocesscommand001.mdx',
      'aspireprojects001.mdx',
      'aspireproxyendpoints001.mdx',
      'aspireradius003.mdx',
      'aspireradius004.mdx',
      'aspireradius006.mdx',
      'aspireradius057.mdx',
      'aspireterminal001.mdx',
      'aspireusersecrets001.mdx',
      'aspirewatch001.mdx',
    ]) {
      const source = readFileSync(new URL(name, diagnosticsRoot), 'utf8');
      expect(source, name).toContain('<AppHostTabs');
    }
  });

  test('overview distinguishes file-based C# suppression from TypeScript AppHosts', () => {
    const overview = readFileSync(new URL('overview.mdx', diagnosticsRoot), 'utf8');
    expect(overview).toContain('### Suppress in a file-based AppHost');
    expect(overview).toContain('#:property NoWarn=$(NoWarn);ASPIREE000');
    expect(overview).toContain('#pragma warning restore ASPIREE000');
    expect(overview).toContain('not to `apphost.mts`');
    expect(overview).toContain('## Experimental AppHost examples');
    expect(overview).toContain('features:experimentalPolyglot:python');
    expect(overview).toContain('daily generated SDK');
  });
});
