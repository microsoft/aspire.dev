import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(testsDir, '..', '..');
const docsRoot = path.join(frontendRoot, 'src', 'content', 'docs');
const fileTreeBlockPattern = /<FileTree\b[^>]*>([\s\S]*?)<\/FileTree>/g;
const frontmatterPattern = /^\uFEFF?\s*---\r?\n([\s\S]*?)\r?\n---/;

function collectDocs(dirPath: string): string[] {
  const entries = readdirSync(dirPath, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const resolvedPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      return collectDocs(resolvedPath);
    }

    return /\.(md|mdx)$/i.test(entry.name) ? [resolvedPath] : [];
  });
}

function getLineNumber(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/).length;
}

function findFileTreeIssues(source: string): Array<{ line: number; reason: string }> {
  const issues: Array<{ line: number; reason: string }> = [];

  for (const match of source.matchAll(fileTreeBlockPattern)) {
    const block = match[1] ?? '';
    const blockStart = match.index ?? 0;
    const blockLine = getLineNumber(source, blockStart);
    const lines = block.split(/\r?\n/);
    const nonEmptyLines = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.trim().length > 0);

    if (nonEmptyLines.length === 0) {
      issues.push({ line: blockLine, reason: 'FileTree block is empty.' });
      continue;
    }

    if (nonEmptyLines.length === 1) {
      const [{ line, index }] = nonEmptyLines;
      const trimmed = line.trim();
      const trailing = trimmed.replace(/^-\s+/, '');

      if (/\s-\s+\S/.test(trailing)) {
        issues.push({
          line: blockLine + index + 1,
          reason: 'FileTree items appear to be collapsed onto a single source line.',
        });
      }
    }

    for (const { line, index } of nonEmptyLines) {
      if (!/^\s*-\s+\S/.test(line)) {
        issues.push({
          line: blockLine + index + 1,
          reason: `FileTree content must stay as markdown list items: ${line.trim()}`,
        });
        continue;
      }

      const trailing = line.replace(/^\s*-\s+/, '');
      if (/\s{2,}-\s+\S/.test(trailing)) {
        issues.push({
          line: blockLine + index + 1,
          reason: 'FileTree line contains more than one markdown list marker.',
        });
      }
    }
  }

  return issues;
}

function isTableOfContentsEnabled(source: string): boolean {
  const frontmatterMatch = source.match(frontmatterPattern);
  const frontmatter = frontmatterMatch?.[1] ?? '';

  return !/^\s*tableOfContents\s*:\s*false\b/m.test(frontmatter);
}

function findOverviewHeadingIssues(source: string): Array<{ line: number; reason: string }> {
  if (!isTableOfContentsEnabled(source)) {
    return [];
  }

  const issues: Array<{ line: number; reason: string }> = [];
  const lines = source.split(/\r?\n/);
  let currentFence: { char: '`' | '~'; length: number } | null = null;

  for (const [index, line] of lines.entries()) {
    const fenceMatch = line.match(/^\s*((`{3,})|(~{3,}))/);
    if (fenceMatch) {
      const fenceDelimiter = fenceMatch[1];
      const fenceChar = fenceDelimiter[0] as '`' | '~';
      const fenceLength = fenceDelimiter.length;

      if (!currentFence) {
        currentFence = { char: fenceChar, length: fenceLength };
        continue;
      }

      if (currentFence.char === fenceChar && fenceLength >= currentFence.length) {
        currentFence = null;
        continue;
      }
    }

    if (currentFence) {
      continue;
    }

    if (/^\s*##+\s+Overview\s*$/.test(line)) {
      issues.push({
        line: index + 1,
        reason:
          'TOC-enabled pages must not include an explicit "Overview" heading; use intro text or a more specific heading.',
      });
    }
  }

  return issues;
}

test('FileTree markdown lists remain newline-delimited in docs source', () => {
  const docPaths = collectDocs(docsRoot);
  const failures = docPaths.flatMap((docPath) => {
    const source = readFileSync(docPath, 'utf8');
    const relativePath = path.relative(frontendRoot, docPath).replaceAll(path.sep, '/');

    return findFileTreeIssues(source).map(
      ({ line, reason }) => `${relativePath}:${line} ${reason}`
    );
  });

  expect(failures, failures.join('\n')).toEqual([]);
});

test('TOC-enabled docs do not include an explicit Overview heading', () => {
  const docPaths = collectDocs(docsRoot);
  const failures = docPaths.flatMap((docPath) => {
    const source = readFileSync(docPath, 'utf8');
    const relativePath = path.relative(frontendRoot, docPath).replaceAll(path.sep, '/');

    return findOverviewHeadingIssues(source).map(
      ({ line, reason }) => `${relativePath}:${line} ${reason}`
    );
  });

  expect(failures, failures.join('\n')).toEqual([]);
});
