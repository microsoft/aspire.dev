import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

  test('replaces placeholders in generated markdown assets', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aspire-version-placeholders-'));

    try {
      const markdownPath = path.join(tempDir, 'example.md');
      const jsonPath = path.join(tempDir, 'example.json');

      await Promise.all([
        writeFile(markdownPath, 'Aspire %ASPIRE_VERSION_MAJOR_MINOR%: %ASPIRE_VERSION%'),
        writeFile(jsonPath, '{"version":"%ASPIRE_VERSION%"}'),
      ]);

      await replaceAspireVersionPlaceholdersInDirectory(tempDir);

      await expect(readFile(markdownPath, 'utf8')).resolves.toBe(
        `Aspire ${currentAspireMajorMinorVersion}: ${currentAspireVersion}`
      );
      await expect(readFile(jsonPath, 'utf8')).resolves.toBe('{"version":"%ASPIRE_VERSION%"}');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
