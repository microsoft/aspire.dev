import { docsLoader } from '@astrojs/starlight/loaders';
import appHostLanguageConfig from '../src/data/apphost-languages.json' with { type: 'json' };

export function getDisabledAppHostProjectPageIds(config = appHostLanguageConfig) {
  return config.languages
    .filter((language) => language.id !== 'csharp' && !language.enabled)
    .map((language) => `app-host/${language.id}-apphost`);
}

export function appHostLanguageDocsLoader(
  baseLoader = docsLoader(),
  config = appHostLanguageConfig
) {
  return {
    ...baseLoader,
    name: 'aspire-apphost-language-docs-loader',
    async load(context) {
      const disabledIds = new Set(getDisabledAppHostProjectPageIds(config));

      for (const id of disabledIds) {
        context.store.delete(id);
      }

      const store = new Proxy(context.store, {
        get(target, property) {
          if (property === 'get') {
            return (id) => (disabledIds.has(id) ? undefined : target.get(id));
          }
          if (property === 'set') {
            return (entry) => (disabledIds.has(entry.id) ? false : target.set(entry));
          }
          if (property === 'has') {
            return (id) => !disabledIds.has(id) && target.has(id);
          }
          if (property === 'keys') {
            return () => target.keys().filter((id) => !disabledIds.has(id));
          }
          if (property === 'values') {
            return () => target.values().filter((entry) => !disabledIds.has(entry.id));
          }
          if (property === 'entries') {
            return () => target.entries().filter(([id]) => !disabledIds.has(id));
          }

          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });

      await baseLoader.load({ ...context, store });
    },
  };
}
