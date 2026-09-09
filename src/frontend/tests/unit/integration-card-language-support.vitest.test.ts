import { beforeEach, expect, test, vi } from 'vitest';

import { renderComponent } from './astro-test-utils';

const supportMock = vi.hoisted(() => vi.fn());

vi.mock('@utils/apphost-modules', () => ({
  getAppHostPackageLanguageSupport: supportMock,
}));

vi.mock('@utils/apphost-languages', () => ({
  getEnabledAppHostLanguages: () => [
    { id: 'typescript', label: 'TypeScript', icon: 'typescript', generatedApi: true },
    { id: 'csharp', label: 'C#', icon: 'csharp', generatedApi: false },
    { id: 'python', label: 'Python', icon: 'python', generatedApi: true },
    { id: 'go', label: 'Go', icon: 'go', generatedApi: true },
  ],
}));

import IntegrationCard from '@components/IntegrationCard.astro';

const pkg = {
  title: 'Aspire.Hosting.Redis',
  href: 'https://www.nuget.org/packages/Aspire.Hosting.Redis',
  description: 'Redis hosting integration.',
  docs: '/integrations/caching/redis/redis-get-started/',
};

beforeEach(() => {
  supportMock.mockResolvedValue({
    packageName: pkg.title,
    languages: {
      typescript: { status: 'supported', supportedItems: 5, totalItems: 5, reasons: [] },
      python: { status: 'limited', supportedItems: 4, totalItems: 5, reasons: ['One limitation'] },
      go: { status: 'unsupported', supportedItems: 0, totalItems: 5, reasons: ['Not projected'] },
    },
  });
});

test('renders only enabled languages with usable package projections', async () => {
  const html = await renderComponent(IntegrationCard, { props: { pkg } });

  expect(html).toContain('aspire-lang=csharp');
  expect(html).toContain('aspire-lang=typescript');
  expect(html).toContain('aspire-lang=python');
  expect(html).not.toContain('aspire-lang=go');
}, 60_000);

test('keeps C# available when semantic package support is missing', async () => {
  supportMock.mockResolvedValue(undefined);

  const html = await renderComponent(IntegrationCard, { props: { pkg } });

  expect(html).toContain('aspire-lang=csharp');
  expect(html).not.toContain('aspire-lang=typescript');
  expect(html).not.toContain('aspire-lang=python');
  expect(html).not.toContain('aspire-lang=go');
}, 60_000);
