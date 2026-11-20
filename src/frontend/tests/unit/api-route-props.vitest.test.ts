import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, vi } from 'vitest';
import { renderComponent } from './astro-test-utils';

type Route = {
  params: Record<string, string>;
  props: Record<string, string | number>;
};
type RouteModule = { getStaticPaths: () => Promise<Route[]> };
type HtmlRouteModule = RouteModule & { default: Parameters<typeof renderComponent>[0] };

// Exercise the real page bodies without loading the site-wide layout or generated styles.
vi.mock('@astrojs/starlight/components/StarlightPage.astro', async () => {
  const { createComponent, render, renderSlot } = await import('astro/runtime/server/index.js');
  return {
    default: createComponent((result, _props, slots: { default: Parameters<typeof renderSlot>[1] }) =>
      render`${renderSlot(result, slots.default)}`
    ),
  };
});
vi.mock('virtual:uno.css', () => ({}));
vi.mock('astro:content', () => {
  type Entry = { id: string; data: unknown };
  const collections = new Map<string, Entry[]>();
  const directories: Record<string, string> = { packages: 'pkgs', tsModules: 'ts-modules', goModules: 'go-modules' };
  return {
    getCollection: (name: string, filter?: (entry: Entry) => boolean) => {
      if (name === 'i18n') return Promise.resolve([]);
      if (!Object.hasOwn(directories, name)) throw new Error(`Unexpected collection: ${name}`);
      if (!collections.has(name)) {
        const directory = fileURLToPath(new URL(`../../src/data/${directories[name]}/`, import.meta.url));
        collections.set(name, readdirSync(directory).filter((file) => file.endsWith('.json')).sort().map((file) => ({
          id: file,
          data: JSON.parse(readFileSync(join(directory, file), 'utf8')) as unknown,
        })));
      }
      const entries = collections.get(name)!;
      return Promise.resolve(filter ? entries.filter(filter) : entries);
    },
  };
});

const markdown = import.meta.glob<RouteModule>('../../src/pages/reference/api/**/*.md.ts');
const html = import.meta.glob<HtmlRouteModule>('../../src/pages/reference/api/**/*.astro');
const budgets = { csharp: 4, typescript: 16, go: 2 } as const;

function routeKey(route: Route): string {
  return Object.entries(route.params).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`).join('/');
}

for (const language of ['csharp', 'typescript', 'go'] as const) {
  test(`${language} HTML and Markdown discovery props are compact and preserve canonical parity`, async () => {
    let bytes = 0;
    let routeCount = 0;
    const files = Object.keys(html).filter((file) => file.includes(`/api/${language}/`) && file.includes('['));
    expect(files).toHaveLength(3);
    for (const file of files) {
      const markdownFile = file.replace(/\/index\.astro$/, '.md.ts').replace(/\.astro$/, '.md.ts');
      const [htmlModule, markdownModule] = await Promise.all([html[file](), markdown[markdownFile]()]);
      const [htmlPaths, markdownPaths] = await Promise.all([
        htmlModule.getStaticPaths(), markdownModule.getStaticPaths(),
      ]);
      const markdownByKey = new Map(markdownPaths.map((route) => [routeKey(route), route]));
      for (const route of htmlPaths) {
        expect(markdownByKey.get(routeKey(route)), `${file}: ${routeKey(route)}`).toEqual(route);
      }
      for (const route of [...htmlPaths, ...markdownPaths]) {
        // Identifiers must survive a worker transfer without carrying any nested API data.
        const props = structuredClone(route.props);
        expect(Object.values(props).every((value) =>
          typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value))
        )).toBe(true);
        expect(Buffer.byteLength(JSON.stringify(props))).toBeLessThan(512);
      }
      bytes += Buffer.byteLength(JSON.stringify([htmlPaths, markdownPaths]));
      routeCount += htmlPaths.length + markdownPaths.length;
    }
    expect(routeCount).toBeGreaterThan(1000);
    expect(bytes).toBeLessThan(budgets[language] * 1024 * 1024);
    console.info(`${language} discovery: ${routeCount} routes, ${bytes} JSON bytes`);
  });

  test(`${language} HTML pages render from transferred identifier-only props`, async () => {
    for (const file of Object.keys(html).filter((file) => file.includes(`/api/${language}/`) && file.includes('['))) {
      const module = await html[file]();
      const routes = await module.getStaticPaths();
      const samples = file.includes('[item]/index.astro')
        ? ['handle', 'dto', 'enum', 'function'].map((kind) => routes.find(({ props }) => props.itemKind === kind)!)
        : [routes[0]];
      for (const route of samples) {
        expect(route, `Expected a sample for ${file}`).toBeDefined();
        const page = await renderComponent(module.default, { props: structuredClone(route.props) });
        expect(page.replace(/<wbr\s*\/?>/g, '')).toContain(route.props.packageName);
      }
    }
  });
}
