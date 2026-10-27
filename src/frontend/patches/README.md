# Dependency patches

Bun applies these patches through `patchedDependencies` in `../package.json`. Each file is
named after the exact package version it patches, so a version bump needs the patch
regenerated (`bun patch <package>`, edit, then `bun patch --commit <directory>`).

| Patch | Why |
| --- | --- |
| `@astrojs__starlight@0.41.3.patch` | Starlight search must initialize and dispose per element across `ClientRouter` swaps, not only on `DOMContentLoaded` ([#1673](https://github.com/microsoft/aspire.dev/issues/1673)). |
| `astro@7.4.1.patch` | Imported SVGs are callable components that can't be structured-cloned, so the parallel prerender worker keeps only their image metadata before posting results. |
| `starlight-page-actions@0.7.0.patch` | Keeps accessible actions across page swaps and allows readable heading markup. |
| `starlight-plugin-icons@1.1.6.patch` | Temporary network-resilience fix for `getMaterialIconsData`: falls back to the vendored `.starlight-icons` cache when the icon-data fetch fails. Remove once [Rettend/starlight-plugin-icons#9](https://github.com/Rettend/starlight-plugin-icons/pull/9) is merged and released. |
