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
// The patch in `src/frontend/patches/starlight-llms-txt@0.8.1.patch` adds a
// `minify.collapseCodeBlocks` option (default `false`). When unset (the new
// default), the plugin preserves the bodies of ``` and ~~~ fenced blocks
// while still collapsing whitespace in surrounding prose. Setting it to
// `true` restores the legacy flatten-everything behavior. The upstream PR
// mirrors this change.
//
// The sentinel below pins the *exact* fence regex shipped in the patched
// plugin to the regex used by the inlined helper. That makes the behavior
// fixtures (which run the inlined helper) a faithful test of what's actually
// running at build time — drift between the inlined copy and the shipped
// patched code fails CI on the sentinel.

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(testsDir, '..', '..');
const patchedPluginPath = path.join(
  frontendRoot,
  'node_modules',
  'starlight-llms-txt',
  'entryToSimpleMarkdown.ts',
);

// Source of the fence regex used by the inlined helper, captured as a string
// so it can be compared byte-for-byte to the regex literal embedded in the
// patched plugin file. MUST equal `INLINED_FENCE_MATCHER.toString()`.
const INLINED_FENCE_MATCHER =
  /(?<=^|\n)([ \t]*)(`{3,}|~{3,})[^\n]*\n(?:[\s\S]*?\n)?\1\2[ \t]*(?=\n|$)/g;

describe('starlight-llms-txt patch sentinel', () => {
  test('patched entryToSimpleMarkdown.ts contains collapseCodeBlocks branch', () => {
    const source = readFileSync(patchedPluginPath, 'utf8');

    expect(
      source,
      'patched plugin should declare the collapseCodeBlocks default',
    ).toContain('collapseCodeBlocks: false');
    expect(
      source,
      'patched plugin should gate the legacy branch on the new option',
    ).toContain('minify.collapseCodeBlocks');
    expect(
      source,
      'patched plugin should trim boundary whitespace introduced by the `\\n` wrappers',
    ).toContain("parts.join('').trim()");
    expect(
      source,
      'patched plugin should guard the optional `match.index`',
    ).toContain('match.index ?? 0');
  });

  test('patched fence regex matches the regex used by the inlined helper', () => {
    const source = readFileSync(patchedPluginPath, 'utf8');
    const regexLiteral = source.match(/\/\(\?<=\^\|\\n\)[^\n]+\/g/);

    expect(
      regexLiteral,
      'patched plugin should declare a fenceMatcher regex literal',
    ).not.toBeNull();
    // This pins the regex shipped in the plugin to the regex run by the
    // fixtures below. If upstream amends the algorithm, the inlined copy and
    // this assertion both need to be updated together.
    expect(regexLiteral![0]).toBe(INLINED_FENCE_MATCHER.toString());
  });
});

// The minify algorithm from the patch, inlined here so the fixtures run in
// isolation from the plugin's full runtime (which depends on Astro/Starlight).
// MUST stay byte-identical to the implementation in
// `patches/starlight-llms-txt@0.8.1.patch`; the sentinel above enforces this.
function minifyPreservingCodeBlocks(markdown: string): string {
  const fenceMatcher = new RegExp(INLINED_FENCE_MATCHER.source, INLINED_FENCE_MATCHER.flags);
  const parts: string[] = [];
  let lastIndex = 0;
  for (const match of markdown.matchAll(fenceMatcher)) {
    const index = match.index ?? 0;
    parts.push(markdown.slice(lastIndex, index).replace(/\s+/g, ' '));
    parts.push('\n', match[0], '\n');
    lastIndex = index + match[0].length;
  }
  parts.push(markdown.slice(lastIndex).replace(/\s+/g, ' '));
  return parts.join('').trim();
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
    expected: '```a\nx\n```\n \n```b\ny\n```',
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
    expected: '```js\nconst a = 1;\n```\n trailing prose',
  },
  {
    name: 'fence at end of input',
    input: 'leading prose\n\n```js\nconst a = 1;\n```',
    expected: 'leading prose \n```js\nconst a = 1;\n```',
  },
  {
    name: 'mismatched fence length does not match',
    input: 'pre\n\n```bash\naspire run\n````\n\npost',
    expected: 'pre ```bash aspire run ```` post',
  },
  {
    name: 'empty fenced block is preserved',
    input: 'pre\n\n```\n```\n\npost',
    expected: 'pre \n```\n```\n post',
  },
  {
    name: 'fence-only input (start AND end of input)',
    input: '```js\nconst a = 1;\n```',
    expected: '```js\nconst a = 1;\n```',
  },
];

describe('starlight-llms-txt minify preserves fenced code blocks', () => {
  for (const fixture of fixtures) {
    test(fixture.name, () => {
      expect(minifyPreservingCodeBlocks(fixture.input)).toBe(fixture.expected);
    });
  }
});
