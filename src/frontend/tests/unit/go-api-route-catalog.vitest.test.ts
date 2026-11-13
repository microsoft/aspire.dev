import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import type { GoApiDocument } from '@utils/go-modules';
import { getGoHandleMethod, getGoItem, getGoModuleDocument } from '@utils/go-modules';
import {
  getGoItemSlug,
  getGoMethods,
  getGoMethodSlug,
  getGoTopLevelRouteItems,
  prepareGoApiRoutes,
} from '@utils/go-api-routes';
import { renderGoItemMarkdown, renderGoModuleMarkdown } from '@utils/go-api-markdown';
import { getStaticPaths as modulePaths } from '../../src/pages/reference/api/go/[module].md';
import { getStaticPaths as itemPaths } from '../../src/pages/reference/api/go/[module]/[item].md';
import { getStaticPaths as memberPaths } from '../../src/pages/reference/api/go/[module]/[item]/[member].md';
import { renderComponent } from './astro-test-utils';

vi.mock('@astrojs/starlight/components/StarlightPage.astro', async () => {
  const { createComponent, render, renderSlot } = await import('astro/runtime/server/index.js');
  return {
    default: createComponent((result, _props, slots: { default: Parameters<typeof renderSlot>[1] }) =>
      render`${renderSlot(result, slots.default)}`
    ),
  };
});
vi.mock('virtual:uno.css', () => ({}));

type HtmlRouteModule<T> = {
  default: Parameters<typeof renderComponent>[0];
  getStaticPaths: T;
};

async function htmlRouteModules() {
  return Promise.all([
    vi.importActual<HtmlRouteModule<typeof modulePaths>>('../../src/pages/reference/api/go/[module]/index.astro'),
    vi.importActual<HtmlRouteModule<typeof itemPaths>>('../../src/pages/reference/api/go/[module]/[item]/index.astro'),
    vi.importActual<HtmlRouteModule<typeof memberPaths>>('../../src/pages/reference/api/go/[module]/[item]/[member]/index.astro'),
  ]);
}

vi.mock('astro:content', () => {
  let entries: Array<{ id: string; data: GoApiDocument }>;
  return {
    getCollection: () => {
      const directory = fileURLToPath(new URL('../../src/data/go-modules/', import.meta.url));
      entries ??= readdirSync(directory).filter((name) => name.endsWith('.json')).sort().map((file) => {
        const data = JSON.parse(readFileSync(join(directory, file), 'utf8')) as GoApiDocument;
        prepareGoApiRoutes(data);
        return { id: file, data };
      });
      return Promise.resolve(entries);
    },
  };
});

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

test('every route path is unique across the whole catalog, including a case-insensitive check', async () => {
  const modules = await modulePaths();
  const items = await itemPaths();
  const members = await memberPaths();
  const moduleRoutes = modules.map(({ params }) => params.module);
  const itemRoutes = items.map(({ params }) => `${params.module}/${params.item}`);
  const memberRoutes = members.map(({ params }) => `${params.module}/${params.item}/${params.member}`);

  expect(moduleRoutes.length).toBeGreaterThan(0);
  expect(itemRoutes.length).toBeGreaterThan(0);
  expect(duplicates(moduleRoutes)).toEqual([]);
  expect(duplicates(itemRoutes)).toEqual([]);
  expect(duplicates(memberRoutes)).toEqual([]);

  const routePaths = [
    '/reference/api/go/',
    ...moduleRoutes.map((route) => `/reference/api/go/${route}/`),
    ...itemRoutes.map((route) => `/reference/api/go/${route}/`),
    ...memberRoutes.map((route) => `/reference/api/go/${route}/`),
  ];
  expect(duplicates(routePaths)).toEqual([]);
  expect(duplicates(routePaths.map((route) => route.toLowerCase()))).toEqual([]);

  // Every route segment must be a usable, already-slugified path segment.
  for (const route of [...moduleRoutes, ...itemRoutes, ...memberRoutes]) {
    expect(route.split('/').every((segment) => /^[a-z0-9][a-z0-9.-]*$/.test(segment)), route).toBe(true);
  }

  console.info(
    `Go route catalog: ${moduleRoutes.length} modules, ${itemRoutes.length} item routes, ${memberRoutes.length} member routes ` +
      `(${routePaths.length} HTML pages including the index, each with a .md twin).`
  );
});

test('item and member routes match the slug indexes for every module', async () => {
  const modules = await modulePaths();
  const items = await itemPaths();
  const members = await memberPaths();
  const itemRoutes = new Set(items.map(({ params }) => `${params.module}/${params.item}`));
  const memberRoutes = new Set(members.map(({ params }) => `${params.module}/${params.item}/${params.member}`));
  const expectedItems = new Set<string>();
  const expectedMembers = new Set<string>();

  for (const { props } of modules) {
    const doc = await getGoModuleDocument(props.packageName);
    const module = doc.package.name.toLowerCase();
    const topLevel = getGoTopLevelRouteItems(doc);
    for (const item of topLevel) {
      expectedItems.add(`${module}/${getGoItemSlug(item, topLevel)}`);
    }
    for (const handle of doc.handleTypes ?? []) {
      const itemSlug = getGoItemSlug(handle, topLevel);
      const methods = getGoMethods(handle);
      for (const method of methods) {
        expectedMembers.add(`${module}/${itemSlug}/${getGoMethodSlug(method, methods, handle.name)}`);
      }
    }
  }

  expect([...expectedItems].filter((route) => !itemRoutes.has(route))).toEqual([]);
  expect([...itemRoutes].filter((route) => !expectedItems.has(route))).toEqual([]);
  expect([...expectedMembers].filter((route) => !memberRoutes.has(route))).toEqual([]);
  expect([...memberRoutes].filter((route) => !expectedMembers.has(route))).toEqual([]);

  for (const { params, props } of items) {
    const doc = await getGoModuleDocument(props.packageName);
    const item = getGoItem(doc, props.itemKind, props.itemIndex);
    expect(getGoItemSlug(item, getGoTopLevelRouteItems(doc))).toBe(params.item);
  }
  for (const { params, props } of members) {
    const doc = await getGoModuleDocument(props.packageName);
    const { parentType, method } = getGoHandleMethod(doc, props.handleIndex, props.methodIndex);
    expect(getGoItemSlug(parentType, getGoTopLevelRouteItems(doc))).toBe(params.item);
    expect(getGoMethodSlug(method, getGoMethods(parentType), parentType.name)).toBe(params.member);
  }
});

test('HTML and Markdown routes share compact props and stay below the discovery payload budget', async () => {
  const [moduleHtml, itemHtml, memberHtml] = await htmlRouteModules();
  const markdown = [await modulePaths(), await itemPaths(), await memberPaths()];
  const html = [await moduleHtml.getStaticPaths(), await itemHtml.getStaticPaths(), await memberHtml.getStaticPaths()];
  expect(html).toEqual(markdown);

  const paths = [...markdown.flat(), ...html.flat()];
  for (const { props } of paths) {
    expect(Object.values(props).every((value) => typeof value === 'string' || typeof value === 'number')).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(props))).toBeLessThan(512);
  }
  // Both route families must fit comfortably in a single prerender worker message.
  expect(Buffer.byteLength(JSON.stringify(paths))).toBeLessThan(2 * 1024 * 1024);
});

test('compact props render module, all item kinds, and member HTML', async () => {
  const [moduleHtml, itemHtml, memberHtml] = await htmlRouteModules();
  const module = (await modulePaths()).find(({ params }) => params.module === 'aspire.hosting.redis')!;
  expect(await renderComponent(moduleHtml.default, { props: module.props })).toContain('Aspire.Hosting.Redis');

  const items = await itemPaths();
  for (const kind of ['handle', 'dto', 'enum', 'function'] as const) {
    const route = items.find(({ props }) => props.itemKind === kind)!;
    expect(route, `Expected a ${kind} item route`).toBeDefined();
    const doc = await getGoModuleDocument(route.props.packageName);
    const item = getGoItem(doc, kind, route.props.itemIndex);
    const html = await renderComponent(itemHtml.default, { props: { ...route.props } });
    expect(html.replace(/<wbr\s*\/?>/g, '')).toContain(item.name);
  }

  const member = (await memberPaths()).find(({ params }) =>
    params.module === 'aspire.hosting.redis' && params.item === 'redisresource' && params.member === 'withmodule'
  )!;
  const html = await renderComponent(memberHtml.default, { props: { ...member.props } });
  expect(html.replace(/<wbr\s*\/?>/g, '')).toContain('WithModule');
});

test('stable anchors resolve to their documented routes', async () => {
  const items = await itemPaths();
  const members = await memberPaths();
  const itemRoutes = new Set(items.map(({ params }) => `${params.module}/${params.item}`));
  const memberRoutes = new Set(members.map(({ params }) => `${params.module}/${params.item}/${params.member}`));

  expect(itemRoutes.has('aspire.hosting/createbuilder')).toBe(true);
  expect(itemRoutes.has('aspire.hosting.redis/addredis')).toBe(true);
  expect(itemRoutes.has('aspire.hosting.redis/redisresource')).toBe(true);
  expect(memberRoutes.has('aspire.hosting.redis/redisresource/withmodule')).toBe(true);

  const createBuilder = items.find(({ params }) => params.module === 'aspire.hosting' && params.item === 'createbuilder');
  expect(createBuilder?.props.itemKind).toBe('function');
  const redisResource = items.find(({ params }) => params.module === 'aspire.hosting.redis' && params.item === 'redisresource');
  expect(redisResource?.props.itemKind).toBe('handle');
});

test('property accessors and options structs do not get routes of their own', async () => {
  const items = await itemPaths();
  const members = await memberPaths();
  const memberKinds = new Set(await Promise.all(members.map(async ({ props }) => {
    const doc = await getGoModuleDocument(props.packageName);
    return getGoHandleMethod(doc, props.handleIndex, props.methodIndex).method.kind;
  })));
  expect([...memberKinds].filter((kind) => kind !== 'Method' && kind !== 'InstanceMethod')).toEqual([]);

  const itemKinds = new Set(items.map(({ props }) => props.itemKind));
  expect([...itemKinds].filter((kind) => !['handle', 'dto', 'enum', 'function'].includes(kind))).toEqual([]);
});

test('Markdown links retain object identity through display sorting and resolve overloaded methods', () => {
  const doc: GoApiDocument = {
    package: { name: 'Test', importPath: 'apphost/modules/aspire' },
    handleTypes: [
      { name: 'Thing', capabilities: [
        { name: 'Run', kind: 'Method', receiver: 'Thing', parameters: [], signature: 'Run() Thing' },
        { name: 'Run', kind: 'Method', receiver: 'Thing', parameters: [], signature: 'Run() Thing' },
        { name: '!!!', kind: 'Method', receiver: 'Thing', parameters: [] },
        { name: '???', kind: 'Method', receiver: 'Thing', parameters: [] },
      ] },
      { name: 'Thing', capabilities: [] },
    ],
  };
  prepareGoApiRoutes(doc);
  const markdown = renderGoModuleMarkdown(doc, '/base');
  expect(markdown).toContain('/base/reference/api/go/test/thing-thing.md');
  expect(markdown).toContain('/base/reference/api/go/test/thing-thing-2.md');
  const handle = doc.handleTypes![0];
  expect(getGoItem(doc, 'handle', 0)).toBe(handle);
  expect(getGoItem(doc, 'handle', 1)).toBe(doc.handleTypes![1]);
  expect(getGoHandleMethod(doc, 0, 0).method).toBe(handle.capabilities![0]);
  expect(getGoHandleMethod(doc, 0, 1).method).toBe(handle.capabilities![1]);
  const detail = renderGoItemMarkdown(doc, handle, 'handle', '/base');
  expect(detail).toContain('/base/reference/api/go/test/thing-thing/run-thing-noargs.md');
  expect(detail).toContain('/base/reference/api/go/test/thing-thing/run-thing-noargs-2.md');
  expect(detail).toContain('/base/reference/api/go/test/thing-thing/-thing-noargs.md');
});
