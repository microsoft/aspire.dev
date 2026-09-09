import { describe, expect, test, vi } from 'vitest';

import appHostLanguageConfig from '../../src/data/apphost-languages.json';
import {
  appHostLanguageDocsLoader,
  getDisabledAppHostProjectPageIds,
} from '../../config/apphost-language-docs-loader.mjs';

describe('AppHost language docs loader', () => {
  test('derives unpublished project pages from the language registry', () => {
    expect(getDisabledAppHostProjectPageIds()).toEqual([
      'app-host/python-apphost',
      'app-host/go-apphost',
      'app-host/java-apphost',
      'app-host/rust-apphost',
    ]);
  });

  test('publishes a project page when its enabled bit flips', () => {
    const config = {
      ...appHostLanguageConfig,
      languages: appHostLanguageConfig.languages.map((language) => ({
        ...language,
        enabled: language.id === 'python' ? true : language.enabled,
      })),
    };

    expect(getDisabledAppHostProjectPageIds(config)).not.toContain(
      'app-host/python-apphost'
    );
  });

  test('removes disabled pages after the Starlight loader runs', async () => {
    const load = vi.fn();
    const deleteEntry = vi.fn();
    const loader = appHostLanguageDocsLoader({
      name: 'starlight-docs-loader',
      load,
    });

    await loader.load({
      store: { delete: deleteEntry },
    } as Parameters<typeof loader.load>[0]);

    expect(load).toHaveBeenCalledOnce();
    expect(deleteEntry.mock.calls.map(([id]) => id)).toEqual(
      getDisabledAppHostProjectPageIds()
    );
  });
});
