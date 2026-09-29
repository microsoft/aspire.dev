import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { expect, test, vi } from 'vitest';
import type { TsApiDocument, TsFunction } from '@utils/ts-modules';
import { formatTsSignature } from '@utils/ts-modules';
import { getTsItemSlug, getTsMethods, getTsMethodSlug, getTsTopLevelRouteItems, prepareTsApiRoutes, tsSlugify } from '@utils/ts-api-routes';
import { renderTypeScriptItemMarkdown, renderTypeScriptModuleMarkdown } from '@utils/typescript-api-markdown';
import { getStaticPaths as itemPaths } from '../../src/pages/reference/api/typescript/[module]/[item].md';
import { getStaticPaths as memberPaths } from '../../src/pages/reference/api/typescript/[module]/[item]/[member].md';
import { referenceSlug } from './ts-api-routes-reference';

vi.mock('astro:content', () => ({
  getCollection: () => {
    const directory = fileURLToPath(new URL('../../src/data/ts-modules/', import.meta.url));
    return Promise.resolve(readdirSync(directory).filter((name) => name.endsWith('.json')).sort().map((file) => {
      const data = JSON.parse(readFileSync(join(directory, file), 'utf8')) as TsApiDocument;
      prepareTsApiRoutes(data);
      return { id: file, data };
    }));
  },
}));

test('every catalog HTML item/member path has a Markdown peer and legacy exports remain available', async () => {
  const items = await itemPaths();
  const members = await memberPaths();
  const itemUrls = new Set(items.map(({ params }) => `${params.module}/${params.item}`));
  const memberUrls = new Set(members.map(({ params }) => `${params.module}/${params.item}/${params.member}`));
  const itemProps = new Map(items.map(({ params, props }) => [`${params.module}/${params.item}`, props.item]));
  const memberProps = new Map(members.map(({ params, props }) => [`${params.module}/${params.item}/${params.member}`, props.method]));
  const docs = new Map(items.map(({ props }) => [props.pkg.package.name, props.pkg]));
  const memberDocs = new Map(members.map(({ props }) => [props.pkg.package.name, props.pkg]));
  let canonicalCount = 0;
  let legacyCount = 0;
  const legacyMismatches: string[] = [];
  for (const [moduleName, doc] of docs) {
    const module = moduleName.toLowerCase();
    const topLevel = getTsTopLevelRouteItems(doc);
    const legacyItems = new Map<string, (typeof topLevel)[number]>();
    const legacyMembers = new Map<string, TsFunction>();
    for (const item of topLevel) {
      const slug = getTsItemSlug(item, topLevel);
      if (slug) {
        expect(itemUrls.has(`${module}/${slug}`)).toBe(true);
        canonicalCount++;
      }
      if (tsSlugify(item.name)) {
        expect(itemUrls.has(`${module}/${tsSlugify(item.name)}`)).toBe(true);
        legacyItems.set(`${module}/${tsSlugify(item.name)}`, item);
        legacyCount++;
      }
    }
    const memberDoc = memberDocs.get(moduleName);
    const memberItems = memberDoc ? getTsTopLevelRouteItems(memberDoc) : [];
    for (const handle of memberDoc?.handleTypes ?? []) {
      const item = getTsItemSlug(handle, memberItems);
      const methods = getTsMethods(handle);
      for (const method of methods) {
        const member = getTsMethodSlug(method, methods, handle.name);
        if (item && member) {
          expect(memberUrls.has(`${module}/${item}/${member}`)).toBe(true);
          canonicalCount++;
        }
        const oldItem = tsSlugify(handle.name);
        const oldMember = tsSlugify(method.name);
        if (oldItem && oldMember) {
          expect(memberUrls.has(`${module}/${oldItem}/${oldMember}`)).toBe(true);
          legacyMembers.set(`${module}/${oldItem}/${oldMember}`, method);
          legacyCount++;
        }
      }
      // Astro's keyed static-path cache resolves duplicate paths to the last entry.
      for (const [url, item] of legacyItems) {
        if (itemProps.get(url) !== item) legacyMismatches.push(url);
      }
      for (const [url, method] of legacyMembers) {
        if (memberProps.get(url) !== method) legacyMismatches.push(url);
      }
    }
    expect(legacyMismatches).toEqual([]);
  }
  expect(canonicalCount).toBeGreaterThan(19000);
  expect(legacyCount).toBeGreaterThan(19000);
  console.info(`TS Markdown parity: ${canonicalCount} canonical routes, ${legacyCount} legacy occurrences; ${itemUrls.size + memberUrls.size} distinct exports.`);
});

test('Markdown links retain object identity through display sorting and resolve overloaded methods', () => {
  const doc: TsApiDocument = {
    package: { name: 'Test' },
    handleTypes: [
      { name: 'Thing', capabilities: [
        { name: 'run', kind: 'Method', parameters: [] },
        { name: 'run', kind: 'Method', parameters: [] },
        { name: '!!!', kind: 'Method', parameters: [] },
        { name: '???', kind: 'Method', parameters: [] },
      ] },
      { name: 'Thing', capabilities: [] },
    ],
  };
  prepareTsApiRoutes(doc);
  const markdown = renderTypeScriptModuleMarkdown(doc, '/base');
  expect(markdown).toContain('/base/reference/api/typescript/test/thing-thing.md');
  expect(markdown).toContain('/base/reference/api/typescript/test/thing-thing-2.md');
  const handle = doc.handleTypes![0];
  const detail = renderTypeScriptItemMarkdown(doc, handle, 'handle', '/base');
  expect(detail).toContain('/base/reference/api/typescript/test/thing-thing/run-thing-noargs.md');
  expect(detail).toContain('/base/reference/api/typescript/test/thing-thing/run-thing-noargs-2.md');
  expect(detail).toContain('/base/reference/api/typescript/test/thing-thing/-thing-noargs.md');
});

test.runIf(process.env.TS_API_ROUTE_BENCHMARK === '1')('isolated catalog slug and signature microbenchmark (no build)', () => {
  const directory = fileURLToPath(new URL('../../src/data/ts-modules/', import.meta.url));
  const docs = readdirSync(directory).filter((name) => name.endsWith('.json')).sort()
    .map((file) => JSON.parse(readFileSync(join(directory, file), 'utf8')) as TsApiDocument);
  const measure = (action: () => void) => {
    const start = performance.now();
    action();
    return Math.round((performance.now() - start) * 100) / 100;
  };
  let checksum = 0;
  const oldMs = measure(() => {
    for (const doc of docs) {
      const items = getTsTopLevelRouteItems(doc);
      for (const item of items) checksum += referenceSlug(item, items).length;
      for (const handle of doc.handleTypes ?? []) {
        const methods = getTsMethods(handle);
        for (const method of methods) checksum += referenceSlug(method, methods, { parentName: handle.name }).length;
      }
    }
  });
  const prepareMs = measure(() => docs.forEach(prepareTsApiRoutes));
  const resolve = () => {
    for (const doc of docs) {
      const items = getTsTopLevelRouteItems(doc);
      for (const item of items) checksum += getTsItemSlug(item, items).length;
      for (const handle of doc.handleTypes ?? []) {
        const methods = getTsMethods(handle);
        for (const method of methods) checksum += getTsMethodSlug(method, methods, handle.name).length;
      }
    }
  };
  const coldMs = measure(resolve);
  const warmMs = measure(resolve);
  let signatureCount = 0;
  const signaturesMs = measure(() => {
    for (const doc of docs) {
      for (const handle of doc.handleTypes ?? []) {
        for (const method of getTsMethods(handle)) {
          const parameters = (method.parameters ?? []).map((parameter) =>
            `${parameter.name}${parameter.isOptional ? '?' : ''}: ${parameter.isCallback && parameter.callbackSignature ? parameter.callbackSignature : parameter.type}`
          );
          checksum += formatTsSignature(`${method.name}(${parameters.join(', ')}): ${method.returnType};`).length;
          signatureCount++;
        }
      }
    }
  });
  expect(checksum).toBeGreaterThan(0);
  console.info(JSON.stringify({ benchmark: 'ts-api-routes-no-build', oldMs, prepareMs, coldMs, warmMs, signaturesMs, signatureCount }));
});
