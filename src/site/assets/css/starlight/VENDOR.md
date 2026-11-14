# Vendored third-party CSS

Copied unchanged from `src/frontend/node_modules` at the versions pinned by `src/frontend/pnpm-lock.yaml`, so the
Douze build reproduces the cascade of the Astro build. Update by copying the files again from the new versions.
`site-entry.css` imports them in Starlight's order.

| File | Package | Version | Source | License |
|---|---|---|---|---|
| `layers.css`, `props.css`, `reset.css`, `asides.css`, `util.css`, `anchor-links.css`, `markdown.css`, `print.css` | `@astrojs/starlight` | 0.41.3 | `style/*.css` | MIT, Copyright (c) 2023 [Astro contributors](https://github.com/withastro/starlight/graphs/contributors) |
| `catppuccin-shared.css` | `@catppuccin/starlight` | 2.1.0 | `styles/shared.css` | MIT, Copyright (c) 2024 Catppuccin |
| `catppuccin-mocha-mauve.css`, `catppuccin-latte-mauve.css` | `@catppuccin/starlight` | 2.1.0 | `themes/catppuccin-{mocha,latte}-mauve.css`: the files the plugin adds to `customCss` for `catppuccin()` without options (dark mocha, light latte, accent mauve) | MIT, Copyright (c) 2024 Catppuccin |
| `starlight-plugin-icons.css` | `starlight-plugin-icons` | 1.1.6 | `src/styles/main.css` (in `customCss`) | MIT (package.json; no LICENSE file in the package), Rettend |
| `pagefind-ui.css` | `@pagefind/default-ui` | 1.5.2 | `css/ui.css` (imported into `layer(starlight.core)` by Starlight's `Search.astro`) | MIT (package.json), CloudCannon |
| `tippy.css` | `tippy.js` | 6.3.7 | `dist/tippy.css` (imported by the site's `Head.astro`) | MIT, Copyright (c) 2017-present atomiks |
| `asciinema-player.css` | `asciinema-player` | 3.17.0 | `dist/bundle/asciinema-player.css` (imported by `AsciinemaPlayer.astro`) | Apache-2.0, Copyright asciinema contributors |

The scoped `<style>` blocks of the Starlight components (0.41.3) and of the plugins `starlight-kbd` 0.4.0,
`starlight-page-actions` 0.7.0, `starlight-image-zoom` 0.15.0, `starlight-sidebar-topics` 0.8.0 and
`starlight-plugin-icons` 1.1.6 (all MIT) are not copied here: `scripts/extract-styles.mjs` extracts them, scoped, into
`../components.css`.

Fonts (`../../fonts/`, rules in `../fonts.css`): `@fontsource/poppins` 5.3.0 (weights 300 to 700, normal) and
`@fontsource-variable/fira-code` 5.3.0 (`wght` axis), woff2 files of every unicode subset the original imports pulled.
Font files: SIL Open Font License 1.1; Fontsource CSS: MIT.
