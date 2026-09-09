import { beforeEach, expect, test, vi } from 'vitest';

import { renderComponent } from './astro-test-utils';

const getModulesMock = vi.hoisted(() => vi.fn());
const resolveCapabilityMock = vi.hoisted(() => vi.fn());

vi.mock('@utils/apphost-modules', () => ({
  getAppHostModules: getModulesMock,
  resolveAppHostCapabilityLanguageSupport: resolveCapabilityMock,
}));

vi.mock('@utils/apphost-languages', () => ({
  getEnabledAppHostLanguages: () => [
    { id: 'typescript', generatedApi: true },
    { id: 'csharp', generatedApi: false },
    { id: 'python', generatedApi: true },
    { id: 'go', generatedApi: true },
    { id: 'java', generatedApi: true },
    { id: 'rust', generatedApi: true },
  ],
}));

import ContainerImages from '@components/ContainerImages.astro';

beforeEach(() => {
  getModulesMock.mockResolvedValue([
    {
      data: {
        package: { name: 'Aspire.Hosting.Redis' },
      },
    },
  ]);
  resolveCapabilityMock.mockReturnValue({
    csharpMemberName: 'AddRedis',
    itemIds: ['capability:Aspire.Hosting.Redis/addRedis'],
    languages: {
      typescript: {
        status: 'supported',
        identifier: 'addRedis',
        validation: 'source-derived',
      },
      python: {
        status: 'supported',
        identifier: 'add_redis',
        validation: 'source-derived',
      },
      go: {
        status: 'supported',
        identifier: 'AddRedis',
        validation: 'source-derived',
      },
      java: {
        status: 'unsupported',
        validation: 'source-derived',
        reason: 'Synthetic test limitation.',
      },
      rust: {
        status: 'supported',
        identifier: 'add_redis',
        validation: 'source-derived',
      },
    },
  });
});

test('renders exact projected container API names for enabled languages', async () => {
  const html = await renderComponent(ContainerImages, {
    props: {
      package: 'Aspire.Hosting.Redis',
      only: 'Redis',
    },
  });

  expect(html).toContain('data-lang="csharp"');
  expect(html).toContain('AddRedis()');
  expect(html).toContain('data-lang="typescript"');
  expect(html).toContain('addRedis()');
  expect(html).toContain('data-lang="python"');
  expect(html).toContain('add_redis()');
  expect(html).toContain('data-lang="go"');
  expect(html).toContain('data-lang="rust"');
  expect(html).not.toContain('data-lang="java"');
  expect(html).not.toContain('__aspireLangPivot');
});
