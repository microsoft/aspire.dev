import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(testsDir, '..', '..');
const docsRoot = path.join(frontendRoot, 'src', 'content', 'docs');
const fileTreeBlockPattern = /<FileTree\b[^>]*>([\s\S]*?)<\/FileTree>/g;

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
