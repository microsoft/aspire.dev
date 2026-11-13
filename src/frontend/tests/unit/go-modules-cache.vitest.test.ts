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
  const data = { package: { name: 'Test' }, functions: [{ name: 'Fn' }] };
  collection.getCollection.mockResolvedValue([{ id: 'test', data }]);
  const { getGoModuleDocument, getGoModules } = await import('@utils/go-modules');
  const { getGoTopLevelRouteItems } = await import('@utils/go-api-routes');
  const [first, second] = await Promise.all([getGoModules(), getGoModules()]);
  expect(first).toBe(second);
  expect(collection.getCollection).toHaveBeenCalledTimes(1);
  expect(collection.getCollection).toHaveBeenCalledWith('goModules');
  expect(Object.isFrozen(data.functions[0])).toBe(true);
  expect(getGoTopLevelRouteItems(data)).toBe(getGoTopLevelRouteItems(data));
  expect(await getGoModuleDocument('Test')).toBe(data);
  expect(await getGoModuleDocument('Test')).toBe(data);
  expect(collection.getCollection).toHaveBeenCalledTimes(1);
  await expect(getGoModuleDocument('Missing')).rejects.toThrow('Unknown Go API package: Missing');
});

test('development loader reloads mutable documents and sees route edits', async () => {
  vi.stubEnv('PROD', false);
  vi.resetModules();
  const data = { package: { name: 'Test' }, functions: [{ name: 'Fn' }] };
  collection.getCollection.mockResolvedValue([{ id: 'test', data }]);
  const { getGoModules } = await import('@utils/go-modules');
  const { getGoItemSlug, getGoTopLevelRouteItems } = await import('@utils/go-api-routes');
  await getGoModules();
  const before = getGoTopLevelRouteItems(data);
  expect(getGoItemSlug(data.functions[0], before)).toBe('fn');
  data.functions[0].name = 'Changed';
  await getGoModules();
  const after = getGoTopLevelRouteItems(data);
  expect(after).not.toBe(before);
  expect(getGoItemSlug(data.functions[0], after)).toBe('changed');
  expect(collection.getCollection).toHaveBeenCalledTimes(2);
});

test('development document lookup sees replacement collection entries', async () => {
  vi.stubEnv('PROD', false);
  vi.resetModules();
  const before = { package: { name: 'Test' }, functions: [{ name: 'Before' }] };
  const after = { package: { name: 'Test' }, functions: [{ name: 'After' }] };
  collection.getCollection.mockResolvedValueOnce([{ id: 'test', data: before }])
    .mockResolvedValueOnce([{ id: 'test', data: after }]);
  const { getGoModuleDocument } = await import('@utils/go-modules');
  expect(await getGoModuleDocument('Test')).toBe(before);
  expect(await getGoModuleDocument('Test')).toBe(after);
  expect(collection.getCollection).toHaveBeenCalledTimes(2);
});

test('compact item and method indexes resolve original objects after filtering non-route entries', async () => {
  const { getGoHandleMethod, getGoItem } = await import('@utils/go-modules');
  const doc = {
    package: { name: 'Test' },
    handleTypes: [{ name: 'Handle', capabilities: [
      { name: 'Value', kind: 'PropertyGetter' },
      { name: 'Run', kind: 'Method' },
      { name: 'SetValue', kind: 'PropertySetter' },
      { name: 'Run', kind: 'InstanceMethod' },
    ] }],
    dtoTypes: [{ name: 'Dto' }],
    enumTypes: [{ name: 'Enum' }],
    functions: [
      { name: 'Run', qualifiedName: 'Handle.Run' },
      { name: 'Create', qualifiedName: 'Create' },
      { name: 'Create', qualifiedName: 'Create' },
    ],
  };
  expect(getGoItem(doc, 'handle', 0)).toBe(doc.handleTypes[0]);
  expect(getGoItem(doc, 'dto', 0)).toBe(doc.dtoTypes[0]);
  expect(getGoItem(doc, 'enum', 0)).toBe(doc.enumTypes[0]);
  expect(getGoItem(doc, 'function', 0)).toBe(doc.functions[1]);
  expect(getGoItem(doc, 'function', 1)).toBe(doc.functions[2]);
  expect(getGoHandleMethod(doc, 0, 0).parentType).toBe(doc.handleTypes[0]);
  expect(getGoHandleMethod(doc, 0, 0).method).toBe(doc.handleTypes[0].capabilities[1]);
  expect(getGoHandleMethod(doc, 0, 1).method).toBe(doc.handleTypes[0].capabilities[3]);

  for (const index of [-1, 0.5, 99, NaN, Infinity]) {
    expect(() => getGoItem(doc, 'function', index)).toThrow('Unknown Go API function index');
    expect(() => getGoHandleMethod(doc, index, 0)).toThrow('Unknown Go API method');
    expect(() => getGoHandleMethod(doc, 0, index)).toThrow('Unknown Go API method');
  }
  expect(() => getGoItem({ package: { name: 'Empty' } }, 'handle', 0)).toThrow('Unknown Go API handle index');
  expect(() => getGoHandleMethod({ package: { name: 'Empty' } }, 0, 0)).toThrow('Unknown Go API method');
});
