import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { replaceAspireVersionPlaceholdersInDirectory } from '../../config/aspire-version-placeholders-integration.mjs';
import {
  currentAspireMajorMinorVersion,
  currentAspireVersion,
} from '../../config/aspire-versions.mjs';
import {
  remarkAspireVersionPlaceholders,
  replaceAspireVersionPlaceholders,
} from '../../config/remark-aspire-version-placeholders.mjs';

describe('Aspire version placeholders', () => {
  test('replaces current Aspire major.minor and patch placeholders', () => {
    expect(
      replaceAspireVersionPlaceholders(
        'Aspire %ASPIRE_VERSION_MAJOR_MINOR% ships as %ASPIRE_VERSION%.'
      )
    ).toBe(`Aspire ${currentAspireMajorMinorVersion} ships as ${currentAspireVersion}.`);
  });

  test('replaces placeholders in markdown text, code fences, and MDX attributes', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Aspire %ASPIRE_VERSION_MAJOR_MINOR%' }],
        },
        { type: 'code', lang: 'bash', value: 'aspire %ASPIRE_VERSION%' },
        {
          type: 'mdxJsxFlowElement',
          name: 'Code',
          attributes: [{ type: 'mdxJsxAttribute', name: 'code', value: '%ASPIRE_VERSION%' }],
          children: [],
        },
      ],
    };

    remarkAspireVersionPlaceholders()(tree);

    expect(tree.children[0].children[0].value).toBe(
      `Aspire ${currentAspireMajorMinorVersion}`
    );
    expect(tree.children[1].value).toBe(`aspire ${currentAspireVersion}`);
    expect(tree.children[2].attributes[0].value).toBe(currentAspireVersion);
  });

  test('replaces placeholders only in Markdown copies, leaving other assets untouched', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aspire-version-placeholders-'));

    try {
      const markdownPath = path.join(tempDir, 'example.md');
      const htmlPath = path.join(tempDir, 'example.html');
      const textPath = path.join(tempDir, 'example.txt');
      const mdxPath = path.join(tempDir, 'example.mdx');
      const jsonPath = path.join(tempDir, 'example.json');

      const placeholderContent = 'Aspire %ASPIRE_VERSION_MAJOR_MINOR%: %ASPIRE_VERSION%';

      await Promise.all([
        writeFile(markdownPath, placeholderContent),
        writeFile(htmlPath, placeholderContent),
        writeFile(textPath, placeholderContent),
        writeFile(mdxPath, placeholderContent),
        writeFile(jsonPath, '{"version":"%ASPIRE_VERSION%"}'),
      ]);

      await replaceAspireVersionPlaceholdersInDirectory(tempDir);

      // Only the `.md` copy (which bypasses the remark pipeline) is rewritten.
      await expect(readFile(markdownPath, 'utf8')).resolves.toBe(
        `Aspire ${currentAspireMajorMinorVersion}: ${currentAspireVersion}`
      );

      // `.html`/`.txt`/`.mdx` already have placeholders replaced by the remark
      // pipeline, and `.json` is never a placeholder target — all are left as-is.
      await expect(readFile(htmlPath, 'utf8')).resolves.toBe(placeholderContent);
      await expect(readFile(textPath, 'utf8')).resolves.toBe(placeholderContent);
      await expect(readFile(mdxPath, 'utf8')).resolves.toBe(placeholderContent);
      await expect(readFile(jsonPath, 'utf8')).resolves.toBe('{"version":"%ASPIRE_VERSION%"}');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test('replaces Markdown placeholders recursively under a bounded concurrency limit', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aspire-version-placeholders-'));

    try {
      // Spread more `.md` files than the worker-pool concurrency across nested
      // directories so the bounded recursive traversal is exercised, alongside
      // non-`.md` assets that must be left untouched.
      const placeholderContent = 'Aspire %ASPIRE_VERSION_MAJOR_MINOR% is %ASPIRE_VERSION%.';
      const ignoredExtensions = ['.html', '.txt', '.mdx', '.json'];
      const markdownPaths: string[] = [];
      const ignoredPaths: string[] = [];

      for (let depth = 0; depth < 4; depth++) {
        const dir = path.join(tempDir, ...Array.from({ length: depth }, (_, i) => `level-${i}`));
        await mkdir(dir, { recursive: true });

        for (let index = 0; index < 5; index++) {
          const markdownPath = path.join(dir, `asset-${index}.md`);
          await writeFile(markdownPath, placeholderContent);
          markdownPaths.push(markdownPath);

          const extension = ignoredExtensions[index % ignoredExtensions.length];
          const ignoredPath = path.join(dir, `asset-${index}${extension}`);
          await writeFile(ignoredPath, placeholderContent);
          ignoredPaths.push(ignoredPath);
        }
      }

      await replaceAspireVersionPlaceholdersInDirectory(tempDir, 2);

      await Promise.all(
        markdownPaths.map(async (markdownPath) => {
          await expect(readFile(markdownPath, 'utf8')).resolves.toBe(
            `Aspire ${currentAspireMajorMinorVersion} is ${currentAspireVersion}.`
          );
        })
      );

      await Promise.all(
        ignoredPaths.map(async (ignoredPath) => {
          await expect(readFile(ignoredPath, 'utf8')).resolves.toBe(placeholderContent);
        })
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
