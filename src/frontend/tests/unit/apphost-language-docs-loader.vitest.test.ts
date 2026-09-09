import { describe, expect, test, vi } from 'vitest';
import type { Loader, LoaderContext } from 'astro/loaders';

import appHostLanguageConfig from '../../src/data/apphost-languages.json';
import {
  appHostLanguageDocsLoader,
  getDisabledAppHostProjectPageIds,
} from '../../config/apphost-language-docs-loader.mjs';

describe('AppHost language docs loader', () => {
  test('derives unpublished project pages from the language registry', () => {
    expect(getDisabledAppHostProjectPageIds()).toEqual(
      appHostLanguageConfig.languages
        .filter((language) => language.id !== 'csharp' && !language.enabled)
        .map((language) => `app-host/${language.id}-apphost`)
    );
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
    const config = {
      ...appHostLanguageConfig,
      languages: appHostLanguageConfig.languages.map((language) => ({
        ...language,
        enabled: language.id !== 'python',
      })),
    };
    const loadedKeys: string[][] = [];
    const load = vi.fn<Loader['load']>((context) => {
      loadedKeys.push(context.store.keys());
      context.store.set({ id: 'app-host/python-apphost', data: {} });
      context.store.set({ id: 'app-host/typescript-apphost', data: {} });
      return Promise.resolve();
    });
    const deleteEntry = vi.fn<LoaderContext['store']['delete']>();
    const setEntry = vi.fn<LoaderContext['store']['set']>(() => true);
    const entries: ReturnType<LoaderContext['store']['entries']> = [
      ['app-host/python-apphost', { id: 'app-host/python-apphost', data: {} }],
      ['app-host/typescript-apphost', { id: 'app-host/typescript-apphost', data: {} }],
    ];
    const store: LoaderContext['store'] = {
      addModuleImport: vi.fn(),
      clear: vi.fn(),
      delete: deleteEntry,
      entries: () => entries,
      get: vi.fn(),
      has: vi.fn(),
      keys: () => ['app-host/python-apphost', 'app-host/typescript-apphost'],
      set: setEntry,
      values: () => entries.map(([, entry]) => entry),
    };
    const loader = appHostLanguageDocsLoader({
      name: 'starlight-docs-loader',
      load,
    } satisfies Loader, config);

    await loader.load({
      store,
    });

    expect(load).toHaveBeenCalledOnce();
    expect(deleteEntry.mock.calls.map(([id]) => id)).toEqual([
      'app-host/python-apphost',
    ]);
    expect(loadedKeys).toEqual([['app-host/typescript-apphost']]);
    expect(setEntry).toHaveBeenCalledOnce();
    expect(setEntry).toHaveBeenCalledWith({
      id: 'app-host/typescript-apphost',
      data: {},
    });
  });
});
