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
  const { getTsModules } = await import('@utils/ts-modules');
  const { getTsTopLevelRouteItems } = await import('@utils/ts-api-routes');
  const [first, second] = await Promise.all([getTsModules(), getTsModules()]);
  expect(first).toBe(second);
  expect(collection.getCollection).toHaveBeenCalledTimes(1);
  expect(Object.isFrozen(data.functions[0])).toBe(true);
  expect(getTsTopLevelRouteItems(data)).toBe(getTsTopLevelRouteItems(data));
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
