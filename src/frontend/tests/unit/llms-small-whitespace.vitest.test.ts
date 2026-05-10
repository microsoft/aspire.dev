import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// This file pins the behavior of the patched `starlight-llms-txt` plugin so a
// future dependency bump or accidental patch loss is caught in CI rather than
// regressing the generated `dist/llms-small.txt`.
//
// Background: `starlight-llms-txt@0.8.1` ships an `entryToSimpleMarkdown.ts`
// whose `minify.whitespace` path runs `markdown.replace(/\s+/g, ' ')`, which
// collapses every whitespace run — including newlines inside fenced code
// blocks — into a single space. Downstream LLM consumers (e.g. the Aspire CLI
// `aspire docs get` command) then render multi-line code samples as flowed
// prose.
//
// The patch in `src/frontend/patches/starlight-llms-txt@0.8.1.patch` introduces
// a `minify.preserveCodeBlocks` option (default `true`) that preserves the
// bodies of ``` and ~~~ fenced blocks while still collapsing whitespace in
// surrounding prose. The upstream PR mirrors this change.

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(testsDir, '..', '..');
const patchedPluginPath = path.join(
  frontendRoot,
  'node_modules',
  'starlight-llms-txt',
  'entryToSimpleMarkdown.ts',
);

describe('starlight-llms-txt patch sentinel', () => {
  test('patched entryToSimpleMarkdown.ts contains preserveCodeBlocks branch', () => {
    const source = readFileSync(patchedPluginPath, 'utf8');

    expect(
      source,
      'patched plugin should declare the preserveCodeBlocks default',
    ).toContain('preserveCodeBlocks: true');
    expect(
      source,
      'patched plugin should guard the new branch with the option',
    ).toContain('minify.preserveCodeBlocks');
    expect(
      source,
      'patched plugin should match fenced code blocks at start of line',
    ).toContain('`{3,}|~{3,}');
  });
});

// The minify algorithm from the patch, inlined here so the fixtures run in
// isolation from the plugin's full runtime (which depends on Astro/Starlight).
// MUST stay byte-identical to the implementation in
// `patches/starlight-llms-txt@0.8.1.patch`.
function minifyPreservingCodeBlocks(markdown: string): string {
  const fenceMatcher = /(?<=^|\n)([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1\2[ \t]*(?=\n|$)/g;
  const parts: string[] = [];
  let lastIndex = 0;
  for (const match of markdown.matchAll(fenceMatcher)) {
    parts.push(markdown.slice(lastIndex, match.index).replace(/\s+/g, ' '));
    parts.push('\n', match[0], '\n');
    lastIndex = match.index + match[0].length;
  }
  parts.push(markdown.slice(lastIndex).replace(/\s+/g, ' '));
  return parts.join('');
}

const fixtures: Array<{ name: string; input: string; expected: string }> = [
  {
    name: 'plain prose collapses to single space',
    input: 'Hello\nworld\n\n   tabs\there.',
    expected: 'Hello world tabs here.',
  },
  {
    name: 'single fenced block preserves internal newlines',
    input:
      'Before paragraph.\n\n```bash\naspire certs trust\naspire certs clean\n```\n\nAfter paragraph.',
    expected:
      'Before paragraph. \n```bash\naspire certs trust\naspire certs clean\n```\n After paragraph.',
  },
  {
    name: 'two adjacent fenced blocks',
    input: '```a\nx\n```\n```b\ny\n```',
    expected: '\n```a\nx\n```\n \n```b\ny\n```\n',
  },
  {
    name: '4-backtick fence containing literal triple-backtick',
    input: 'pre\n\n````md\nFenced ``` example\nMore body\n````\n\npost',
    expected: 'pre \n````md\nFenced ``` example\nMore body\n````\n post',
  },
  {
    name: 'tilde fence preserved',
    input: 'pre\n\n~~~py\ndef foo():\n    return 1\n~~~\n\npost',
    expected: 'pre \n~~~py\ndef foo():\n    return 1\n~~~\n post',
  },
  {
    name: 'fence nested under list item keeps indentation',
    input: '- item\n\n  ```cs\n  var x = 1;\n  ```\n\n- next',
    expected: '- item \n  ```cs\n  var x = 1;\n  ```\n - next',
  },
  {
    name: 'inline triple-backtick in prose is NOT a fence',
    input: 'See ```inline``` text.',
    expected: 'See ```inline``` text.',
  },
  {
    name: 'fence at start of input',
    input: '```js\nconst a = 1;\n```\n\ntrailing prose',
    expected: '\n```js\nconst a = 1;\n```\n trailing prose',
  },
  {
    name: 'fence at end of input',
    input: 'leading prose\n\n```js\nconst a = 1;\n```',
    expected: 'leading prose \n```js\nconst a = 1;\n```\n',
  },
  {
    name: 'mismatched fence length does not match',
    input: 'pre\n\n```bash\naspire run\n````\n\npost',
    expected: 'pre ```bash aspire run ```` post',
  },
];

describe('starlight-llms-txt minify preserves fenced code blocks', () => {
  for (const fixture of fixtures) {
    test(fixture.name, () => {
      expect(minifyPreservingCodeBlocks(fixture.input)).toBe(fixture.expected);
    });
  }
});
