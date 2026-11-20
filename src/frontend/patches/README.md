# Dependency patches

Bun applies these patches through `patchedDependencies` in `../package.json`. Each file is
named after the exact package version it patches, so a version bump needs the patch
regenerated (`bun patch <package>`, edit, then `bun patch --commit <directory>`).

| Patch | Why |
| --- | --- |
| `@astrojs__starlight@0.43.0.patch` | Starlight search must initialize and dispose per element across `ClientRouter` swaps ([#1673](https://github.com/microsoft/aspire.dev/issues/1673)). The sidebar group caret is drawn with a CSS mask from the shared stylesheet instead of an inline SVG repeated for every group (hundreds per API reference page). Also skips untranslated locale fallback routes: StaticHost serves the English page in place (`LocaleFallbackMiddleware`) and `src/scripts/locale-fallback.ts` localizes the chrome, instead of emitting a full English copy per locale. On those pages search waits for `data-translations-pending` to clear, then reads the localized `data-translations` (including Pagefind's own strings for the locale) while it keeps searching the English index. |
| `astro@7.4.11.patch` | Imported SVGs are callable components that can't be structured-cloned, so the parallel prerender worker keeps only their image metadata before posting results. |
| `starlight-page-actions@0.7.1.patch` | Keeps accessible actions across page swaps, allows readable heading markup, and points Markdown actions on untranslated locale pages to the default-locale Markdown. The dropdown's external-link icon is a CSS mask instead of an inline SVG per item. |
| `starlight-plugin-icons@1.1.6.patch` | Temporary network-resilience fix for `getMaterialIconsData`: falls back to the vendored `.starlight-icons` cache when the icon-data fetch fails. Remove once [Rettend/starlight-plugin-icons#9](https://github.com/Rettend/starlight-plugin-icons/pull/9) is merged and released. |

## Upgrade compatibility

Starlight's compiled components now live under `dist/`. Regenerate patches against those
published files, and keep `scopedStyleStrategy: 'where'` in `astro.config.mjs` to preserve the
site's CSS specificity.

TypeScript 7 is installed as `typescript-native`; invoke its compiler explicitly with
`node node_modules/typescript-native/bin/tsc`. The standard `typescript` dependency remains
on 5.9 because two-slash and typed ESLint require its JavaScript compiler and language-service
APIs, which TypeScript 7 no longer exports. Keep that dependency within both tools' supported
peer ranges rather than overriding them or disabling typed linting.

Lunaria uses `lunaria.config.mts` and its instance-based API. A shallow checkout needs full
history to calculate translation status; the dashboard fetches history without changing HEAD,
so PR commits remain part of the comparison.
