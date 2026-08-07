import { loadConfig, readConfig, writeConfig } from '@lunariajs/core/config';
import { git } from '@lunariajs/core/git';
import { z } from 'astro/zod';

const LunariaStarlightConfigSchema = z
  .object({
    configPath: z.string().default('./lunaria.config.json'),
    route: z.string().default('/lunaria'),
    sync: z.boolean().default(false),
  })
  .default({});

export default function lunariaStarlight(userConfig) {
  const pluginConfig = LunariaStarlightConfigSchema.parse(userConfig);

  return {
    name: '@lunariajs/starlight',
    hooks: {
      setup: async ({ addIntegration, config, logger, command }) => {
        if (pluginConfig.sync && command === 'build') {
          if (config.locales) {
            logger.info('Syncing Lunaria configuration with Starlight...');

            const lunariaConfig = await readConfig(pluginConfig.configPath);
            const starlightFilesEntry = {
              location: 'src/content/docs/**/*.{md,mdx}',
              pattern: 'src/content/docs/@lang/@path',
              type: 'universal',
            };

            const otherFiles =
              lunariaConfig?.files?.filter((file) => file.location !== starlightFilesEntry.location) ??
              [];

            const locEntries = Object.entries(config.locales);
            const locales = locEntries
              .filter(([key]) => key !== 'root' && key !== config.defaultLocale)
              .map(([key, locale]) => ({
                label: locale.label,
                lang: key,
              }));

            const [defaultKey, defaultValue] = locEntries.find(
              ([key]) => key === config.defaultLocale || key === 'root'
            );

            const defaultLocale = {
              label: defaultValue.label,
              lang: defaultValue.lang?.toLowerCase() ?? defaultKey,
            };

            lunariaConfig.files = [starlightFilesEntry, ...otherFiles];
            lunariaConfig.locales = locales;
            lunariaConfig.defaultLocale = defaultLocale;

            writeConfig(pluginConfig.configPath, lunariaConfig);
            logger.info('Sync complete.');
          } else {
            logger.warn(
              'Sync is only supported when your Starlight config includes the locales field.'
            );
          }
        }

        await loadConfig(pluginConfig.configPath);
        const isShallowRepo = (await git.revparse(['--is-shallow-repository'])) === 'true';

        addIntegration({
          name: '@lunariajs/starlight',
          hooks: {
            'astro:config:setup': ({ updateConfig, injectRoute }) => {
              updateConfig({
                vite: {
                  plugins: [vitePluginLunariaStarlight(pluginConfig, isShallowRepo)],
                },
              });

              injectRoute({
                pattern: pluginConfig.route,
                entrypoint: './src/components/lunaria/Dashboard.astro',
              });
            },
          },
        });
      },
    },
  };
}

function vitePluginLunariaStarlight(pluginConfig, isShallowRepo) {
  const moduleId = 'virtual:lunaria-starlight';
  const resolvedModuleId = `\0${moduleId}`;
  const moduleContent = `
  export const pluginConfig = ${JSON.stringify(pluginConfig)}
  export const isShallowRepo = ${JSON.stringify(isShallowRepo)}
  `;

  return {
    name: 'vite-plugin-lunaria-starlight',
    load(id) {
      return id === resolvedModuleId ? moduleContent : undefined;
    },
    resolveId(id) {
      return id === moduleId ? resolvedModuleId : undefined;
    },
  };
}
