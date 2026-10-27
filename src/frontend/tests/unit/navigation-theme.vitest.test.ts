import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transpileModule, ScriptTarget } from 'typescript';
import { expect, test } from 'vitest';

const head = readFileSync(
  new URL('../../src/components/starlight/Head.astro', import.meta.url),
  'utf8'
);
test('ClientRouter owns transitions without a second cross-document opt-in', () => {
  const css = readFileSync(new URL('../../src/styles/site.css', import.meta.url), 'utf8');
  expect(head).toContain('<ClientRouter fallback="swap" />');
  expect(css).not.toMatch(/@view-transition\s*\{[^}]*navigation:\s*auto/);
});

const source = head.match(
  /<script>\s*import '@scripts\/deployment-guard';([\s\S]*?)<\/script>/
)?.[1];
if (!source) throw new Error('Shared navigation theme script not found.');
const script = transpileModule(source.replace("import '@scripts/mermaid';", ''), {
  compilerOptions: { target: ScriptTarget.ES2022 },
}).outputText;

test.each(['light', 'dark'])(
  'preserves effective %s theme without replacing other route state',
  (theme) => {
    const events = new EventTarget();
    runInNewContext(script, {
      document: {
        documentElement: { dataset: { theme } },
        addEventListener: events.addEventListener.bind(events),
      },
    });
    const next = { documentElement: { dataset: { theme: 'server-default', locale: 'fr' } } };
    events.dispatchEvent(
      Object.assign(new Event('astro:before-preparation'), { newDocument: next })
    );
    expect(next.documentElement.dataset.theme).toBe('server-default');
    const swap = Object.assign(new Event('astro:before-swap'), { newDocument: next });
    events.dispatchEvent(swap);
    expect(next.documentElement.dataset).toEqual({ theme, locale: 'fr' });
    expect(swap.defaultPrevented).toBe(false);
  }
);
