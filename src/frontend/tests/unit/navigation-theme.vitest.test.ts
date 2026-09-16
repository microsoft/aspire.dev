import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transpileModule, ScriptTarget } from 'typescript';
import { expect, test } from 'vitest';

const head = readFileSync(
  new URL('../../src/components/starlight/Head.astro', import.meta.url), 'utf8',
);
const source = head.match(
  /<script>\s*import '@scripts\/deployment-guard';([\s\S]*?)<\/script>/,
)?.[1];
if (!source) throw new Error('Shared navigation theme script not found.');
const script = transpileModule(source, {
  compilerOptions: { target: ScriptTarget.ES2022 },
}).outputText;

test.each(['light', 'dark'])('preserves effective %s theme without replacing other route state', (theme) => {
  const events = new EventTarget();
  runInNewContext(script, {
    document: {
      documentElement: { dataset: { theme } },
      addEventListener: events.addEventListener.bind(events),
    },
  });
  const next = { documentElement: { dataset: { theme: 'server-default', locale: 'fr' } } };
  events.dispatchEvent(Object.assign(new Event('astro:before-preparation'), { newDocument: next }));
  expect(next.documentElement.dataset.theme).toBe('server-default');
  const swap = Object.assign(new Event('astro:before-swap'), { newDocument: next });
  events.dispatchEvent(swap);
  expect(next.documentElement.dataset).toEqual({ theme, locale: 'fr' });
  expect(swap.defaultPrevented).toBe(false);
});
