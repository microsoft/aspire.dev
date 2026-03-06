/* Required in CI/CD, please leave for now:
eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */
import { defineCollection, z } from 'astro:content';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';
import { glob } from 'astro/loaders';

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
          pageActions: z.boolean().optional().default(true),
        }),
    }),
  }),
  i18n: defineCollection({
    loader: i18nLoader(),
    schema: i18nSchema(),
  }),

  /**
   * Package API schemas — drop `{Package}.{version}.json` files into
   * `src/data/pkgs/` and every reference page is generated automatically.
   */
  packages: defineCollection({
    loader: glob({ pattern: '**/*.json', base: './src/data/pkgs' }),
    schema: z
      .object({
        $schema: z.string().optional(),
        schemaVersion: z.string().optional(),
        package: z.object({
          name: z.string(),
          version: z.string(),
          targetFramework: z.string(),
          sourceRepository: z.string().optional(),
          sourceCommit: z.string().optional(),
        }),
        apiHash: z.string().optional(),
        types: z.array(z.any()),
      })
      .passthrough(),
  }),
};
