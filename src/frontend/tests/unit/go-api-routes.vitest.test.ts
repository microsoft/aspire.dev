import { expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { GoApiDocument } from '@utils/go-modules';
import type { GoRouteCallableLike } from '@utils/go-api-routes';
import { referenceSlug } from './go-api-routes-reference';

import {
  getGoItemSlug,
  getGoMethodSlug,
  getGoMethods,
  getGoMemberAnchor,
  getGoStandaloneFunctions,
  getGoTopLevelRouteItems,
  getGoTypeByName,
  goSlugify,
  prepareGoApiRoutes,
} from '../../src/utils/go-api-routes';

test('getGoItemSlug keeps unique names unchanged', () => {
  const doc = {
    handleTypes: [{ name: 'ContainerResource' }],
    functions: [{ name: 'AddRedis', qualifiedName: 'addRedis' }],
  };

  const items = getGoTopLevelRouteItems(doc);
  expect(getGoItemSlug(items[0], items)).toBe('containerresource');
  expect(getGoItemSlug(items[1], items)).toBe('addredis');
});

test('goSlugify lowercases and collapses non-alphanumerics', () => {
  expect(goSlugify('RedisResource')).toBe('redisresource');
  expect(goSlugify('[]*Foo Bar!')).toBe('foo-bar');
  expect(goSlugify('???')).toBe('');
});

test('indexes preserve collisions, missing identity, repeated references and parent contexts', () => {
  const repeated = { name: 'Run!', kind: 'Method', parameters: [{ type: 'Thing' }] };
  const capabilities: GoRouteCallableLike[] = [
    repeated,
    { ...repeated, name: 'run?' },
    repeated,
    { ...repeated },
    { name: 'run', kind: 'InstanceMethod', parameters: [{ isCallback: true, callbackSignature: 'func(a A) B' }] },
    { name: 'run', kind: 'Method', parameters: [{ type: '[]*Thing' }] },
    { name: 'run', kind: 'Method', parameters: [] },
    { name: '!!!', kind: 'Method', parameters: [] },
    { name: '???', kind: 'Method', parameters: [] },
  ];
  const doc = {
    handleTypes: [{ name: 'Parent', capabilities }],
    dtoTypes: [{ name: 'same?', fullName: 'A/Same' }, { name: 'SAME!', fullName: 'B/Same' }],
    functions: capabilities,
  };
  prepareGoApiRoutes(doc);
  const items = getGoTopLevelRouteItems(doc);
  for (const item of [...items, { ...items[1] }, { name: 'unknown' }]) {
    expect(getGoItemSlug(item, items)).toBe(referenceSlug(item, items));
  }
  for (const sorted of [false, true]) {
    const methods = getGoMethods(doc.handleTypes[0], sorted);
    for (const parentName of [undefined, '', 'Parent', 'Other Parent', '???']) {
      for (const method of [...methods, { ...methods[0] }, { name: 'outside' }]) {
        expect(getGoMethodSlug(method, methods, parentName)).toBe(referenceSlug(method, methods, { parentName }));
      }
    }
  }
  expect(getGoMethodSlug(capabilities[3], getGoMethods(doc.handleTypes[0]), 'Parent')).toBe('run-parent-thing-4');
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
    const items = getGoTopLevelRouteItems(doc);
    for (const item of items) expect(getGoItemSlug(item, items)).toBe(referenceSlug(item, items));
    const methods = getGoMethods(handle);
    for (const method of methods) expect(getGoMethodSlug(method, methods, handle.name))
      .toBe(referenceSlug(method, methods, { parentName: handle.name }));
  };
  check();
  handle.capabilities.reverse();
  handle.capabilities[0].parameters[0].type = 'int';
  handle.name = 'Renamed';
  doc.functions[0].qualifiedName = 'Container.fn';
  doc.functions.push({ name: 'Renamed', qualifiedName: 'renamed' });
  check();
  expect(getGoStandaloneFunctions(doc)).toHaveLength(1);
  expect(getGoTypeByName(doc, 'Parent')).toBeUndefined();
  expect(getGoTypeByName(doc, 'Renamed')).toBe(handle);
  const shallowFrozen = Object.freeze({ functions: doc.functions });
  getGoTopLevelRouteItems(shallowFrozen);
  doc.functions[1].name = 'Edited after shallow freeze';
  expect(getGoTopLevelRouteItems(shallowFrozen)[0].name).toBe('Edited after shallow freeze');
});

test('production collections are reused and cannot silently become stale', () => {
  const doc = { handleTypes: [{ name: 'Type', capabilities: [
    { name: 'method', kind: 'Method', parameters: [{ type: 'string' }] },
  ] }], functions: [{ name: 'fn' }] };
  prepareGoApiRoutes(doc);
  prepareGoApiRoutes(doc);
  expect(getGoTopLevelRouteItems(doc)).toBe(getGoTopLevelRouteItems(doc));
  expect(getGoStandaloneFunctions(doc)).toBe(getGoStandaloneFunctions(doc));
  expect(getGoMethods(doc.handleTypes[0])).toBe(getGoMethods(doc.handleTypes[0]));
  expect(getGoMethods(doc.handleTypes[0], true)).toBe(getGoMethods(doc.handleTypes[0], true));
  expect(() => doc.handleTypes[0].capabilities[0].parameters[0].type = 'int').toThrow();
  expect(() => getGoTopLevelRouteItems(doc).reverse()).toThrow();
  expect(() => getGoMethods(doc.handleTypes[0]).push({ name: 'new', kind: 'Method', parameters: [] })).toThrow();
  const replacement = structuredClone(doc);
  replacement.handleTypes[0].name = 'New';
  prepareGoApiRoutes(replacement);
  expect(getGoTopLevelRouteItems(replacement)).not.toBe(getGoTopLevelRouteItems(doc));
  expect(getGoItemSlug(replacement.handleTypes[0], getGoTopLevelRouteItems(replacement))).toBe('new');
  const mutableWrapper = { capabilities: doc.handleTypes[0].capabilities };
  expect(getGoMethods(mutableWrapper)).toBe(getGoMethods(doc.handleTypes[0]));
  mutableWrapper.capabilities = [{ name: 'replacement', kind: 'Method', parameters: [] }];
  expect(getGoMethods(mutableWrapper).map((method) => method.name)).toEqual(['replacement']);
});

test('whole catalog URLs and sorted heading anchors match the pre-indexing implementation', () => {
  const directory = fileURLToPath(new URL('../../src/data/go-modules/', import.meta.url));
  let routes = 0;
  let anchors = 0;
  let modules = 0;
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.json')).sort()) {
    modules++;
    const doc = JSON.parse(readFileSync(join(directory, file), 'utf8')) as GoApiDocument;
    prepareGoApiRoutes(doc);
    const items = getGoTopLevelRouteItems(doc);
    expect(items).toEqual([
      ...(doc.handleTypes ?? []), ...(doc.dtoTypes ?? []), ...(doc.enumTypes ?? []),
      ...(doc.functions ?? []).filter((fn) => !fn.qualifiedName || !fn.qualifiedName.includes('.')),
    ]);
    const prefix = `/reference/api/go/${doc.package.name.toLowerCase()}/`;
    const expected: string[] = [];
    const actual: string[] = [];
    for (const item of items) {
      expected.push(`${prefix}${referenceSlug(item, items)}/`);
      actual.push(`${prefix}${getGoItemSlug(item, items)}/`);
      routes++;
    }
    for (const handle of doc.handleTypes ?? []) {
      const expectedItem = referenceSlug(handle, items);
      const actualItem = getGoItemSlug(handle, items);
      for (const sorted of [false, true]) {
        const methods = getGoMethods(handle, sorted);
        for (const method of methods) {
          const reference = referenceSlug(method, methods, { parentName: handle.name });
          const indexed = getGoMethodSlug(method, methods, handle.name);
          expected.push(`${prefix}${expectedItem}/${sorted ? '#' : ''}${reference}${sorted ? '' : '/'}`);
          actual.push(`${prefix}${actualItem}/${sorted ? '#' : ''}${indexed}${sorted ? '' : '/'}`);
          if (sorted) anchors++;
          else routes++;
        }
      }
      for (const property of (handle.capabilities ?? []).filter((member) => member.kind?.startsWith('Property'))) {
        expect(getGoMemberAnchor(property.name)).toBe(property.name.toLowerCase().replace(/[^a-z0-9]/g, '-'));
        anchors++;
      }
    }
    expect(actual, file).toEqual(expected);
  }
  expect(modules).toBeGreaterThan(0);
  expect(routes).toBeGreaterThan(0);
  console.info(`Go catalog equivalence: ${routes} item/member routes and ${anchors} anchors (${routes + modules + 1} HTML pages including module/index pages).`);
});

test('route name work grows linearly and repeat lookups do not rescan siblings', () => {
  for (const size of [100, 1000, 4000]) {
    let reads = 0;
    const doc = { dtoTypes: Array.from({ length: size }, (_, i) => ({
      get name() { reads++; return `Type${i}`; },
    })) };
    prepareGoApiRoutes(doc);
    const items = getGoTopLevelRouteItems(doc);
    reads = 0;
    for (let pass = 0; pass < 3; pass++) {
      for (const item of items) getGoItemSlug(item, items);
    }
    expect(reads).toBe(size);
    let oldNormalizations = 0;
    for (const item of items) referenceSlug(item, items, undefined, () => oldNormalizations++);
    expect(oldNormalizations).toBe(size * (size + 1));
    console.info(`Go slug work n=${size}: indexed=${size} name reads (3 passes); old=${oldNormalizations} normalizations (1 pass).`);
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
  prepareGoApiRoutes({ handleTypes: [handle] });
  const methods = getGoMethods(handle);
  reads = 0;
  for (const parentName of ['Parent', 'Other']) {
    for (let pass = 0; pass < 3; pass++) {
      methods.forEach((method, i) => {
        expect(getGoMethodSlug(method, methods, parentName))
          .toBe(`run-${parentName.toLowerCase()}-string${i > 0 ? `-${i + 1}` : ''}`);
      });
    }
  }
  expect(reads).toBe(size * 2);
});

test('getGoItemSlug disambiguates duplicate standalone functions by receiver, then parameters', () => {
  const doc = {
    functions: [
      { name: 'WithHostPort', receiver: 'PgAdminResource', parameters: [{ type: 'int' }] },
      { name: 'WithHostPort', receiver: 'PgWebResource', parameters: [{ type: 'int' }] },
      { name: 'WithHostPort', receiver: 'RedisResource', parameters: [] },
      { name: 'WithHostPort', receiver: 'RedisResource', parameters: [] },
      { name: 'WithHostPort', receiver: 'RedisResource', parameters: [] },
    ],
  };

  const items = getGoTopLevelRouteItems(doc);
  expect(getGoStandaloneFunctions(doc)).toHaveLength(5);
  expect(items.map((item) => getGoItemSlug(item, items))).toEqual([
    'withhostport-pgadminresource-int',
    'withhostport-pgwebresource-int',
    'withhostport-redisresource-noargs',
    'withhostport-redisresource-noargs-2',
    'withhostport-redisresource-noargs-3',
  ]);
});

test('standalone function disambiguation falls back from receiver to the ATS target', () => {
  const doc = {
    functions: [
      { name: 'WithThing', receiver: null, expandedTargetTypes: ['Assembly/First'], parameters: [] },
      { name: 'WithThing', receiver: null, targetTypeId: 'Assembly/Second', parameters: [] },
      // A dotted ATS name is property-style, so it never becomes a standalone item.
      { name: 'WithThing', receiver: null, qualifiedName: 'Container.Third', parameters: [] },
      { name: 'WithThing', receiver: null, parameters: [] },
    ],
  };

  const items = getGoTopLevelRouteItems(doc);
  expect(items.map((item) => getGoItemSlug(item, items))).toEqual([
    'withthing-assembly-first-noargs',
    'withthing-assembly-second-noargs',
    'withthing-noargs',
  ]);
});

test('callback parameters disambiguate by their callback signature', () => {
  const methods = [
    { name: 'WithCallback', kind: 'Method', parameters: [{ type: 'func', isCallback: true, callbackSignature: 'func(ctx *Context) error' }] },
    { name: 'WithCallback', kind: 'Method', parameters: [{ type: 'func', isCallback: true, callbackSignature: 'func() error' }] },
  ];

  expect(getGoMethodSlug(methods[0], methods, 'Thing')).toBe('withcallback-thing-func-ctx-context-error');
  expect(getGoMethodSlug(methods[1], methods, 'Thing')).toBe('withcallback-thing-func-error');
});

test('getGoMethodSlug disambiguates overloads by parameter types', () => {
  const methods = [
    { name: 'WithPersistence', parameters: [] },
    { name: 'WithPersistence', parameters: [{ type: 'time.Duration' }, { type: 'int' }] },
  ];

  expect(getGoMethodSlug(methods[0], methods, 'RedisResource')).toBe('withpersistence-redisresource-noargs');
  expect(getGoMethodSlug(methods[1], methods, 'RedisResource')).toBe('withpersistence-redisresource-time-duration-int');
});

test('getGoMethods keeps methods only, in source order unless sorted', () => {
  const handle = {
    name: 'RedisResource',
    capabilities: [
      { name: 'Host', kind: 'PropertyGetter' },
      { name: 'WithPassword', kind: 'Method' },
      { name: 'SetPasswordParameter', kind: 'PropertySetter' },
      { name: 'WithModule', kind: 'InstanceMethod' },
      { name: 'WithDataVolume', kind: 'Method' },
    ],
  };

  expect(getGoMethods(handle).map((method) => method.name)).toEqual(['WithPassword', 'WithModule', 'WithDataVolume']);
  expect(getGoMethods(handle, true).map((method) => method.name)).toEqual(['WithDataVolume', 'WithModule', 'WithPassword']);
  expect(getGoMethods({})).toEqual([]);
});

test('getGoStandaloneFunctions keeps undotted ATS names and drops property-style ones', () => {
  const doc = {
    functions: [
      { name: 'CreateBuilder' },
      { name: 'AddRedis', qualifiedName: 'addRedis' },
      { name: 'Host', qualifiedName: 'RedisResource.host' },
      { name: 'Run', qualifiedName: 'run' },
    ],
  };

  expect(getGoStandaloneFunctions(doc).map((fn) => fn.name)).toEqual(['CreateBuilder', 'AddRedis', 'Run']);
});

test('getGoTypeByName resolves handles before DTOs before enums', () => {
  const handle = { name: 'Shared' };
  const dto = { name: 'Shared' };
  const enumType = { name: 'OnlyEnum' };
  const doc = { handleTypes: [handle], dtoTypes: [dto], enumTypes: [enumType] };

  expect(getGoTypeByName(doc, 'Shared')).toBe(handle);
  expect(getGoTypeByName(doc, 'OnlyEnum')).toBe(enumType);
  expect(getGoTypeByName(doc, 'Missing')).toBeUndefined();

  prepareGoApiRoutes(doc);
  expect(getGoTypeByName(doc, 'Shared')).toBe(handle);
  expect(getGoTypeByName(doc, 'OnlyEnum')).toBe(enumType);
  expect(getGoTypeByName(doc, 'Missing')).toBeUndefined();
});

test('getGoMemberAnchor lowercases and replaces non-alphanumerics with single dashes', () => {
  expect(getGoMemberAnchor('SetPasswordParameter')).toBe('setpasswordparameter');
  expect(getGoMemberAnchor('Foo_Bar')).toBe('foo-bar');
});
