import { defineCollection } from 'astro:content';
import { i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { appHostLanguageDocsLoader } from '../config/apphost-language-docs-loader.mjs';

export const collections = {
  docs: defineCollection({
    loader: appHostLanguageDocsLoader(),
    schema: docsSchema({
      extend: () =>
        z.object({
          /**
           * Absolute sunset date for this page's announcement `banner` (shown
           * via `src/components/starlight/Banner.astro`). Once it passes, the
           * banner is hidden for **everyone**, regardless of whether they
           * dismissed it; if the date is already past at build time the banner
           * isn't rendered at all. Use `YYYY-MM-DD` in frontmatter
           * (e.g. `2026-09-01`).
           *
           * This is a **top-level** field rather than nested under `banner`
           * on purpose: Starlight's built-in `banner` schema is a plain
           * `z.object({ content })`, and extra keys nested inside it are
           * dropped before they reach the component. Top-level keys (like the
           * built-in `lastUpdated`/`publishDate`) survive the schema
           * intersection intact.
           */
          bannerExpiresOn: z.coerce.date().optional(),
          /**
           * Auto-hide this page's announcement `banner` this many days after a
           * reader first sees it — even if they never explicitly dismiss it.
           * Tracked per-reader in `localStorage`, so it's independent of the
           * absolute `bannerExpiresOn` sunset (either one hides the banner).
           * Kept top-level for the same reason as `bannerExpiresOn`.
           */
          bannerAutoDismissAfterDays: z.number().int().positive().optional(),
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
           * SEO-only title override. Used **verbatim** as the page's
           * `og:title` and `twitter:title` (no `· Aspire` suffix is
           * appended) so authors can tune the social-card title to the
           * 50–60 character optimal range without bloating the visible
           * `<h1>` or sidebar label. Falls back to `title` when unset.
           *
           * Prefer rewriting the visible `title` when the natural H1 can
           * accommodate the longer string. Use `seoTitle` only when the
           * sidebar/H1 must stay short (commands, terse labels, etc.).
           */
          seoTitle: z.string().optional(),
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
   * AppHost API module schemas — one semantic document per package with
   * language projections for every generated AppHost SDK.
   */
  apphostModules: defineCollection({
    loader: glob({ pattern: '**/*.json', base: './src/data/apphost-modules' }),
    schema: z
      .object({
        schemaVersion: z.string(),
        generatorProvenance: z.object({
          repository: z.string(),
          commit: z.string(),
          lockFile: z.string(),
        }),
        dumpProvenance: z
          .object({
            cliVersion: z.string().optional(),
            productCommit: z.string().optional(),
            generatedAt: z.string().optional(),
          })
          .optional(),
        package: z.object({
          name: z.string(),
          version: z.string().optional(),
          sourceRepository: z.string().optional(),
          sourceCommit: z.string().optional(),
        }),
        items: z.array(
          z.object({
            id: z.string(),
            kind: z.enum(['capability', 'handle', 'dto', 'enum', 'exportedValue']),
            name: z.string(),
            projections: z.record(
              z.string(),
              z.object({
                status: z.enum(['supported', 'unsupported']),
                validation: z.enum([
                  'source-derived',
                  'upstream-test-validated',
                  'sdk-output-validated',
                ]),
                reason: z.string().optional(),
              }).passthrough()
            ),
          }).passthrough()
        ),
      })
      .passthrough(),
  }),
};
