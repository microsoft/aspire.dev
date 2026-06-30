import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaceAspireVersionPlaceholders } from './remark-aspire-version-placeholders.mjs';

// Per-page Markdown copies emitted by `starlight-page-actions` are the only
// generated artifacts that still contain raw `%ASPIRE_VERSION%` placeholders:
// that plugin `viteStaticCopy`s `src/content/docs/**/*.{md,mdx}` straight to
// `dist/**/*.md` through a regex-only transform, so it never runs through the
// `remarkAspireVersionPlaceholders` remark plugin.
//
// Everything else is already handled before it reaches `dist`:
//   - `.html` pages   -> rendered via the remark pipeline (placeholders replaced
//                        in the mdast before expressive-code renders code blocks)
//   - `llms*.txt`     -> `starlight-llms-txt` sources rendered HTML (`render(entry)`)
//   - `reference/**.md` -> generated from API/sample data, not docs content
//
// So this post-build pass only needs to touch `.md` files. Scoping it this way
// (instead of walking every `.html`/`.txt` in `dist`) avoids re-reading the bulk
// of the output — including the large `llms-full.txt` assets — which is what
// previously exhausted the Node heap.
const placeholderCopyExtensions = new Set(['.md']);

// Process the Markdown copies through a small worker pool rather than a single
// recursive `Promise.all` over the whole tree, so peak memory stays proportional
// to the concurrency limit instead of the number of files held open at once.
const DEFAULT_CONCURRENCY = 16;

export function aspireVersionPlaceholdersIntegration() {
  return {
    name: 'aspire-version-placeholders',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        await replaceAspireVersionPlaceholdersInDirectory(fileURLToPath(dir));
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

  const workerCount = Math.min(Math.max(1, concurrency), files.length);
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < files.length) {
      const filePath = files[cursor++];
      await replaceAspireVersionPlaceholdersInFile(filePath);
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

    if (entry.isFile() && placeholderCopyExtensions.has(path.extname(entry.name))) {
      files.push(resolvedPath);
    }
  }
}

async function replaceAspireVersionPlaceholdersInFile(filePath) {
  const content = await readFile(filePath, 'utf8');
  const updated = replaceAspireVersionPlaceholders(content);

  if (updated !== content) {
    await writeFile(filePath, updated);
  }
}
