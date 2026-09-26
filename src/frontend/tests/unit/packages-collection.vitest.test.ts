import { expect, test, vi } from 'vitest';

const { entries } = vi.hoisted(() => ({
  entries: [
    {
      id: 'public-package',
      data: {
        package: { name: 'Aspire.Hosting.Public', version: '13.6.0' },
        types: [{ name: 'PublicResource', kind: 'class' }],
      },
    },
    {
      id: 'generated-exports-only',
      data: {
        package: {
          name: 'Aspire.Hosting.Proxies',
          version: '13.6.0',
          hasGeneratedExports: true,
        },
        types: [],
      },
    },
  ],
}));

vi.mock('astro:content', () => ({
  getCollection: (_name: string, filter?: (entry: (typeof entries)[number]) => boolean) =>
    Promise.resolve(filter ? entries.filter(filter) : entries),
}));

import { getPackages } from '../../src/utils/packages';

test('C# routes and navigation omit metadata-only generated-export packages', async () => {
  expect(await getPackages()).toEqual([entries[0]]);
});
