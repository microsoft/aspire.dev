import { z } from 'astro/zod';

const LunariaStarlightConfigSchema = z.object({
  route: z.string().default('/lunaria'),
});

export default function lunariaStarlight(userConfig = {}) {
  const { route } = LunariaStarlightConfigSchema.parse(userConfig);

  return {
    name: '@lunariajs/starlight',
    hooks: {
      setup: ({ addIntegration }) => {
        addIntegration({
          name: '@lunariajs/starlight',
          hooks: {
            'astro:config:setup': ({ injectRoute }) => {
              injectRoute({
                pattern: route,
                entrypoint: './src/components/lunaria/Dashboard.astro',
              });
            },
          },
        });
      },
    },
  };
}
