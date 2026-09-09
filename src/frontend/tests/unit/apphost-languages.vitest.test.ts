import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  appHostLanguageConfig,
  getEnabledAppHostLanguages,
  normalizeAppHostLanguage,
} from '../../src/utils/apphost-languages';
import { renderAppHostTabsInMarkdown } from '../../config/apphost-language-markdown.mjs';

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const docsDirectory = path.resolve(testsDirectory, '..', '..', 'src', 'content', 'docs');
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

    const rendered = renderAppHostTabsInMarkdown(
      markdown,
      appHostLanguageConfig.languages
    );

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
    expect(rendered).toContain(
      '> **Python AppHost limitation:** This API is not generated yet.'
    );
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

    const rendered = renderAppHostTabsInMarkdown(
      markdown,
      appHostLanguageConfig.languages
    );

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

    const rendered = renderAppHostTabsInMarkdown(
      markdown,
      appHostLanguageConfig.languages
    );

    expect(rendered).toContain('TypeScript content');
    expect(rendered).not.toContain('Python preview content');
    expect(rendered).not.toContain('AppHostLanguagePivot');
  });
});
