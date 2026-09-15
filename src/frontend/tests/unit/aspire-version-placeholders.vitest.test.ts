import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { locales } from '../../config/locales.ts';
import { replaceAspireVersionPlaceholdersInDirectory } from '../../config/aspire-version-placeholders-integration.mjs';
import {
  currentAspireMajorMinorVersion,
  currentAspirePreviewVersion,
  currentAspireVersion,
} from '../../config/aspire-versions.mjs';
import {
  remarkAspireVersionPlaceholders,
  replaceAspireVersionPlaceholders,
} from '../../config/remark-aspire-version-placeholders.mjs';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(testsDir, '..', '..');
const docsRoot = path.join(frontendRoot, 'src', 'content', 'docs');
const appHostProjectPath = path.resolve(
  frontendRoot,
  '..',
  'apphost',
  'Aspire.Dev.AppHost',
  'Aspire.Dev.AppHost.csproj'
);
const excludedCurrentDocsDirectories = new Set([
  ...Object.keys(locales).filter((locale) => locale !== 'root'),
  'whats-new',
]);
const aspirePrereleaseVersionPattern =
  /(?:\b\d+\.\d+\.\d+|%ASPIRE_VERSION%)-(?:preview|alpha|beta|rc)(?:\.[0-9A-Za-z-]+)+/gi;

function hasAspireVersionContext(
  content: string,
  lines: string[],
  lineIndex: number,
  index: number
) {
  if (/Aspire/i.test(lines[lineIndex])) {
    return true;
  }

  const packageReferenceStart = content.lastIndexOf('<PackageReference', index);
  const previousTagEnd = content.lastIndexOf('>', index);
  if (packageReferenceStart > previousTagEnd) {
    const packageReferenceEnd = content.indexOf('>', index);
    const packageReference = content.slice(
      packageReferenceStart,
      packageReferenceEnd === -1 ? content.length : packageReferenceEnd + 1
    );
    if (/\bInclude\s*=\s*(['"])[^'"]*Aspire[^'"]*\1/i.test(packageReference)) {
      return true;
    }
  }

  let commandStartLine = lineIndex;
  while (commandStartLine > 0 && /[\\`^]\s*$/.test(lines[commandStartLine - 1])) {
    commandStartLine--;
  }

  return (
    commandStartLine < lineIndex &&
    /Aspire/i.test(lines.slice(commandStartLine, lineIndex + 1).join('\n'))
  );
}

function findAspirePrereleaseVersions(content: string) {
  const lines = content.split(/\r?\n/);

  return [...content.matchAll(aspirePrereleaseVersionPattern)].flatMap((match) => {
    const index = match.index;
    const lineIndex = (content.slice(0, index).match(/\n/g) ?? []).length;

    return hasAspireVersionContext(content, lines, lineIndex, index)
      ? [{ line: lineIndex + 1, value: match[0] }]
      : [];
  });
}

async function collectMarkdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const resolvedPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectMarkdownFiles(resolvedPath);
      }
      return entry.isFile() && /\.mdx?$/i.test(entry.name) ? [resolvedPath] : [];
    })
  );
  return files.flat();
}

async function collectCurrentEnglishMarkdownFiles(): Promise<string[]> {
  const entries = await readdir(docsRoot, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const resolvedPath = path.join(docsRoot, entry.name);
      if (entry.isDirectory()) {
        return excludedCurrentDocsDirectories.has(entry.name)
          ? []
          : collectMarkdownFiles(resolvedPath);
      }
      return entry.isFile() && /\.mdx?$/i.test(entry.name) ? [resolvedPath] : [];
    })
  );
  return files.flat();
}

describe('Aspire version placeholders', () => {
  test('replaces current Aspire major.minor, stable, and preview placeholders', () => {
    expect(
      replaceAspireVersionPlaceholders(
        'Aspire %ASPIRE_VERSION_MAJOR_MINOR% ships as %ASPIRE_VERSION%; preview packages use %ASPIRE_VERSION_PREVIEW%.'
      )
    ).toBe(
      `Aspire ${currentAspireMajorMinorVersion} ships as ${currentAspireVersion}; preview packages use ${currentAspirePreviewVersion}.`
    );
  });

  test('replaces placeholders in markdown text, code fences, and MDX attributes', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Aspire %ASPIRE_VERSION_MAJOR_MINOR%' }],
        },
        { type: 'code', lang: 'bash', value: 'aspire %ASPIRE_VERSION_PREVIEW%' },
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
    expect(tree.children[1].value).toBe(`aspire ${currentAspirePreviewVersion}`);
    expect(tree.children[2].attributes[0].value).toBe(currentAspireVersion);
  });

  test('matches the stable and preview versions used by the site AppHost', async () => {
    const project = await readFile(appHostProjectPath, 'utf8');
    const sdkVersion = project.match(/<Project Sdk="Aspire\.AppHost\.Sdk\/([^"]+)">/)?.[1];
    const previewVersion = project.match(
      /<PackageReference Include="Aspire\.Hosting\.Azure\.FrontDoor" Version="([^"]+)" \/>/
    )?.[1];

    expect(sdkVersion).toBe(currentAspireVersion);
    expect(previewVersion).toBe(currentAspirePreviewVersion);
  });

  test('finds hard-coded previews in multiline Aspire package examples', () => {
    const content = [
      '<PackageReference Include="Aspire.Hosting.Xml"',
      '                  Version="13.5.3-preview.1.123" />',
      '',
      'dotnet add package Aspire.Hosting.Command \\',
      '  --version 13.5.3-preview.2.456',
      '',
      '<PackageReference Include="Contoso.Hosting.Xml"',
      '                  Version="13.5.3-preview.3.789" />',
    ].join('\n');

    expect(findAspirePrereleaseVersions(content)).toEqual([
      { line: 2, value: '13.5.3-preview.1.123' },
      { line: 5, value: '13.5.3-preview.2.456' },
    ]);
  });

  test('requires the full preview placeholder in current English Aspire examples', async () => {
    const files = await collectCurrentEnglishMarkdownFiles();
    const findings = (
      await Promise.all(
        files.map(async (filePath) => {
          const content = await readFile(filePath, 'utf8');
          return findAspirePrereleaseVersions(content).map(
            ({ line, value }) => `${path.relative(docsRoot, filePath)}:${line}: ${value}`
          );
        })
      )
    ).flat();

    expect(findings).toEqual([]);
  });

  test('replaces placeholders only in Markdown copies, leaving other assets untouched', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aspire-version-placeholders-'));

    try {
      const markdownPath = path.join(tempDir, 'example.md');
      const htmlPath = path.join(tempDir, 'example.html');
      const textPath = path.join(tempDir, 'example.txt');
      const mdxPath = path.join(tempDir, 'example.mdx');
      const jsonPath = path.join(tempDir, 'example.json');

      const placeholderContent =
        'Aspire %ASPIRE_VERSION_MAJOR_MINOR%: %ASPIRE_VERSION% (%ASPIRE_VERSION_PREVIEW%)';

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
        `Aspire ${currentAspireMajorMinorVersion}: ${currentAspireVersion} (${currentAspirePreviewVersion})`
      );

      // The post-build pass intentionally rewrites only `.md` files. In the real
      // build `.html`/`.txt`/`.mdx` are produced through the remark pipeline (so
      // they're already replaced before this pass runs) and `.json` is never a
      // placeholder target; this test seeds them with raw placeholders to assert
      // that this pass leaves every non-`.md` extension untouched.
      await expect(readFile(htmlPath, 'utf8')).resolves.toBe(placeholderContent);
      await expect(readFile(textPath, 'utf8')).resolves.toBe(placeholderContent);
      await expect(readFile(mdxPath, 'utf8')).resolves.toBe(placeholderContent);
      await expect(readFile(jsonPath, 'utf8')).resolves.toBe('{"version":"%ASPIRE_VERSION%"}');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test('orders C#-first AppHost tabs in generated Markdown copies', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aspire-version-placeholders-'));

    try {
      const markdownPath = path.join(tempDir, 'example.md');
      const csharp = `<TabItem id='csharp' label='C#'>
Aspire %ASPIRE_VERSION%
</TabItem>
`;
      const typescript = `<TabItem id='typescript' label='TypeScript'>
TypeScript content
</TabItem>
`;
      await writeFile(
        markdownPath,
        `<Tabs syncKey='aspire-lang'>
${csharp}${typescript}</Tabs>
`
      );

      await replaceAspireVersionPlaceholdersInDirectory(tempDir);

      await expect(readFile(markdownPath, 'utf8')).resolves.toBe(
        `<Tabs syncKey='aspire-lang'>
${typescript}${csharp.replace('%ASPIRE_VERSION%', currentAspireVersion)}</Tabs>
`
      );
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

  test('falls back to a valid worker count when given a non-finite concurrency', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aspire-version-placeholders-'));

    try {
      const markdownPath = path.join(tempDir, 'example.md');
      await writeFile(markdownPath, 'Aspire %ASPIRE_VERSION_MAJOR_MINOR%: %ASPIRE_VERSION%');

      // A non-finite concurrency must not collapse the worker pool to an empty
      // array and silently skip every file.
      await replaceAspireVersionPlaceholdersInDirectory(tempDir, Number.NaN);

      await expect(readFile(markdownPath, 'utf8')).resolves.toBe(
        `Aspire ${currentAspireMajorMinorVersion}: ${currentAspireVersion}`
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
