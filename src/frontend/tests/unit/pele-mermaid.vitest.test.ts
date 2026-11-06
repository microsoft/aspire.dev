import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectAll } from 'hast-util-select';
import { fromHtml } from 'hast-util-from-html';
import { expect, test } from 'vitest';
import { renderMermaid } from '../../src/utils/mermaid.mjs';

test('renders all existing documentation fences with the local icon packs', () => {
  function* files(directory: string): Generator<string> {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) yield* files(path);
      else if (/\.mdx?$/.test(entry.name)) yield path;
    }
  }
  let count = 0;
  for (const path of files(fileURLToPath(new URL('../../src/content/docs', import.meta.url)))) {
    const markdown = readFileSync(path, 'utf8');
    for (const match of markdown.matchAll(/^[ \t]*```mermaid[ \t]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/gm)) {
      const tree = fromHtml(renderMermaid(match[1]), { fragment: true });
      expect(selectAll('svg.pele', tree), path).toHaveLength(1);
      count++;
    }
  }
  expect(count).toBeGreaterThan(100);
});

test('renders custom Aspire icons and rejects unknown named icons', () => {
  const svg = renderMermaid('architecture-beta\n service app(aspire:blazor)[App]');
  expect(svg).toContain('#702af7');
  expect(svg).toContain('2000 1808');
  expect(() => renderMermaid('architecture-beta\n service app(aspire:missing)[App]')).toThrow('Unknown Mermaid icon');
});

test('keeps architecture boxes while enlarging icons and layout together', () => {
  const tree = fromHtml(renderMermaid('architecture-beta\n service api(logos:dotnet)[api]'), {
    fragment: true,
  });
  const box = selectAll('.pele-service > rect', tree)[0];
  const icon = selectAll('.pele-service > svg.pele-icon', tree)[0];
  expect(box.properties.width).toBe('120');
  expect(box.properties.height).toBe('120');
  expect(icon.properties.width).toBe('60');
  expect(icon.properties.height).toBe('60');
});

test('gives repeated diagrams distinct SVG and accessibility IDs', () => {
  const source = 'flowchart LR\n accTitle: Example flow\n accDescr: First connects to second\n A[First] --> B[Second]';
  const ids = (svg: string) => [...svg.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const first = ids(renderMermaid(source));
  const second = ids(renderMermaid(source));
  expect(first.length).toBeGreaterThan(0);
  expect(first.filter((id) => second.includes(id))).toEqual([]);
});

test('renders generic API inheritance with interfaces', () => {
  const svg = renderMermaid('classDiagram\n direction TB\n class ResourceBuilder~T~ {\n }\n class IResourceBuilder~T~ {\n <<interface>>\n }\n IResourceBuilder~T~ <|.. ResourceBuilder~T~');
  expect(svg).toContain('pele-class');
  expect(svg).toContain('ResourceBuilder');
});

test('the prototype has no browser-side renderer or icon fetching', () => {
  const head = readFileSync(new URL('../../src/components/starlight/Head.astro', import.meta.url), 'utf8');
  expect(head).not.toContain("import '@scripts/mermaid'");
  const css = readFileSync(new URL('../../src/styles/mermaid.css', import.meta.url), 'utf8');
  expect(css).toContain('--pele-fg: var(--sl-color-text)');
  expect(css).toContain('--pele-surface: var(--aspire-mermaid-node');
});
