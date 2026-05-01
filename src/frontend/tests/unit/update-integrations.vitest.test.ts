import { describe, expect, test } from 'vitest';

import {
  DEFAULT_NUGET_ICON_URL,
  getOfficialAspireDefaultIconPackages,
  resolveIconUrl,
} from '../../scripts/update-integrations';

describe('update-integrations icon handling', () => {
  test('uses the package version for official Aspire packages from nuget.org', () => {
    expect(
      resolveIconUrl({
        id: 'Aspire.Azure.AI.OpenAI',
        version: '13.1.3-preview.1.26166.8',
      })
    ).toBe(
      'https://api.nuget.org/v3-flatcontainer/aspire.azure.ai.openai/13.1.3-preview.1.26166.8/icon'
    );
  });

  test('uses the backfilled nuget.org version for official release feed packages', () => {
    expect(
      resolveIconUrl({
        id: 'Aspire.Hosting.Azure.AppService',
        version: '13.2.0-preview.1.12345.6',
        __iconVersion: '13.1.3-preview.1.26166.8',
      })
    ).toBe(
      'https://api.nuget.org/v3-flatcontainer/aspire.hosting.azure.appservice/13.1.3-preview.1.26166.8/icon'
    );
  });

  test('reports default icons for official Aspire packages without throwing', () => {
    expect(
      getOfficialAspireDefaultIconPackages([
        {
          title: 'Aspire.Azure.AI.OpenAI',
          icon: DEFAULT_NUGET_ICON_URL,
          href: 'https://www.nuget.org/packages/Aspire.Azure.AI.OpenAI',
          tags: [],
          version: '13.1.3-preview.1.26166.8',
        },
      ])
    ).toEqual(['Aspire.Azure.AI.OpenAI@13.1.3-preview.1.26166.8']);
  });

  test('allows default icons for community packages', () => {
    expect(
      getOfficialAspireDefaultIconPackages([
        {
          title: 'CommunityToolkit.Aspire.Hosting.Azure.Dapr',
          icon: DEFAULT_NUGET_ICON_URL,
          href: 'https://www.nuget.org/packages/CommunityToolkit.Aspire.Hosting.Azure.Dapr',
          tags: [],
        },
      ])
    ).toEqual([]);
  });
});
