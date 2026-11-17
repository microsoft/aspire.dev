import { afterEach, expect, test, vi } from 'vitest';

const collection = vi.hoisted(() => ({
  getCollection: vi.fn(),
}));
vi.mock('astro:content', () => collection);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  collection.getCollection.mockReset();
});

test('production loader prepares route data once while reusing its existing collection promise', async () => {
  vi.stubEnv('PROD', true);
  vi.resetModules();
  const data = { package: { name: 'Test' }, functions: [{ name: 'fn' }] };
  collection.getCollection.mockResolvedValue([{ id: 'test', data }]);
  const { getTsModuleDocument, getTsModules } = await import('@utils/ts-modules');
  const { getTsTopLevelRouteItems } = await import('@utils/ts-api-routes');
  const [first, second] = await Promise.all([getTsModules(), getTsModules()]);
  expect(first).toBe(second);
  expect(collection.getCollection).toHaveBeenCalledTimes(1);
  expect(Object.isFrozen(data.functions[0])).toBe(true);
  expect(getTsTopLevelRouteItems(data)).toBe(getTsTopLevelRouteItems(data));
  expect(await getTsModuleDocument('Test')).toBe(data);
  expect(collection.getCollection).toHaveBeenCalledTimes(1);
  await expect(getTsModuleDocument('Missing')).rejects.toThrow('Unknown TypeScript API package: Missing');
});

test('development loader reloads mutable documents and sees route edits', async () => {
  vi.stubEnv('PROD', false);
  vi.resetModules();
  const data = { package: { name: 'Test' }, functions: [{ name: 'fn' }] };
  collection.getCollection.mockResolvedValue([{ id: 'test', data }]);
  const { getTsModules } = await import('@utils/ts-modules');
  const { getTsItemSlug, getTsTopLevelRouteItems } = await import('@utils/ts-api-routes');
  await getTsModules();
  const before = getTsTopLevelRouteItems(data);
  expect(getTsItemSlug(data.functions[0], before)).toBe('fn');
  data.functions[0].name = 'Changed';
  await getTsModules();
  const after = getTsTopLevelRouteItems(data);
  expect(after).not.toBe(before);
  expect(getTsItemSlug(data.functions[0], after)).toBe('changed');
  expect(collection.getCollection).toHaveBeenCalledTimes(2);
});

test('development document lookup reloads replaced collection entries', async () => {
  vi.stubEnv('PROD', false);
  vi.resetModules();
  const before = { package: { name: 'Test' }, functions: [{ name: 'before' }] };
  const after = { package: { name: 'Test' }, functions: [{ name: 'after' }] };
  collection.getCollection.mockResolvedValueOnce([{ id: 'test', data: before }])
    .mockResolvedValueOnce([{ id: 'test', data: after }]);
  const { getTsModuleDocument } = await import('@utils/ts-modules');
  expect(await getTsModuleDocument('Test')).toBe(before);
  expect(await getTsModuleDocument('Test')).toBe(after);
  expect(collection.getCollection).toHaveBeenCalledTimes(2);
});

test('item and method indexes retain identity and reject invalid positions', async () => {
  const { getTsHandleMethod, getTsRouteItem } = await import('@utils/ts-api-routes');
  const doc = {
    handleTypes: [{ name: 'Thing', capabilities: [
      { name: 'value', kind: 'PropertyGetter' },
      { name: 'run', kind: 'Method' },
      { name: 'run', kind: 'InstanceMethod' },
    ] }],
    dtoTypes: [{ name: 'Dto' }],
    enumTypes: [{ name: 'Enum' }],
    functions: [
      { name: 'run', qualifiedName: 'Thing.run' },
      { name: 'create', qualifiedName: 'create' },
      { name: 'create', qualifiedName: 'create' },
    ],
  };
  expect(getTsRouteItem(doc, 'handle', 0)).toBe(doc.handleTypes[0]);
  expect(getTsRouteItem(doc, 'dto', 0)).toBe(doc.dtoTypes[0]);
  expect(getTsRouteItem(doc, 'enum', 0)).toBe(doc.enumTypes[0]);
  expect(getTsRouteItem(doc, 'function', 0)).toBe(doc.functions[1]);
  expect(getTsRouteItem(doc, 'function', 1)).toBe(doc.functions[2]);
  expect(getTsHandleMethod(doc.handleTypes, 0, 0).parentType).toBe(doc.handleTypes[0]);
  expect(getTsHandleMethod(doc.handleTypes, 0, 0).method).toBe(doc.handleTypes[0].capabilities[1]);
  expect(getTsHandleMethod(doc.handleTypes, 0, 1).method).toBe(doc.handleTypes[0].capabilities[2]);
  for (const index of [-1, 0.5, 99, NaN, Infinity]) {
    expect(() => getTsRouteItem(doc, 'function', index)).toThrow('Unknown TypeScript API function index');
    expect(() => getTsHandleMethod(doc.handleTypes, index, 0)).toThrow('Unknown TypeScript API method');
    expect(() => getTsHandleMethod(doc.handleTypes, 0, index)).toThrow('Unknown TypeScript API method');
  }
  expect(() => getTsRouteItem({}, 'handle', 0)).toThrow('Unknown TypeScript API handle index');
  expect(() => getTsHandleMethod(undefined, 0, 0)).toThrow('Unknown TypeScript API method');
});
