import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(testsDir, '..', '..', 'src', 'content', 'docs');
const iconsCatalogUrl =
  'https://microsoft.github.io/fluentui-system-icons/?path=/docs/icons-catalog--docs';

// The Fluent UI React storybook removed its local Icons stories
// (microsoft/fluentui#35991); they now live in the fluentui-system-icons docsite.
const removedIconStoryLink = /storybooks\.fluentui\.dev\/react\/\?path=\/(?:docs|story)\/icons-/;

function docFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return docFiles(fullPath);
    return /\.mdx?$/.test(entry.name) ? [fullPath] : [];
  });
}

describe('Fluent UI icon catalog links', () => {
  test('docs do not link to removed Fluent UI React storybook icon stories', () => {
    const offenders = docFiles(docsRoot)
      .filter((file) => removedIconStoryLink.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(docsRoot, file));

    expect(offenders).toEqual([]);
  });

  test.each(['fundamentals/http-commands.mdx', 'ja/fundamentals/http-commands.mdx'])(
    '%s links to the Fluent System Icons catalog',
    (file) => {
      const source = readFileSync(path.join(docsRoot, file), 'utf8');
      expect(source).toContain(`](${iconsCatalogUrl})`);
    }
  );
});
