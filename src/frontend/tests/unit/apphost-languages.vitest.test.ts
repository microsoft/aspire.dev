import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  appHostLanguageConfig,
  getAppHostLanguageProjectHref,
  getEnabledAppHostLanguages,
  normalizeAppHostLanguage,
} from '../../src/utils/apphost-languages';
import { renderAppHostTabsInMarkdown } from '../../config/apphost-language-markdown.mjs';

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const componentsDirectory = path.resolve(testsDirectory, '..', '..', 'src', 'components');
const docsDirectory = path.resolve(testsDirectory, '..', '..', 'src', 'content', 'docs');
const integrationParityDirectories = [
  path.join(docsDirectory, 'integrations', 'ai'),
  path.join(docsDirectory, 'integrations', 'cloud'),
];
const excludedTopLevel = new Set([
  'da',
  'de',
  'diagnostics',
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

function getMdxFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...getMdxFiles(resolved));
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      files.push(resolved);
    }
  }

  return files;
}

describe('AppHost language registry', () => {
  test('keeps the canonical order and enables only the established languages initially', () => {
    expect(appHostLanguageConfig.languages.map((language) => language.id)).toEqual([
      'typescript',
      'csharp',
      'python',
      'go',
      'java',
      'rust',
    ]);
    expect(getEnabledAppHostLanguages().map((language) => language.id)).toEqual([
      'typescript',
      'csharp',
    ]);
  });

  test('normalizes exact aliases without substring collisions', () => {
    expect(normalizeAppHostLanguage('TypeScript')).toBe('typescript');
    expect(normalizeAppHostLanguage('typescript/nodejs')).toBe('typescript');
    expect(normalizeAppHostLanguage('C#')).toBe('csharp');
    expect(normalizeAppHostLanguage('javascript')).toBeUndefined();
    expect(normalizeAppHostLanguage('mongo')).toBeUndefined();
    expect(normalizeAppHostLanguage('python')).toBeUndefined();
    expect(normalizeAppHostLanguage('python', false)).toBe('python');
  });

  test('publishes project links only for enabled AppHost languages', () => {
    expect(getAppHostLanguageProjectHref('typescript')).toBe('/app-host/typescript-apphost/');
    expect(getAppHostLanguageProjectHref('python')).toBeUndefined();

    const enabledPythonConfig = {
      ...appHostLanguageConfig,
      languages: appHostLanguageConfig.languages.map((language) => ({
        ...language,
        enabled: language.id === 'python' || language.enabled,
      })),
    };

    expect(getAppHostLanguageProjectHref('python', enabledPythonConfig)).toBe(
      '/app-host/python-apphost/'
    );
  });

  test('preserves the legacy AppHost dependency anchor', () => {
    const source = fs.readFileSync(path.join(docsDirectory, 'get-started', 'app-host.mdx'), 'utf8');

    expect(source).toMatch(
      /<a id="adding-an-api-resource-and-declaring-a-dependency"><\/a>\r?\n\r?\n## Define resources and relationships/
    );
  });

  test('active English docs use only registry-backed AppHost language components', () => {
    const violations: string[] = [];

    for (const file of getActiveEnglishDocs()) {
      const source = fs.readFileSync(file, 'utf8');
      if (/<Tabs\b[^>]*\bsyncKey\s*=\s*(['"])aspire-lang\1/i.test(source)) {
        violations.push(`${path.relative(docsDirectory, file)} uses bare aspire-lang Tabs`);
      }
      if (/<PivotSelector[\s\S]*?\bkey\s*=\s*(['"])aspire-lang\1/i.test(source)) {
        violations.push(`${path.relative(docsDirectory, file)} hard-codes an aspire-lang pivot`);
      }
    }

    expect(violations).toEqual([]);
  });

  test('interactive AppHost surfaces author every registry language with completeness guards', () => {
    const builderSource = fs.readFileSync(
      path.join(componentsDirectory, 'AppHostBuilder.astro'),
      'utf8'
    );
    const builderClientSource = fs.readFileSync(
      path.join(componentsDirectory, 'AppHostBuilder.client.ts'),
      'utf8'
    );
    const homeSource = fs.readFileSync(
      path.join(componentsDirectory, 'home', 'HomePage.astro'),
      'utf8'
    );

    for (const language of appHostLanguageConfig.languages) {
      expect(builderSource).toMatch(new RegExp(`\\b${language.id}:\\s+render[A-Z]`));
      expect(homeSource).toMatch(new RegExp(`\\n\\s*${language.id}:\\s*\\{`));
    }

    expect(builderSource).toContain('AppHostBuilder requires code or a limitation for');
    expect(homeSource).toContain('Home AppHost model story requires code or a limitation for');
    expect(builderSource).toContain('language-experimental');
    expect(homeSource).toContain('handle().to_json()');
    expect(homeSource).not.toContain('[]aspire.Resource');
    expect(builderClientSource).toContain("template?.dataset.variantKind === 'limitation'");
    expect(builderClientSource).not.toContain("type AppHostLanguage = 'csharp' | 'typescript'");
    expect(homeSource).not.toContain("type AppHostLanguage = 'csharp' | 'typescript'");
  });

  test('cloud and AI AppHost tabs account for all six languages', () => {
    const violations: string[] = [];
    const appHostTabsPattern =
      /<AppHostTabs\b(?<attributes>[\s\S]*?)>(?<content>[\s\S]*?)<\/AppHostTabs>/g;

    for (const directory of integrationParityDirectories) {
      for (const file of getMdxFiles(directory)) {
        const source = fs.readFileSync(file, 'utf8');
        let tabIndex = 0;

        for (const match of source.matchAll(appHostTabsPattern)) {
          tabIndex += 1;
          const attributes = match.groups?.attributes ?? '';
          const content = match.groups?.content ?? '';

          for (const language of appHostLanguageConfig.languages) {
            const slotPattern = new RegExp(
              `<Fragment\\b[^>]*\\bslot\\s*=\\s*(['"])${language.id}\\1`,
              'i'
            );
            const limitationPattern = new RegExp(`\\b${language.id}\\s*:`, 'i');

            if (!slotPattern.test(content) && !limitationPattern.test(attributes)) {
              violations.push(
                `${path.relative(docsDirectory, file)} AppHostTabs #${tabIndex} does not account for ${language.id}`
              );
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('cloud and AI AppHost builder examples use AppHost tabs', () => {
    const violations: string[] = [];
    const appHostTabsPattern = /<AppHostTabs\b[\s\S]*?<\/AppHostTabs>/g;
    const codeFencePattern = /```(?<language>\w+)[^\n]*\n(?<code>[\s\S]*?)```/g;
    const appHostBuilderPatterns = [
      /DistributedApplication\.CreateBuilder\s*\(/,
      /\bcreateBuilder\s*\(/,
      /\bcreate_builder\s*\(/,
      /\baspire\.CreateBuilder\s*\(/,
    ];

    for (const directory of integrationParityDirectories) {
      for (const file of getMdxFiles(directory)) {
        const source = fs.readFileSync(file, 'utf8');
        const tabRanges = [...source.matchAll(appHostTabsPattern)].map((match) => ({
          start: match.index ?? 0,
          end: (match.index ?? 0) + match[0].length,
        }));

        for (const match of source.matchAll(codeFencePattern)) {
          const code = match.groups?.code ?? '';
          if (!appHostBuilderPatterns.some((pattern) => pattern.test(code))) {
            continue;
          }

          const index = match.index ?? 0;
          const inAppHostTabs = tabRanges.some(
            (range) => index >= range.start && index < range.end
          );
          if (!inAppHostTabs) {
            const line = source.slice(0, index).split('\n').length;
            violations.push(
              `${path.relative(docsDirectory, file)}:${line} has a standalone AppHost builder example`
            );
          }
        }
      }
    }
    expect(violations).toEqual([]);
    expect(violations).toEqual([]);
  });
});

describe('AppHost page-action Markdown', () => {
  test('renders only enabled language slots as readable Markdown sections', () => {
    const markdown = `<AppHostTabs>
<Fragment slot="typescript">
\`\`\`typescript
await builder.build().run();
\`\`\`
</Fragment>
<Fragment slot="csharp">
\`\`\`csharp
builder.Build().Run();
\`\`\`
</Fragment>
<Fragment slot="python">
\`\`\`python
builder.run()
\`\`\`
</Fragment>
</AppHostTabs>
`;

    const rendered = renderAppHostTabsInMarkdown(markdown, appHostLanguageConfig.languages);

    expect(rendered).toContain('### TypeScript');
    expect(rendered).toContain('### C#');
    expect(rendered).not.toContain('### Python');
    expect(rendered).not.toContain('<AppHostTabs>');
    expect(rendered).not.toContain('<Fragment');
  });

  test('renders an enabled language limitation instead of another language', () => {
    const languages = appHostLanguageConfig.languages.map((language) => ({
      ...language,
      enabled: ['typescript', 'csharp', 'python'].includes(language.id),
    }));
    const markdown = `<AppHostTabs limitations={{ python: 'This API is not generated yet.' }}>
<Fragment slot="typescript">TypeScript content</Fragment>
<Fragment slot="csharp">C# content</Fragment>
</AppHostTabs>
`;

    const rendered = renderAppHostTabsInMarkdown(markdown, languages);

    expect(rendered).toContain('### Python (Experimental)');
    expect(rendered).toContain('> **Python AppHost limitation:** This API is not generated yet.');
  });

  test('preserves list indentation while rendering page-action Markdown', () => {
    const markdown = `1. Configure the AppHost

    <AppHostTabs>
    <Fragment slot="typescript">

    TypeScript content

    </Fragment>
    <Fragment slot="csharp">

    C# content

    </Fragment>
    </AppHostTabs>
`;

    const rendered = renderAppHostTabsInMarkdown(markdown, appHostLanguageConfig.languages);

    expect(rendered).toContain('    ### TypeScript');
    expect(rendered).toContain('    ### C#');
  });

  test('removes disabled AppHost pivots from page-action Markdown', () => {
    const markdown = `<AppHostLanguagePivot id="typescript">
TypeScript content
</AppHostLanguagePivot>
<AppHostLanguagePivot id="python">
Python preview content
</AppHostLanguagePivot>
`;

    const rendered = renderAppHostTabsInMarkdown(markdown, appHostLanguageConfig.languages);

    expect(rendered).toContain('TypeScript content');
    expect(rendered).not.toContain('Python preview content');
    expect(rendered).not.toContain('AppHostLanguagePivot');
  });
});
