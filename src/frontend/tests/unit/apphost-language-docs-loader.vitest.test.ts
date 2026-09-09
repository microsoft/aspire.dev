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
    const loadedKeys: string[][] = [];
    const load = vi.fn(async (context) => {
      loadedKeys.push(context.store.keys());
      context.store.set({ id: 'app-host/python-apphost', data: {} });
      context.store.set({ id: 'app-host/typescript-apphost', data: {} });
    });
    const deleteEntry = vi.fn();
    const setEntry = vi.fn(() => true);
    const loader = appHostLanguageDocsLoader({
      name: 'starlight-docs-loader',
      load,
    });

    await loader.load({
      store: {
        addModuleImport: vi.fn(),
        clear: vi.fn(),
        delete: deleteEntry,
        entries: () => [
          ['app-host/python-apphost', { id: 'app-host/python-apphost', data: {} }],
          ['app-host/typescript-apphost', { id: 'app-host/typescript-apphost', data: {} }],
        ],
        get: vi.fn(),
        has: vi.fn(),
        keys: () => ['app-host/python-apphost', 'app-host/typescript-apphost'],
        set: setEntry,
        values: () => [
          { id: 'app-host/python-apphost', data: {} },
          { id: 'app-host/typescript-apphost', data: {} },
        ],
      },
    } as Parameters<typeof loader.load>[0]);

    expect(load).toHaveBeenCalledOnce();
    expect(deleteEntry.mock.calls.map(([id]) => id)).toEqual(
      getDisabledAppHostProjectPageIds()
    );
    expect(loadedKeys).toEqual([['app-host/typescript-apphost']]);
    expect(setEntry).toHaveBeenCalledOnce();
    expect(setEntry).toHaveBeenCalledWith({
      id: 'app-host/typescript-apphost',
      data: {},
    });
  });
});
