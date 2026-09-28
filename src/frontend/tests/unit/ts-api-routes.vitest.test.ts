import { expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { TsApiDocument } from '@utils/ts-modules';
import type { TsRouteCallableLike } from '@utils/ts-api-routes';
import { referenceSlug } from './ts-api-routes-reference';

import {
  getTsItemSlug,
  getTsMethodSlug,
  getTsMethods,
  getTsMemberAnchor,
  getTsStandaloneFunctions,
  getTsTopLevelRouteItems,
  getTsTypeByName,
  prepareTsApiRoutes,
} from '../../src/utils/ts-api-routes';

test('getTsItemSlug keeps unique names unchanged', () => {
  const doc = {
    handleTypes: [{ name: 'ContainerResource' }],
    functions: [{ name: 'AddRedis', qualifiedName: 'addRedis' }],
  };

  const items = getTsTopLevelRouteItems(doc);
  expect(getTsItemSlug(items[0], items)).toBe('containerresource');
});

test('indexes preserve collisions, missing identity, repeated references and parent contexts', () => {
  const repeated = { name: 'Run!', kind: 'Method', parameters: [{ type: 'Assembly/Thing?' }] };
  const capabilities: TsRouteCallableLike[] = [
    repeated,
    { ...repeated, name: 'run?' },
    repeated,
    { ...repeated },
    { name: 'run', kind: 'InstanceMethod', parameters: [{ isCallback: true, callbackSignature: '(a: A) => B' }] },
    { name: 'run', kind: 'Method', parameters: [{ type: 'Assembly/Generic`1[[Thing, Version=1]]' }] },
    { name: 'run', kind: 'Method', parameters: [] },
    { name: '!!!', kind: 'Method', parameters: [] },
    { name: '???', kind: 'Method', parameters: [] },
  ];
  const doc = {
    handleTypes: [{ name: 'Parent', capabilities }],
    dtoTypes: [{ name: 'same?', fullName: 'A/Same' }, { name: 'SAME!', fullName: 'B/Same' }],
    functions: capabilities,
  };
  prepareTsApiRoutes(doc);
  const items = getTsTopLevelRouteItems(doc);
  for (const item of [...items, { ...items[1] }, { name: 'unknown' }]) {
    expect(getTsItemSlug(item, items)).toBe(referenceSlug(item, items));
  }
  for (const sorted of [false, true]) {
    const methods = getTsMethods(doc.handleTypes[0], sorted);
    for (const parentName of [undefined, '', 'Parent', 'Other Parent', '???']) {
      for (const method of [...methods, { ...methods[0] }, { name: 'outside' }]) {
        expect(getTsMethodSlug(method, methods, parentName)).toBe(referenceSlug(method, methods, { parentName }));
      }
    }
  }
  expect(getTsMethodSlug(capabilities[3], getTsMethods(doc.handleTypes[0]), 'Parent')).toBe('run-parent-thing-4');
});

test('mutable development inputs are never cached, including nested edits and reordering', () => {
  const doc = {
    handleTypes: [{ name: 'Parent', capabilities: [
      { name: 'run', kind: 'Method', parameters: [{ type: 'string' }] },
      { name: 'run', kind: 'Method', parameters: [{ type: 'string' }] },
    ] }],
    functions: [{ name: 'fn', qualifiedName: 'fn' }],
  };
  const handle = doc.handleTypes[0];
  const check = () => {
    const items = getTsTopLevelRouteItems(doc);
    for (const item of items) expect(getTsItemSlug(item, items)).toBe(referenceSlug(item, items));
    const methods = getTsMethods(handle);
    for (const method of methods) expect(getTsMethodSlug(method, methods, handle.name))
      .toBe(referenceSlug(method, methods, { parentName: handle.name }));
  };
  check();
  handle.capabilities.reverse();
  handle.capabilities[0].parameters[0].type = 'number';
  handle.name = 'Renamed';
  doc.functions[0].qualifiedName = 'Container.fn';
  doc.functions.push({ name: 'Renamed', qualifiedName: 'renamed' });
  check();
  expect(getTsStandaloneFunctions(doc)).toHaveLength(1);
  expect(getTsTypeByName(doc, 'Parent')).toBeUndefined();
  expect(getTsTypeByName(doc, 'Renamed')).toBe(handle);
  const shallowFrozen = Object.freeze({ functions: doc.functions });
  getTsTopLevelRouteItems(shallowFrozen);
  doc.functions[1].name = 'Edited after shallow freeze';
  expect(getTsTopLevelRouteItems(shallowFrozen)[0].name).toBe('Edited after shallow freeze');
});

test('production collections are reused and cannot silently become stale', () => {
  const doc = { handleTypes: [{ name: 'Type', capabilities: [
    { name: 'method', kind: 'Method', parameters: [{ type: 'string' }] },
  ] }], functions: [{ name: 'fn' }] };
  prepareTsApiRoutes(doc);
  prepareTsApiRoutes(doc);
  expect(getTsTopLevelRouteItems(doc)).toBe(getTsTopLevelRouteItems(doc));
  expect(getTsStandaloneFunctions(doc)).toBe(getTsStandaloneFunctions(doc));
  expect(getTsMethods(doc.handleTypes[0])).toBe(getTsMethods(doc.handleTypes[0]));
  expect(getTsMethods(doc.handleTypes[0], true)).toBe(getTsMethods(doc.handleTypes[0], true));
  expect(() => doc.handleTypes[0].capabilities[0].parameters[0].type = 'number').toThrow();
  expect(() => getTsTopLevelRouteItems(doc).reverse()).toThrow();
  expect(() => getTsMethods(doc.handleTypes[0]).push({ name: 'new', kind: 'Method', parameters: [] })).toThrow();
  const replacement = structuredClone(doc);
  replacement.handleTypes[0].name = 'New';
  prepareTsApiRoutes(replacement);
  expect(getTsTopLevelRouteItems(replacement)).not.toBe(getTsTopLevelRouteItems(doc));
  expect(getTsItemSlug(replacement.handleTypes[0], getTsTopLevelRouteItems(replacement))).toBe('new');
  const mutableWrapper = { capabilities: doc.handleTypes[0].capabilities };
  expect(getTsMethods(mutableWrapper)).toBe(getTsMethods(doc.handleTypes[0]));
  mutableWrapper.capabilities = [{ name: 'replacement', kind: 'Method', parameters: [] }];
  expect(getTsMethods(mutableWrapper).map((method) => method.name)).toEqual(['replacement']);
});

test('whole catalog URLs and sorted heading anchors match the pre-indexing implementation', () => {
  const directory = fileURLToPath(new URL('../../src/data/ts-modules/', import.meta.url));
  let routes = 0;
  let anchors = 0;
  let modules = 0;
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.json')).sort()) {
    modules++;
    const doc = JSON.parse(readFileSync(join(directory, file), 'utf8')) as TsApiDocument;
    prepareTsApiRoutes(doc);
    const items = getTsTopLevelRouteItems(doc);
    expect(items).toEqual([
      ...(doc.handleTypes ?? []), ...(doc.dtoTypes ?? []), ...(doc.enumTypes ?? []),
      ...(doc.functions ?? []).filter((fn) => !fn.qualifiedName || !fn.qualifiedName.includes('.')),
    ]);
    const prefix = `/reference/api/typescript/${doc.package.name.toLowerCase()}/`;
    const expected: string[] = [];
    const actual: string[] = [];
    for (const item of items) {
      expected.push(`${prefix}${referenceSlug(item, items)}/`);
      actual.push(`${prefix}${getTsItemSlug(item, items)}/`);
      routes++;
    }
    for (const handle of doc.handleTypes ?? []) {
      const expectedItem = referenceSlug(handle, items);
      const actualItem = getTsItemSlug(handle, items);
      for (const sorted of [false, true]) {
        const methods = getTsMethods(handle, sorted);
        for (const method of methods) {
          const reference = referenceSlug(method, methods, { parentName: handle.name });
          const indexed = getTsMethodSlug(method, methods, handle.name);
          expected.push(`${prefix}${expectedItem}/${sorted ? '#' : ''}${reference}${sorted ? '' : '/'}`);
          actual.push(`${prefix}${actualItem}/${sorted ? '#' : ''}${indexed}${sorted ? '' : '/'}`);
          if (sorted) anchors++;
          else routes++;
        }
      }
      for (const property of (handle.capabilities ?? []).filter((member) => member.kind?.startsWith('Property'))) {
        expect(getTsMemberAnchor(property.name)).toBe(property.name.toLowerCase().replace(/[^a-z0-9]/g, '-'));
        anchors++;
      }
    }
    expect(actual, file).toEqual(expected);
  }
  expect(routes).toBeGreaterThan(19000);
  console.info(`TS catalog equivalence: ${routes} item/member routes and ${anchors} anchors (${routes + modules + 1} HTML pages including module/index pages).`);
});

test('route name work grows linearly and repeat lookups do not rescan siblings', () => {
  for (const size of [100, 1000, 4000]) {
    let reads = 0;
    const doc = { dtoTypes: Array.from({ length: size }, (_, i) => ({
      get name() { reads++; return `Type${i}`; },
    })) };
    prepareTsApiRoutes(doc);
    const items = getTsTopLevelRouteItems(doc);
    reads = 0;
    for (let pass = 0; pass < 3; pass++) {
      for (const item of items) getTsItemSlug(item, items);
    }
    expect(reads).toBe(size);
    let oldNormalizations = 0;
    for (const item of items) referenceSlug(item, items, undefined, () => oldNormalizations++);
    expect(oldNormalizations).toBe(size * (size + 1));
    console.info(`TS slug work n=${size}: indexed=${size} name reads (3 passes); old=${oldNormalizations} normalizations (1 pass).`);
  }
});

test('large collision groups are indexed once per method parent context', () => {
  let reads = 0;
  const size = 1000;
  const handle = { name: 'Parent', capabilities: Array.from({ length: size }, () => ({
    get name() { reads++; return 'run'; },
    kind: 'Method',
    parameters: [{ type: 'string' }],
  })) };
  prepareTsApiRoutes({ handleTypes: [handle] });
  const methods = getTsMethods(handle);
  reads = 0;
  for (const parentName of ['Parent', 'Other']) {
    for (let pass = 0; pass < 3; pass++) {
      methods.forEach((method, i) => {
        expect(getTsMethodSlug(method, methods, parentName))
          .toBe(`run-${parentName.toLowerCase()}-string${i > 0 ? `-${i + 1}` : ''}`);
      });
    }
  }
  expect(reads).toBe(size * 2);
});

test('getTsItemSlug disambiguates duplicate standalone functions', () => {
  const doc = {
    functions: [
      {
        name: 'WithHostPort',
        targetTypeId: 'Assembly/Aspire.Hosting.Postgres.PgAdminContainerResource',
        parameters: [{ type: 'System.Int32?' }],
      },
      {
        name: 'WithHostPort',
        targetTypeId: 'Assembly/Aspire.Hosting.Postgres.PgWebContainerResource',
        parameters: [{ type: 'System.Int32?' }],
      },
    ],
  };

  const items = getTsTopLevelRouteItems(doc);
  expect(getTsStandaloneFunctions(doc)).toHaveLength(2);
  expect(getTsItemSlug(items[0], items)).toBe(
    'withhostport-aspire-hosting-postgres-pgadmincontainerresource-system-int32'
  );
  expect(getTsItemSlug(items[1], items)).toBe(
    'withhostport-aspire-hosting-postgres-pgwebcontainerresource-system-int32'
  );
});

test('getTsMethodSlug disambiguates overloads by signature', () => {
  const methods = [
    {
      name: 'PublishAsDockerFile',
      parameters: [],
    },
    {
      name: 'PublishAsDockerFile',
      parameters: [{ type: 'System.Collections.Generic.IEnumerable<Aspire.Hosting.ApplicationModel.DockerBuildArg>?' }],
    },
  ];

  expect(getTsMethodSlug(methods[0], methods, 'ExecutableResourceBuilderExtensions')).toBe(
    'publishasdockerfile-executableresourcebuilderextensions-noargs'
  );
  expect(getTsMethodSlug(methods[1], methods, 'ExecutableResourceBuilderExtensions')).toBe(
    'publishasdockerfile-executableresourcebuilderextensions-system-collections-generic-ienumerable-aspire-hosting-applicationmodel-dockerbuildarg'
  );
});