import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import type { GoApiDocument } from '@utils/go-modules';
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

vi.mock('astro:content', () => ({
  getCollection: () => {
    const directory = fileURLToPath(new URL('../../src/data/go-modules/', import.meta.url));
    return Promise.resolve(readdirSync(directory).filter((name) => name.endsWith('.json')).sort().map((file) => {
      const data = JSON.parse(readFileSync(join(directory, file), 'utf8')) as GoApiDocument;
      prepareGoApiRoutes(data);
      return { id: file, data };
    }));
  },
}));

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
    const doc = props.pkg;
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
  const memberKinds = new Set(members.map(({ props }) => props.method.kind));
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
  const detail = renderGoItemMarkdown(doc, handle, 'handle', '/base');
  expect(detail).toContain('/base/reference/api/go/test/thing-thing/run-thing-noargs.md');
  expect(detail).toContain('/base/reference/api/go/test/thing-thing/run-thing-noargs-2.md');
  expect(detail).toContain('/base/reference/api/go/test/thing-thing/-thing-noargs.md');
});
