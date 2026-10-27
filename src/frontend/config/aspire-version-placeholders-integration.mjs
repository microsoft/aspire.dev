import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaceAspireVersionPlaceholders } from './remark-aspire-version-placeholders.mjs';
import { orderTypeScriptFirstAppHostTabsInMarkdown } from './remark-typescript-first-apphost-tabs.mjs';
import { renderHomepageMarkdown } from './homepage-markdown.mjs';
import { locales } from './locales.ts';
import { deferAppHostExamples } from './apphost-examples.mjs';

// Per-page Markdown copies emitted by `starlight-page-actions` bypass the
// remark transforms that replace Aspire version placeholders and order AppHost
// language tabs:
// that plugin `viteStaticCopy`s `src/content/docs/**/*.{md,mdx}` straight to
// `dist/**/*.md` through source cleanup, so it never runs through the
// configured remark pipeline.
//
// Everything else is already handled before it reaches `dist`:
//   - `.html` pages   -> rendered via the remark pipeline (placeholders replaced
//                        in the mdast before expressive-code renders code blocks)
//   - `llms*.txt`     -> `starlight-llms-txt` sources rendered HTML (`render(entry)`)
//   - `reference/**.md` -> generated from API/sample data, not docs content
//
// Version normalization only walks `.md` files. The homepage finalization
// below also reads the known homepage HTML files, not every `.html`/`.txt`
// asset in `dist`, which previously exhausted the Node heap.
const markdownCopyExtensions = new Set(['.md']);

// Process the Markdown copies through a small worker pool rather than a single
// recursive `Promise.all` over the whole tree, so peak memory stays proportional
// to the concurrency limit instead of the number of files held open at once.
const DEFAULT_CONCURRENCY = 16;

export function aspireVersionPlaceholdersIntegration() {
  return {
    name: 'aspire-version-placeholders',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const directory = fileURLToPath(dir);
        // Page-actions copies raw MDX, so component-only homepages need their
        // rendered content instead. Ordinary documentation keeps its existing path.
        for (const locale of Object.keys(locales)) {
          const localePath = locale === 'root' ? '' : locale;
          const html = await readFile(path.join(directory, localePath, 'index.html'), 'utf8');
          const markdown = await renderHomepageMarkdown(html);
          await writeFile(path.join(directory, `${localePath || 'index'}.md`), markdown, 'utf8');
          const deferred = deferAppHostExamples(html);
          await writeFile(
            path.join(directory, '_astro', deferred.filename),
            deferred.examples,
            'utf8'
          );
          await writeFile(path.join(directory, localePath, 'index.html'), deferred.html, 'utf8');
        }
        await replaceAspireVersionPlaceholdersInDirectory(directory);
      },
    },
  };
}

export async function replaceAspireVersionPlaceholdersInDirectory(
  directory,
  concurrency = DEFAULT_CONCURRENCY
) {
  const files = [];
  await collectMarkdownCopies(directory, files);

  if (files.length === 0) {
    return;
  }

  // Normalize to a finite positive integer so a stray NaN/0/negative value can't
  // collapse the worker pool to an empty array and silently skip every file.
  const limit = Number.isFinite(concurrency) ? Math.floor(concurrency) : DEFAULT_CONCURRENCY;
  const workerCount = Math.min(Math.max(1, limit), files.length);
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < files.length) {
      const filePath = files[cursor++];
      await processMarkdownCopy(filePath);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, runWorker));
}

async function collectMarkdownCopies(directory, files) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const resolvedPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await collectMarkdownCopies(resolvedPath, files);
      continue;
    }

    if (entry.isFile() && markdownCopyExtensions.has(path.extname(entry.name))) {
      files.push(resolvedPath);
    }
  }
}

async function processMarkdownCopy(filePath) {
  const content = await readFile(filePath, 'utf8');
  const ordered = orderTypeScriptFirstAppHostTabsInMarkdown(content);
  const updated = replaceAspireVersionPlaceholders(ordered);

  if (updated !== content) {
    await writeFile(filePath, updated);
  }
}
