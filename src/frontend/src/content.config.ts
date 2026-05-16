import { defineCollection } from 'astro:content';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: () =>
        z.object({
          renderBlocking: z.string().optional(),
          giscus: z.boolean().optional().default(false),
          crumbs: z.boolean().optional().default(true),
          topic: z.string().optional(),
          category: z
            .enum(['conceptual', 'quickstart', 'tutorial', 'blog', 'reference', 'sample'])
            .optional(),
          pageActions: z.boolean().optional().default(true),
          /**
           * Override the per-page Open Graph / Twitter card image. Accepts an
           * absolute URL or a path starting with `/` (resolved against the
           * configured `site`). When set, this image is used instead of the
           * build-time generated `/og/<slug>.png`.
           */
          ogImage: z.string().optional(),
          /**
           * Opt out of dynamic Open Graph image generation for this page. When
           * `false`, the build skips generating a per-page OG image and the
           * site-wide `og-image.png` is used in social cards instead.
           */
          og: z.boolean().optional(),
          /**
           * The date the release was published to NuGet. Used on What's New
           * pages to display the release date near the top of the page.
           * Accepts values that can be coerced to a JavaScript Date; use
           * `YYYY-MM-DD` in frontmatter (e.g. `2026-05-07`).
           */
          publishDate: z.coerce.date().optional(),
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
