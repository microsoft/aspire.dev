/* Required in CI/CD, please leave for now:
eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */
import { defineCollection, z } from 'astro:content';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';
import { changelogsLoader } from 'starlight-changelogs/loader';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: () =>
        z.object({
          renderBlocking: z.string().optional(),
          giscus: z.boolean().optional().default(false),
          category: z
            .enum(['conceptual', 'quickstart', 'tutorial', 'blog', 'reference', 'sample'])
            .optional(),
        }),
    }),
  }),
  i18n: defineCollection({
    loader: i18nLoader(),
    schema: i18nSchema(),
  }),
  changelogs: defineCollection({
    loader: changelogsLoader([
      {
        provider: 'github',
        base: 'releases',
        owner: 'dotnet',
        repo: 'aspire',
        title: 'Release notes',
        pageSize: 5,
        process: ({ title }) => {
          // Titles are similar to 'Aspire 13.1.0 Release', parse out the version only
          const match = title.match(/Aspire (\d+\.\d+\.\d+) Release/);

          return match ? match[1] : title;
        },
      },
    ]),
  }),
};
