import { afterEach, expect, test, vi } from 'vitest';

const collection = vi.hoisted(() => ({ getCollection: vi.fn() }));
vi.mock('astro:content', () => collection);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  collection.getCollection.mockReset();
});

test('production document lookup reuses the collection and preserves type identity', async () => {
  vi.stubEnv('PROD', true);
  vi.resetModules();
  const data = {
    package: { name: 'Test', version: '1.0', targetFramework: 'net10.0' },
    types: [{ name: 'Thing', kind: 'class' }, { name: 'Thing', kind: 'class' }],
  };
  collection.getCollection.mockResolvedValue([{ id: 'test', data }]);
  const { getPackageDocument, getPackages, getPackageType } = await import('@utils/packages');
  await getPackages();
  expect(await getPackageDocument('Test')).toBe(data);
  expect(await getPackageDocument('Test')).toBe(data);
  expect(collection.getCollection).toHaveBeenCalledTimes(1);
  expect(collection.getCollection).toHaveBeenCalledWith('packages', expect.any(Function));
  expect(getPackageType(data, 0)).toBe(data.types[0]);
  expect(getPackageType(data, 1)).toBe(data.types[1]);
  await expect(getPackageDocument('Missing')).rejects.toThrow('Unknown C# API package: Missing');
  for (const index of [-1, 0.5, 2, NaN, Infinity]) {
    expect(() => getPackageType(data, index)).toThrow('Unknown C# API type index');
  }
});

test('development document lookup reloads replaced collection entries', async () => {
  vi.stubEnv('PROD', false);
  vi.resetModules();
  const before = { package: { name: 'Test' }, types: [{ name: 'Before' }] };
  const after = { package: { name: 'Test' }, types: [{ name: 'After' }] };
  collection.getCollection.mockResolvedValueOnce([{ id: 'test', data: before }])
    .mockResolvedValueOnce([{ id: 'test', data: after }]);
  const { getPackageDocument } = await import('@utils/packages');
  expect(await getPackageDocument('Test')).toBe(before);
  expect(await getPackageDocument('Test')).toBe(after);
  expect(collection.getCollection).toHaveBeenCalledTimes(2);
});
