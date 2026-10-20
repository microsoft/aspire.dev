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
  const { getGoModules } = await import('@utils/go-modules');
  const { getGoTopLevelRouteItems } = await import('@utils/go-api-routes');
  const [first, second] = await Promise.all([getGoModules(), getGoModules()]);
  expect(first).toBe(second);
  expect(collection.getCollection).toHaveBeenCalledTimes(1);
  expect(collection.getCollection).toHaveBeenCalledWith('goModules');
  expect(Object.isFrozen(data.functions[0])).toBe(true);
  expect(getGoTopLevelRouteItems(data)).toBe(getGoTopLevelRouteItems(data));
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
