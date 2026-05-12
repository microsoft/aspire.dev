/**
 * Regression test for the patched starlight-llms-txt `removeSelectors` option
 * (see `src/frontend/patches/starlight-llms-txt@0.8.1.patch`) and our wiring of
 * it in `astro.config.mjs`.
 *
 * Background: `expressive-code-twoslash` (configured in `ec.config.mjs`) wraps
 * tokens in TypeScript code blocks with hover popovers and other annotations.
 * Those annotations are valuable on the rendered site but, without the patch,
 * leak into the Markdown output that `starlight-llms-txt` produces for
 * `llms.txt` / `llms-full.txt` / `llms-small.txt`, corrupting the source code
 * we hand to LLM tooling.
 *
 * This test exercises the HTML → Markdown pipeline used by
 * `starlight-llms-txt`'s `entryToSimpleMarkdown`, with the same `removeSelectors`
 * we configure in `astro.config.mjs`, against a fixture that mirrors the
 * markup actually produced by `expressive-code-twoslash`. It asserts that:
 *
 *   1. The author-authored source code survives in the Markdown output.
 *   2. None of the popup/annotation text or class names leak through.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Element, RootContent } from 'hast';
import { matches } from 'hast-util-select';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { remove } from 'unist-util-remove';
import { describe, expect, test } from 'vitest';

/**
 * Must match the `removeSelectors` list passed to `starlightLlmsTxt({...})` in
 * `astro.config.mjs`. The wiring sentinel below enforces this equivalence; if
 * you change the list in one place, change it in the other.
 */
const REMOVE_SELECTORS = [
  '.twoslash-popup-container',
  '.twoslash-static',
  '.twoslash-completion',
  '.twoslash-error-box',
  '.twoslash-custom-box',
];

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(testsDir, '..', '..');
const patchedPluginRoot = path.join(frontendRoot, 'node_modules', 'starlight-llms-txt');
const patchedEntryToSimpleMarkdownPath = path.join(patchedPluginRoot, 'entryToSimpleMarkdown.ts');
const patchedTypesPath = path.join(patchedPluginRoot, 'types.ts');
const patchedIndexPath = path.join(patchedPluginRoot, 'index.ts');
const astroConfigPath = path.join(frontendRoot, 'astro.config.mjs');

// The behavior tests further down inline a copy of the patched plugin's
// HTML → Markdown pipeline so they can run without Astro/Starlight's full
// runtime. That's only meaningful if the patched plugin actually ships the
// same mechanism we're modelling, and only meaningful if `astro.config.mjs`
// actually passes our selector list to `starlightLlmsTxt({...})`. The two
// sentinel suites below pin those two contracts so a dropped patch or a
// removed call site fails CI rather than silently regressing the generated
// `dist/llms*.txt` outputs. This mirrors the sentinel pattern established
// in `llms-small-whitespace.vitest.test.ts`.

describe('starlight-llms-txt removeSelectors patch sentinel', () => {
  test('patched entryToSimpleMarkdown.ts wires the removeSelectorsLlmsTxt unified step', () => {
    const source = readFileSync(patchedEntryToSimpleMarkdownPath, 'utf8');

    expect(
      source,
      'patched plugin should read removeSelectors from the virtual project context',
    ).toContain('starlightLllmsTxtContext.removeSelectors');
    expect(
      source,
      'patched plugin should register a removeSelectorsLlmsTxt unified step',
    ).toMatch(/\.use\(function removeSelectorsLlmsTxt\(/);
    expect(
      source,
      'patched plugin should match nodes against the configured selectors',
    ).toMatch(/matches\(selector,\s*node\)/);
    expect(
      source,
      'patched plugin should bail out when no selectors are configured',
    ).toMatch(/removeSelectors\.length === 0/);
  });

  test('patched types.ts declares the new option and the ProjectContext field', () => {
    const source = readFileSync(patchedTypesPath, 'utf8');

    expect(
      source,
      'patched types should expose the public option on StarlightLllmsTextOptions',
    ).toContain('removeSelectors?: string[]');
    expect(
      source,
      'patched types should non-optionally surface the option on ProjectContext',
    ).toMatch(/removeSelectors:\s*NonNullable<StarlightLllmsTextOptions\['removeSelectors'\]>/);
  });

  test('patched index.ts forwards opts.removeSelectors into the project context', () => {
    const source = readFileSync(patchedIndexPath, 'utf8');

    expect(
      source,
      'patched index should default opts.removeSelectors to an empty array',
    ).toContain('removeSelectors: opts.removeSelectors ?? []');
  });
});

describe('starlight-llms-txt removeSelectors wiring sentinel', () => {
  test('astro.config.mjs passes the same selector list to starlightLlmsTxt', () => {
    const source = readFileSync(astroConfigPath, 'utf8');
    const starlightBlock = source.match(/starlightLlmsTxt\(\{[\s\S]+?\n\s*\}\)/);
    expect(
      starlightBlock,
      'astro.config.mjs should call starlightLlmsTxt({...})',
    ).not.toBeNull();

    const removeSelectorsBlock = starlightBlock![0].match(/removeSelectors:\s*\[([\s\S]*?)\]/);
    expect(
      removeSelectorsBlock,
      'starlightLlmsTxt block should declare a removeSelectors: [...] array',
    ).not.toBeNull();

    const configured = [...removeSelectorsBlock![1].matchAll(/['"]([^'"]+)['"]/g)]
      .map((m) => m[1])
      .sort();
    expect(
      configured,
      'astro.config.mjs removeSelectors must match the list under test (update both together when adding twoslash classes)',
    ).toEqual([...REMOVE_SELECTORS].sort());
  });
});

/**
 * Runs an HTML fragment through the same pipeline starlight-llms-txt uses to
 * convert rendered docs HTML back to Markdown.
 */
async function htmlToMarkdown(html: string, selectors: string[] = REMOVE_SELECTORS): Promise<string> {
  const file = await unified()
    .use(rehypeParse, { fragment: true })
    .use(function stripSelectors() {
      return (tree) => {
        if (selectors.length === 0) return;
        remove(tree, (node) => {
          const candidate = node as RootContent;
          return selectors.some((selector) => matches(selector, candidate));
        });
      };
    })
    .use(rehypeRemark)
    .use(remarkGfm)
    .use(remarkStringify)
    .process(html);
  return String(file).trim();
}

/**
 * Fixture that mirrors how `expressive-code-twoslash` annotates a hovered
 * identifier. See `node_modules/expressive-code-twoslash/dist/index.js` for the
 * exact wrappers — the popup container is rendered *before* the token inside
 * the `.twoslash-hover` wrapper.
 */
const HOVER_FIXTURE = `
<pre><code><span class="twoslash"><span class="twoslash-hover"><div class="twoslash-popup-container not-content"><code class="twoslash-popup-code"><span class="twoslash-popup-code-type">const builder: HostBuilder</span></code><div class="twoslash-popup-docs"><p>The application host builder.</p></div></div>builder</span></span> = await createBuilder();</code></pre>
`;

/** Fixture for a twoslash error annotation (`.twoerror`). */
const ERROR_FIXTURE = `
<pre><code><span class="twoslash twoerror">addProject('api', '../Api/Api.csproj', 'http')<div class="twoslash-error-box error"><span class="twoslash-error-box-icon"></span><span class="twoslash-error-box-content"><span class="twoslash-error-box-content-title">Error ts(2769) — </span><span class="twoslash-error-box-content-message">No overload matches this call.</span></span></div></span></code></pre>
`;

/** Fixture for a custom-tag annotation (`@log`, etc.). */
const CUSTOM_TAG_FIXTURE = `
<pre><code><span class="twoslash twocustom"><div class="twoslash-custom-box log"><span class="twoslash-custom-box-icon"></span><span class="twoslash-custom-box-content"><span class="twoslash-custom-box-content-title">Logged:</span><span class="twoslash-custom-box-content-message"> ready</span></span></div>console.log('ready')</span></code></pre>
`;

/** Fixture for the static popup attached to a `^?` query. */
const STATIC_QUERY_FIXTURE = `
<pre><code><span class="twoslash-noline"><span class="twoslash-cursor"> </span><div class="twoslash-static" style="margin-left:0px"><div class="twoslash-static-container not-content"><code class="twoslash-popup-code"><span class="twoslash-popup-code-type">const builder: HostBuilder</span></code></div></div></span></code></pre>
`;

/** Fixture for a completion popup attached to a `^|` query. */
const COMPLETION_FIXTURE = `
<pre><code><span class="twoslash-noline"><span class="twoslash-cursor"> </span><div class="twoslash-completion" style="margin-left:0px"><div class="twoslash-completion-container"><div class="twoslash-completion-item"><span class="twoslash-completion-name">addRedis</span></div></div></div></span></code></pre>
`;

const TWOSLASH_ARTIFACTS = [
  'twoslash-popup',
  'twoslash-static',
  'twoslash-completion',
  'twoslash-error-box',
  'twoslash-custom-box',
];

describe('starlight-llms-txt removeSelectors strips twoslash annotations', () => {
  test('removes hover popup but keeps the token text', async () => {
    const markdown = await htmlToMarkdown(HOVER_FIXTURE);
    expect(markdown).toContain('builder');
    expect(markdown).toContain('createBuilder()');
    expect(markdown).not.toContain('HostBuilder');
    expect(markdown).not.toContain('The application host builder.');
    for (const artifact of TWOSLASH_ARTIFACTS) {
      expect(markdown).not.toContain(artifact);
    }
  });

  test('removes error annotation box but keeps the offending source', async () => {
    const markdown = await htmlToMarkdown(ERROR_FIXTURE);
    expect(markdown).toContain("addProject('api', '../Api/Api.csproj', 'http')");
    expect(markdown).not.toContain('Error ts(2769)');
    expect(markdown).not.toContain('No overload matches this call.');
  });

  test('removes custom-tag callout but keeps the wrapped expression', async () => {
    const markdown = await htmlToMarkdown(CUSTOM_TAG_FIXTURE);
    expect(markdown).toContain("console.log('ready')");
    expect(markdown).not.toContain('Logged:');
    expect(markdown).not.toContain('ready</span>');
  });

  test('removes static `^?` popup contents', async () => {
    const markdown = await htmlToMarkdown(STATIC_QUERY_FIXTURE);
    expect(markdown).not.toContain('HostBuilder');
    for (const artifact of TWOSLASH_ARTIFACTS) {
      expect(markdown).not.toContain(artifact);
    }
  });

  test('removes `^|` completion popup contents', async () => {
    const markdown = await htmlToMarkdown(COMPLETION_FIXTURE);
    expect(markdown).not.toContain('addRedis');
    for (const artifact of TWOSLASH_ARTIFACTS) {
      expect(markdown).not.toContain(artifact);
    }
  });

  test('without removeSelectors, popup text DOES leak (sanity check)', async () => {
    const markdown = await htmlToMarkdown(HOVER_FIXTURE, []);
    expect(markdown).toContain('HostBuilder');
  });
});

describe('removeSelectors preserves twoslash wrappers around the token', () => {
  test('does not match `.twoslash`, `.twoslash-hover`, or `.twoslash-error-underline` wrappers', () => {
    /* These wrappers contain the author's actual code text and must be kept;
     * twoslash places them around the token, so removing them would strip the
     * source. This test locks in the safe selector list. */
    const dangerousWrappers: Element[] = [
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['twoslash'] },
        children: [],
      },
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['twoslash-hover'] },
        children: [],
      },
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['twoslash', 'twoslash-error-underline'] },
        children: [],
      },
    ];

    for (const wrapper of dangerousWrappers) {
      for (const selector of REMOVE_SELECTORS) {
        expect(
          matches(selector, wrapper),
          `${selector} must not match ${JSON.stringify(wrapper.properties.className)}`,
        ).toBe(false);
      }
    }
  });
});
