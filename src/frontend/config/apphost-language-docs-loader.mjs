import { docsLoader } from '@astrojs/starlight/loaders';
import appHostLanguageConfig from '../src/data/apphost-languages.json' with { type: 'json' };

export function getDisabledAppHostProjectPageIds(config = appHostLanguageConfig) {
  return config.languages
    .filter((language) => language.id !== 'csharp' && !language.enabled)
    .map((language) => `app-host/${language.id}-apphost`);
}

export function appHostLanguageDocsLoader(baseLoader = docsLoader()) {
  return {
    ...baseLoader,
    name: 'aspire-apphost-language-docs-loader',
    async load(context) {
      await baseLoader.load(context);

      for (const id of getDisabledAppHostProjectPageIds()) {
        context.store.delete(id);
      }
    },
  };
}
