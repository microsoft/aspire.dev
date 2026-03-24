/* Required in CI/CD, please leave for now:
eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */
import { defineCollection, z } from 'astro:content';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';
import { docSearchI18nSchema } from '@astrojs/starlight-docsearch/schema';
import { glob } from 'astro/loaders';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: () =>
        z.object({
          renderBlocking: z.string().optional(),
          giscus: z.boolean().optional().default(false),
          crumbs: z.boolean().optional().default(true),
          category: z
            .enum(['conceptual', 'quickstart', 'tutorial', 'blog', 'reference', 'sample'])
            .optional(),
          pageActions: z.boolean().optional().default(true),
        }),
    }),
  }),
  i18n: defineCollection({
    loader: i18nLoader(),
    schema: i18nSchema({
      // @ts-expect-error — Zod version mismatch between starlight-docsearch and astro/zod
      extend: docSearchI18nSchema(),
    }),
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

  /**
   * TypeScript API module schemas — drop `{Package}.{version}.json` files
   * into `src/data/ts-modules/` and the TS API reference pages are generated
   * automatically.
   */
  tsModules: defineCollection({
    loader: glob({ pattern: '**/*.json', base: './src/data/ts-modules' }),
    schema: z
      .object({
        package: z.object({
          name: z.string(),
          version: z.string().optional(),
          language: z.string().optional(),
          sourceRepository: z.string().optional(),
          sourceCommit: z.string().optional(),
        }),
        functions: z.array(z.any()).default([]),
        handleTypes: z.array(z.any()).default([]),
        dtoTypes: z.array(z.any()).default([]),
        enumTypes: z.array(z.any()).default([]),
      })
      .passthrough(),
  }),
};
