import { beforeEach, expect, test, vi } from 'vitest';

const { createLunaria, runGit } = vi.hoisted(() => ({
  createLunaria: vi.fn(),
  runGit: vi.fn<(command: string, args: string[]) => Promise<{ stdout: string }>>(),
}));

vi.mock('@lunariajs/core', () => ({ createLunaria }));
vi.mock('node:child_process', async () => {
  const { promisify } = await vi.importActual<typeof import('node:util')>('node:util');
  return { execFile: Object.assign(vi.fn(), { [promisify.custom]: runGit }) };
});

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
});

test('translation status is reused only while the checkout commit is unchanged', async () => {
  const getFullStatus = vi.fn().mockResolvedValue(['translation']);
  createLunaria.mockResolvedValue({ config: { repository: 'checkout' }, getFullStatus });
  runGit.mockImplementation((_command, args: string[]) =>
    Promise.resolve({ stdout: args.includes('HEAD') ? 'commit-a\n' : 'false\n' })
  );
  const { getStatusFromCache } = await import('../../src/components/lunaria/cache.mjs');
  expect(await getStatusFromCache()).toEqual({
    config: { repository: 'checkout' },
    status: ['translation'],
  });
  await getStatusFromCache();
  expect(getFullStatus).toHaveBeenCalledTimes(1);

  runGit.mockImplementation((_command, args: string[]) =>
    Promise.resolve({ stdout: args.includes('HEAD') ? 'commit-b\n' : 'false\n' })
  );
  await getStatusFromCache();
  expect(getFullStatus).toHaveBeenCalledTimes(2);
});

test('shallow history is fetched without checking out a different branch', async () => {
  runGit
    .mockResolvedValueOnce({ stdout: 'true\n' })
    .mockResolvedValueOnce({ stdout: '' })
    .mockResolvedValueOnce({ stdout: 'pr-commit\n' });
  createLunaria.mockResolvedValue({ config: {}, getFullStatus: vi.fn().mockResolvedValue([]) });
  const { getStatusFromCache } = await import('../../src/components/lunaria/cache.mjs');
  await getStatusFromCache();
  expect(runGit.mock.calls.map(([, args]) => args)).toEqual([
    ['rev-parse', '--is-shallow-repository'],
    ['fetch', '--unshallow', 'origin'],
    ['rev-parse', 'HEAD'],
  ]);
});

test('a failed status calculation is reported and retried rather than cached', async () => {
  runGit.mockImplementation((_command, args: string[]) =>
    Promise.resolve({ stdout: args.includes('HEAD') ? 'commit-a\n' : 'false\n' })
  );
  const getFullStatus = vi
    .fn()
    .mockRejectedValueOnce(new Error('History unavailable'))
    .mockResolvedValueOnce(['translation']);
  createLunaria.mockResolvedValue({ config: {}, getFullStatus });
  const { getStatusFromCache } = await import('../../src/components/lunaria/cache.mjs');
  await expect(getStatusFromCache()).rejects.toThrow('History unavailable');
  await expect(getStatusFromCache()).resolves.toMatchObject({ status: ['translation'] });
  expect(getFullStatus).toHaveBeenCalledTimes(2);
});
