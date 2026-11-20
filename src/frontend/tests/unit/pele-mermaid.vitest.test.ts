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
  expect(count).toBeGreaterThan(0);
});

test('renders custom Aspire icons and rejects unknown named icons', () => {
  const svg = renderMermaid('architecture-beta\n service app(aspire:blazor)[App]');
  const tree = fromHtml(svg, { fragment: true });
  expect(selectAll('svg[data-icon="aspire:blazor"] svg path', tree).length).toBeGreaterThan(0);
  expect(() => renderMermaid('architecture-beta\n service app(aspire:missing)[App]')).toThrow('Unknown Mermaid icon');
});

test('preserves logo fills without inheriting diagram strokes', () => {
  const tree = fromHtml(renderMermaid(`architecture-beta
    service redis(logos:redis)[Redis]
    service openai(logos:openai-icon)[OpenAI]
    redis:R --> L:openai`), { fragment: true });
  for (const name of ['logos:redis', 'logos:openai-icon']) {
    const [icon] = selectAll(`svg[data-icon="${name}"] > svg`, tree);
    expect(icon.properties.fill).toBe('currentColor');
    expect(icon.properties.stroke).toBe('none');
  }
  expect(selectAll('svg[data-icon="logos:redis"] path[fill]', tree).length).toBeGreaterThan(0);
});

test('embeds existing local logos with contained light and dark artwork', () => {
  const tree = fromHtml(renderMermaid(`architecture-beta
    service vault(aspire:azure-key-vault)[Key Vault]
    service mail(aspire:mailpit)[Mailpit]`), { fragment: true });
  const [vault] = selectAll('svg[data-icon="aspire:azure-key-vault"] image', tree);
  expect(vault.properties.href).toMatch(/^data:image\/png;base64,/);
  const variants = selectAll('svg[data-icon="aspire:mailpit"] image', tree);
  expect(variants.map((image) => image.properties.dataTheme)).toEqual(['light', 'dark']);
  expect(variants[0].properties.href).not.toBe(variants[1].properties.href);
  for (const image of [vault, ...variants]) {
    expect(image.properties.preserveAspectRatio).toBe('xMidYMid meet');
    const data = String(image.properties.href).split(',')[1];
    expect(Buffer.from(data, 'base64').length).toBeGreaterThan(0);
  }
});

test('renders flowchart icons while retaining labeled and optional connections', () => {
  const tree = fromHtml(renderMermaid(`flowchart LR
    App@{ icon: "iconoir:code", form: "square", label: "Consuming app" }
    Cache@{ icon: "logos:redis", form: "square", label: "Redis" }
    App -. Optional cache .-> Cache`), { fragment: true });
  expect(selectAll('svg[data-icon="logos:redis"] path', tree).length).toBeGreaterThan(0);
  expect(selectAll('.pele-edge-label', tree).length).toBeGreaterThan(0);
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
