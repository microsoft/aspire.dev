import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanStarlightMarkdown } from 'tidymd';
import { getDisabledAppHostProjectPageIds } from './apphost-language-docs-loader.mjs';
import { replaceAspireVersionPlaceholders } from './remark-aspire-version-placeholders.mjs';
import { orderTypeScriptFirstAppHostTabsInMarkdown } from './remark-typescript-first-apphost-tabs.mjs';
import { renderAppHostTabsInMarkdown } from './apphost-language-markdown.mjs';
import appHostLanguageConfig from '../src/data/apphost-languages.json' with { type: 'json' };

// Per-page Markdown copies emitted by `starlight-page-actions` bypass the remark
// pipeline. The plugin also cleans MDX before copying it, which flattens custom
// AppHost components before they can be rendered safely. Regenerate those copies
// from the original source in the required order: render AppHost language content,
// run the same page-actions cleanup, then apply copy-only ordering and placeholders.
// Copies without AppHost components keep the faster in-place post-build path.
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
const markdownCopyExtensions = new Set(['.md']);
const sourceMarkdownExtensions = new Set(['.md', '.mdx']);
const appHostLanguageSourcePattern = /<AppHost(?:Tabs|LanguagePivot)\b/i;
const defaultDocsSourceDirectory = fileURLToPath(
  new URL('../src/content/docs/', import.meta.url)
);

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
  concurrency = DEFAULT_CONCURRENCY,
  languageConfig = appHostLanguageConfig,
  sourceDirectory = defaultDocsSourceDirectory
) {
  const files = [];
  await collectMarkdownCopies(directory, files);

  const disabledIds = getDisabledAppHostProjectPageIds(languageConfig);
  const enabledOutputFiles = await removeDisabledAppHostMarkdownCopies(
    directory,
    files,
    disabledIds
  );
  const sourceCopies = [];
  if (sourceDirectory) {
    await collectAppHostSourceCopies(
      sourceDirectory,
      sourceDirectory,
      directory,
      disabledIds,
      sourceCopies
    );
  }
  const regeneratedOutputFiles = new Set(sourceCopies.map(({ outputPath }) => outputPath));

  await runWorkerPool(sourceCopies, concurrency, ({ sourcePath, outputPath }) =>
    regenerateAppHostMarkdownCopy(
      sourcePath,
      outputPath,
      sourceDirectory,
      directory,
      languageConfig
    )
  );
  await runWorkerPool(
    enabledOutputFiles.filter((filePath) => !regeneratedOutputFiles.has(filePath)),
    concurrency,
    (filePath) => processMarkdownCopy(filePath, directory)
  );
}

async function runWorkerPool(items, concurrency, action) {
  if (items.length === 0) {
    return;
  }

  // Normalize to a finite positive integer so a stray NaN/0/negative value can't
  // collapse the worker pool to an empty array and silently skip every file.
  const limit = Number.isFinite(concurrency) ? Math.floor(concurrency) : DEFAULT_CONCURRENCY;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < items.length) {
      await action(items[cursor++]);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, runWorker));
}

async function removeDisabledAppHostMarkdownCopies(directory, files, disabledIds) {
  const enabledFiles = [];
  const disabledFiles = [];

  for (const filePath of files) {
    const relativePath = normalizeRelativePath(path.relative(directory, filePath));
    if (disabledIds.some((id) => relativePath === `${id}.md` || relativePath.endsWith(`/${id}.md`))) {
      disabledFiles.push(filePath);
    } else {
      enabledFiles.push(filePath);
    }
  }

  await Promise.all(disabledFiles.map((filePath) => rm(filePath, { force: true })));
  return enabledFiles;
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

async function collectAppHostSourceCopies(
  currentDirectory,
  sourceDirectory,
  outputDirectory,
  disabledIds,
  copies
) {
  const entries = await readdir(currentDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(currentDirectory, entry.name);

    if (entry.isDirectory()) {
      await collectAppHostSourceCopies(
        sourcePath,
        sourceDirectory,
        outputDirectory,
        disabledIds,
        copies
      );
      continue;
    }

    if (!entry.isFile() || !sourceMarkdownExtensions.has(path.extname(entry.name))) {
      continue;
    }

    const content = await readFile(sourcePath, 'utf8');
    if (!appHostLanguageSourcePattern.test(content)) {
      continue;
    }

    const outputPath = getPageActionsMarkdownOutputPath(
      sourcePath,
      sourceDirectory,
      outputDirectory
    );
    const outputRelativePath = normalizeRelativePath(path.relative(outputDirectory, outputPath));
    if (
      disabledIds.some(
        (id) => outputRelativePath === `${id}.md` || outputRelativePath.endsWith(`/${id}.md`)
      )
    ) {
      continue;
    }

    copies.push({ sourcePath, outputPath });
  }
}

export function getPageActionsMarkdownOutputPath(
  sourcePath,
  sourceDirectory,
  outputDirectory
) {
  const relativePath = path.relative(sourceDirectory, sourcePath);
  const extension = path.extname(relativePath);
  const pathSegments = relativePath.slice(0, -extension.length).split(path.sep);
  const fileName = pathSegments.at(-1);
  let outputSegments;

  if (fileName === 'index') {
    if (pathSegments.length === 1) {
      outputSegments = ['index.md'];
    } else {
      outputSegments = [
        ...pathSegments.slice(0, -2),
        `${pathSegments.at(-2)}.md`,
      ];
    }
  } else {
    outputSegments = [
      ...pathSegments.slice(0, -1),
      `${fileName}.md`,
    ];
  }

  return path.join(outputDirectory, ...outputSegments);
}

async function regenerateAppHostMarkdownCopy(
  sourcePath,
  outputPath,
  sourceDirectory,
  outputDirectory,
  languageConfig
) {
  const sourceRelativePath = normalizeRelativePath(path.relative(sourceDirectory, sourcePath));
  const outputRelativePath = normalizeRelativePath(path.relative(outputDirectory, outputPath));

  try {
    const source = await readFile(sourcePath, 'utf8');
    const rendered = renderAppHostTabsInMarkdown(source, languageConfig.languages);
    const cleaned = cleanStarlightMarkdown(rendered, {
      frontmatter: 'title-as-heading',
      internalLinks: { mode: 'preserve' },
    });
    const ordered = orderTypeScriptFirstAppHostTabsInMarkdown(cleaned);
    const updated = replaceAspireVersionPlaceholders(ordered);

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, updated);
  } catch (error) {
    throw new Error(
      `Failed to regenerate Markdown copy "${outputRelativePath}" from source "${sourceRelativePath}": ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

async function processMarkdownCopy(filePath, outputDirectory) {
  const relativePath = normalizeRelativePath(path.relative(outputDirectory, filePath));

  try {
    const content = await readFile(filePath, 'utf8');
    const ordered = orderTypeScriptFirstAppHostTabsInMarkdown(content);
    const updated = replaceAspireVersionPlaceholders(ordered);

    if (updated !== content) {
      await writeFile(filePath, updated);
    }
  } catch (error) {
    throw new Error(
      `Failed to process Markdown copy "${relativePath}": ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join('/');
}
