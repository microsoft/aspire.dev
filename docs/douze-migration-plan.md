# Migrating aspire.dev to Douze

This plan replaces the Astro/Starlight build of aspire.dev with [Douze](https://github.com/sebastienros/douze), a
native AOT static site generator whose workflow engine renders this site's API reference in seconds
(`bench/README.md` of the Douze repository: the 19,712 API pages of this repository's data in 2.9 s, 1.4 GB). It
covers both pipelines, the articles (`src/frontend/src/content/docs`) and the API reference
(`src/frontend/src/data/pkgs`, `ts-modules`), the port of the Starlight chrome and of the site's components, the
changes to the .NET data generators, the scripted conversion of the articles from MDX to Markdown with Liquid
shortcodes, locales, hosting, CI, and the validation that gates the cutover. It is a plan, not a status: nothing
described here is implemented.

Facts about the site below were verified on `origin/main` at `c26b59ba` ("Honor Front Door X-Forwarded-Host in
StaticHost (#1930)", 2026-10-20); the full fact sheets are in the planning session's notes. The Douze side is
specified in two documents of the Douze repository: `docs/workflow-engine-plan.md` (the engine, implemented through
its phase 5 plus bounded channels) and `docs/site-features-plan.md` (the features this site needs, phases S1 to S7;
"S-phases" below). Paths below are relative to this repository's root; `FE/` is `src/frontend/`.

How to read this document: section 1 is the recommendation and why; section 2 the numbers that drive it; section 3
the target layout and the complete `douze.yml`; sections 4 to 10 the work by area (chrome, API reference, generators,
articles conversion, locales, hosting, CI); section 11 the parity validation; section 12 the phases with model,
effort and reviews; section 13 the roadmap shared with the Douze plan; section 14 the risks.

---

## 1. Recommendation: the full site, API reference first, no hybrid deployment

**Recommendation: migrate the whole site on this branch, in the order API reference, chrome, articles, and cut over
once; do not deploy a hybrid (Douze for `/reference/api/**`, Astro for the rest).**

Why not the hybrid, although it is the lower-risk sounding option:

- The hybrid needs the Starlight chrome (header, sidebar with the topic picker, search, footer, theme toggle, banner,
  mobile menu) around the Douze API pages, so the chrome port of section 4 happens anyway, and it must then be kept
  identical to the Astro chrome for the duration of the hybrid: two copies of 5,800 lines of overrides plus the
  Starlight CSS, drifting with every Starlight release. Starlight's CSS is emitted by Astro with hashed names under
  `_astro/`, so the Douze pages would reference files whose names change on every Astro build, or carry a third copy.
- Two build systems in CI, two dev loops, two sets of e2e server configurations, and a merge of two `dist` folders in
  StaticHost's publish, all thrown away at cutover.
- The API reference is already the easy part for Douze (data-driven templates, no MDX, English only); the hybrid
  ships the easy part and defers the hard part (articles, chrome) without reducing it.

What the hybrid does buy is an early, low-risk production win on build time (the API routes are 18 of the 22 minutes).
This plan keeps that win without the deployment: the API reference is the first thing built on this branch
(section 12, phases M0 to M2), validated with the API Playwright specs against Douze's output, so that if the article
conversion slips, deploying the hybrid remains a fallback decision (section 1.1), not the plan.

**Order on the branch.** M0 generators and page index (while Douze S1 lands), M1 the parity harness, M2 the API
reference on Douze, M3 the chrome port, M4 the converter, M5 articles and site-wide outputs, M6 hosting, M7 parity
and performance, M8 cutover. Section 12 has each.

### 1.1 The fallback

If, at the end of M4, the converter leaves more than about 10% of the articles needing manual work, or the chrome
port is not at parity on the e2e suite within its budget, the hybrid can be deployed from the same branch: Douze
builds `/reference/api/**` into StaticHost's `wwwroot` first and `astro build` (with the API routes removed) writes
the rest next to it; the API pages use a static copy of the header and footer markup extracted from one Astro page at
build time (a 100-line script) and link the Astro-built CSS by reading Astro's manifest. This is a contingency with
a known cost (about a week of glue, and the drift above); it is not started unless the trigger fires.

---

## 2. What is being replaced, in numbers

| | Today (Astro 7.3, Starlight 0.41) | Source |
|---|---|---|
| Build | 32,203 routes in 21 min 56 s on `ubuntu-24.04`; rendering 17 min 58 s; Pagefind 118 s; `NODE_OPTIONS=--max-old-space-size=8192`; `build.concurrency` 4 | CI run 39513380035 |
| Articles | 538 English files (524 `.mdx`, 14 `.md` CLI partials); `ja` 59 translated pages + index; 13 other locales with `index.mdx` only; 40 glossary `.md` | `FE/src/content` |
| Locale routes | about 538 per locale × 14 = about 7,500, almost all English fallbacks rendered by Starlight | |
| Components in English MDX (outside fences) | TabItem 2,485, ApiReference 1,225, Tabs 1,174, Aside 837, LearnMore 477, Include 422, Image 342, Steps 257, ThemeImage 156, Badge 136, LinkButton 131, Pivot 123, Kbd 79, InstallDotNetPackage 67, Icon 62, OsAwareTabs 53, LicenseBadge 49, LinkCard 38, ContainerImages 35, InstallPackage 29, FileTree 27, SimpleAppHostCode 25, CardGrid 14, ReleaseCommunity 13, then about 40 components with fewer than 10 usages | fence-aware scan |
| Imports in MDX | 2,169 lines in 521 files: 757 component imports, 675 image imports (all `@assets`), 453 Starlight, 238 `astro:assets`, 5 JSON | |
| Markdown syntax | `:::note/tip/caution/danger` 299 (129 with a title), `> [!NOTE]` 12, 379 tables, no footnotes, no `{#id}`, `<details>` 4; inline HTML in 21 files (`div` 298) | |
| Fences | 5,597 English in 495 files (csharp 2,182, bash 1,112, typescript 1,111, json 294, xml 176, mermaid 93, python 87, go 67, powershell 62, ...); twoslash 323 English + 74 `ja`; meta: `title=` 4,880, `{n-m}` 118, `ins=` 76, `frame=` 7, `disable-copy` 18 | |
| Placeholders | `%ASPIRE_VERSION%` 100 uses in 64 files (+25 `ja`), `%ASPIRE_VERSION_MAJOR_MINOR%` 3, `%ASPIRE_VERSION_PREVIEW%` 13; values in `FE/config/aspire-versions.mjs` | |
| Chrome | 14 Starlight overrides, 5,794 lines (+ `MobileSiteLinks.astro`), 73 `<script>` tags in 53 `.astro` files (24 `is:inline`), 7 custom elements, `<ClientRouter fallback="swap">` | `FE/src/components/starlight` |
| Styles | `FE/src/styles` 4,557 lines; 119 scoped `<style>` blocks in 111 `.astro` files, about 19,200 lines; Catppuccin theme; UnoCSS for icons only (26-class safelist) | |
| Sidebar | `FE/config/sidebar/*.ts` 5,196 lines, 6 topics, 526 leaf links, labels in 15 locales | |
| API data | 202 package files (15.6 MB, largest 3.6 MB), 140 module files (62.9 MB, largest 14.1 MB); 178 packages with types, 1,810 types, 9,845 members; 35,802 TS functions, 2,893 handles, 1,130 enums, 74 DTOs | `FE/src/data` |
| API pages | C# 4,818 (1 + 178 + 1,810 + 2,829 member-kind pages); TS 19,241 (1 + 140 + 8,466 items + 10,634 methods); `.md` twins 24,096 (+37 TS legacy aliases); inline search indexes of 3.7 MB (C#) and 13.6 MB (TS) | computed from the data with the repository's slug code |
| Other outputs | 182 redirects (1 computed, 14 under `/ja/`), about 540 OG images (satori + sharp, Outfit font), RSS, sitemap (Starlight's), llms.txt / llms-full.txt / llms-small.txt, `.md` copies of every page (starlight-page-actions, raw MDX), 24 versioned CLI schema JSON files + index, `/.well-known/agent-skills`, IndexNow key | |
| Tests | 47 Playwright specs (465 tests) in 3 projects × 2 shards; 80 Vitest files (742 tests); 34 StaticHost test files; generator tests | |
| Hosting | StaticHost (ASP.NET Core): canonical case redirects, `Accept: text/markdown` negotiation (`/a/b/` -> `/a/b.md`), `Link` headers, 404 page, Brotli, immutable caching of `_astro/*`, live status API; `dist` embedded through a `ProjectReference` to `frontend.esproj` | `src/statichost` |

Expected with Douze (section 11.3 measures it): a cold CI build in about 4 to 5 minutes, of which about 3 are the
Node workers on their first run (twoslash on 400 fences, Pagefind on the articles); under 1 minute warm from the
`.douze` cache; peak memory under 2 GB; `douze serve` for authors with sub-second rebuilds.

---

## 3. Target layout and workflow

### 3.1 Repository layout

A new folder holds the Douze site; `src/frontend` stays until M8 and is deleted at cutover.

```
src/site/
  douze.yml                     the workflow (3.2)
  package.json, pnpm-lock.yaml  tooling the workflow runs: expressive-code (+ twoslash, line numbers, collapsible
                                sections, icons; Node), pagefind, esbuild and lightningcss (native binaries), playwright
  content/                      the url root: the Starlight tree as today (urls do not change)
    get-started/, integrations/, ...   the articles, Markdown + shortcodes (converted from FE/src/content/docs; same tree, same slugs)
    ja/, de/, ...               locale folders, as today
    hub/glossary/*.md           40 glossary terms (Markdown), their url is /hub/glossary/<term>/
    hub/, reference/samples/    the data-driven pages, as Liquid templates with pagination
    index.md, 404.md (permalink: /404.html), docs.md, support.md
    sitemap.xml.liquid, rss.xml.liquid, robots.txt.liquid   output templates (permalink + layout: false)
    exports/llms*.txt.liquid    text exports rendered after the docs collection has the page contents
    reference/api/              one template per route (section 5), HTML and .md twins
    reference/cli/configuration/schema*.liquid   the CLI schema routes (latest and per version) from data/schemas
    .well-known/, rss.xsl, ...  the static files of FE/public, passed through
  data/
    site.yml                    title, description, social links, versions (from aspire-versions.mjs)
    sidebar/*.yml               the sidebar topics (generated once from FE/config/sidebar/*.ts, then hand maintained)
    i18n/*.json                 UI strings (moved from FE/src/content/i18n)
    redirects.yml               from FE/config/redirects.mjs
    integrations.json, samples.json, github-stats.json, ...   moved from FE/src/data (same names, same daily updater)
    api/pkgs/*.json, api/ts-modules/*.json   moved from FE/src/data (the generators' output)
    api/pages/*.json, api/xref.json, api/search-*.json         new generator outputs (section 6)
    schemas/*.json              CLI schemas, as today (served by the schema templates)
  templates/
    layouts/                    base.liquid, docs.liquid, splash.liquid, api.liquid, hub.liquid, glossary.liquid
    partials/                   head, header, sidebar, toc, footer, banner, search, page-actions, breadcrumbs, prev-next, ...
    shortcodes/                 one file per component (section 7.2)
    api/                        the API reference partials (section 5.2)
    og/card.svg.liquid          the social image background
  assets/
    css/                        site styles (ported), starlight/ (vendored base styles), code.css (emitted by the worker)
    js/                         client scripts (TypeScript sources under scripts/client, bundled by esbuild into here at build time)
    fonts/                      Poppins, Fira Code (from the fontsource packages), Outfit (social images)
    images/, icons/             from FE/src/assets
  scripts/
    code-worker.mjs             the highlighter worker (Expressive Code engine + twoslash), from Douze's reference worker
    build-client.mjs            esbuild bundle of scripts/client/*.ts into assets/js (a batch command step)
    convert-mdx/                the MDX converter (section 7)
    sidebar-from-ts.mjs         one-shot conversion of FE/config/sidebar to data/sidebars/*.yml
    update-*.ts, generate-*.ps1 the data updaters, moved from FE/scripts
  tests/
    e2e/                        the Playwright specs, moved from FE/tests/e2e
    unit/                       the unit tests that survive (section 11)
    parity/                     the structural diff harness (section 11.2)
src/tools/                      the generators, with the additions of section 6
src/statichost/                 StaticHost, with the changes of section 9
```

### 3.2 The workflow (`src/site/douze.yml`)

```yaml
site:
  content: content
  data: data
  includes: templates
  shortcodes: templates/shortcodes
  output: ../statichost/StaticHost/wwwroot     # -o wins; CI passes an explicit folder
  url: https://aspire.dev
  locales:
    default: en                                  # root is the content folder: /ja/... are the locale folders
    fallback: true                               # every untranslated page exists under every locale, as today
    languages:
      de: { label: Deutsch, lang: de }
      es: { label: Español, lang: es }
      ja: { label: 日本語, lang: ja }
      fr: { label: Français, lang: fr }
      it: { label: Italiano, lang: it }
      id: { label: Bahasa Indonesia, lang: id }
      zh-cn: { label: 简体中文, lang: zh-CN }
      pt-br: { label: Português do Brasil, lang: pt-BR }
      ko: { label: 한국어, lang: ko }
      tr: { label: Türkçe, lang: tr }
      ru: { label: Русский, lang: ru }
      hi: { label: हिन्दी, lang: hi }
      da: { label: Dansk, lang: da }
      uk: { label: Українська, lang: uk }
  serve: { port: 4321, markdown: sibling, redirects: redirects.json }   # /a/b/ negotiates to /a/b.md as StaticHost does
  external: [pagefind]

markdown:
  extensions: [pipetables, tasklists, attributes, autolinks, alerts, customcontainers]
  aside: { tag: aside, class: starlight-aside, kinds: [note, tip, caution, danger], titles-from: i18n }   # i18n.<locale>.aside.<kind>
  code: { passthrough: [mermaid] }
  images: { widths: [640, 1280], formats: [webp], quality: 82, output: assets/images }

steps:
  # data
  site-data:   { inputs: "data/**/*.{yml,json}", uses: data, with: { scope: site } }
  folder-data: { inputs: "content/**/*.{yml,json}", uses: data, with: { scope: folder, root: content } }

  # assets: fingerprinted css, js, fonts, icons; the client bundle, the icon css and the highlighter's base assets are produced first
  client-js:   { inputs: "scripts/client/**/*.ts", run: "node scripts/build-client.mjs {{ inputs }} {{ outputs }}", outputs: "assets/js/**", sources: ["scripts/build-client.mjs", "scripts/client/**"] }
  site-css:    { inputs: "assets/css/**/*.css", run: "node scripts/build-css.mjs {{ inputs }} {{ outputs }}", outputs: "assets/css/site.css", sources: ["scripts/build-css.mjs"] }   # lightningcss: bundle + minify
  code-assets: { inputs: "ec.config.mjs", run: "node scripts/code-worker.mjs --assets {{ outputs }}", outputs: "assets/code.*", sources: ["scripts/code-worker.mjs", "ec.config.mjs"] }
  assets:      { inputs: ["assets/**", "!assets/images/**", "!assets/css/**"], needs: [client-js, site-css, code-assets], uses: assets, with: { root: assets, output: assets } }

  # articles (paths after permalink are urls: the content folder is stripped)
  pages:       { inputs: ["content/**", "!content/**/*.{yml,json}", "!content/reference/api/**", "!content/exports/**"], needs: [site-data, folder-data, assets], uses: frontmatter, with: { require: [title] } }
  dates:       { needs: pages, uses: git, match: "content/**/*.md" }
  permalink:   { needs: dates, uses: permalink, with: { root: content } }
  collections: { needs: permalink, uses: collect, match: ["**/*.md", "!reference/api/**", "!*.liquid"] }
  localize:    { needs: [permalink, collections], uses: localize }
  og:          { needs: localize, uses: social-image, match: ["**/*.md", "!reference/api/**", "!hub/**"],
                 with: { template: og/card.svg.liquid, width: 1200, height: 630, output: "og{{ locale_url }}index.png",
                         skip: "og == false or ogImage or locale != 'default'",
                         text: [ { value: "{{ seoTitle | default: title }}", font: "Outfit Bold 60", fontfile: assets/fonts/Outfit-Bold.ttf, x: 80, y: 150, width: 1040, height: 240, color: "#ffffff" },
                                 { value: "{{ description | strip_markdown | truncate: 180 }}", font: "Outfit 32", fontfile: assets/fonts/Outfit-Regular.ttf, x: 80, y: 410, width: 1040, height: 140, color: "#cdd6f4" } ] } }
  paginate:    { needs: og, uses: paginate }
  render:      { needs: paginate, uses: liquid }           # pages, hub and samples templates, and the *.liquid output templates
  versions:    { needs: render, uses: replace, with: { tokens: { "%ASPIRE_VERSION%": "{{ versions.aspire }}", "%ASPIRE_VERSION_MAJOR_MINOR%": "{{ versions.majorMinor }}", "%ASPIRE_VERSION_PREVIEW%": "{{ versions.preview }}" } } }
  twins:       { needs: versions, uses: fork, match: ["**/*.md", "!reference/api/**"],
                 with: { permalink: "{% if url == '/index.html' %}/index.md{% else %}{{ url | replace: '/index.html', '.md' }}{% endif %}", data: { markdown: false, layout: false, twin: true } } }   # /get-started/x/ -> /get-started/x.md, / -> /index.md, /ja/ -> /ja.md (StaticHost's mapping)
  markdown:    { needs: twins, uses: markdown }
  headings:    { needs: markdown, uses: headings, with: { anchors: true, levels: [2, 3] } }
  collect-docs:{ needs: headings, uses: collect, match: ["**/*.html", "!reference/api/**", "!*/**/index.html.twin"], with: { content: true, name: docs } }   # English article contents for llms-full.txt
  exports:     { inputs: "content/exports/*.liquid", needs: collect-docs, uses: frontmatter }
  render-exports: { needs: exports, uses: liquid }
  code:        { needs: headings, run: "node scripts/code-worker.mjs", mode: worker, match: ["**/*.html", "!reference/api/**"],
                 sources: ["scripts/code-worker.mjs", "ec.config.mjs", "data/twoslash/aspire.d.ts"], with: { cache: .douze/code-cache }, env: { NODE_NO_WARNINGS: "1" } }

  # api reference: one template per route paginates its page index (section 5)
  api-pages:   { inputs: "content/reference/api/**", needs: site-data, uses: frontmatter }
  api-paginate:{ needs: api-pages, uses: paginate }
  api-render:  { needs: api-paginate, uses: liquid }     # .html templates render the pages, .md templates the twins (markdown: false, layout: false)

  # chrome and checks
  layout:      { needs: [code, api-render, render-exports], uses: layout, with: { includes: templates/layouts } }
  links:       { needs: layout, uses: links, match: ["**/*.html", "!reference/api/**"] }
  redirects:   { needs: site-data, uses: redirects, with: { data: redirects, manifest: redirects.json } }
  check-links: { needs: [links, redirects], uses: check-links, with: { ignore: ["/reference/api/**", "/i18n/**"], anchors: true } }   # emits nothing; an error fails the build
  write:       { needs: [links, redirects], uses: write }
  search:      { needs: write, run: "npx pagefind --site {{ site }} --glob \"**/*.html\" --glob \"!reference/api/**\"", timeout: 10m }
```

Notes on the shape:

- `localize` runs after `collections` so that `collections.urls` tells it which translations exist; the fallback
  copies render through the same `render -> twins -> markdown -> headings -> code -> layout` chain with the locale's
  chrome, which gives the 7,500 fallback routes of today for a few seconds of build.
- `og` is inline in the chain (it passes pages through and adds the PNGs to its units); the layout builds the
  `og:image` url with `social_image_url` and the same `output` template, or uses a page's `ogImage` front matter.
- The `.md` twins are taken after `render` and the placeholder replacement (Liquid resolved: shortcodes, includes,
  versions), which is better
  than today's raw MDX copies (whose JSX the agents see); their path follows StaticHost's mapping (`/docs/a/` ->
  `/docs/a.md`, `/` -> `/index.md`), so `MarkdownPathMapper` does not change.
- The API routes are a separate branch of the graph (no `localize`, no `git`, no `code`, no `links`): they join at
  `layout`. Their signatures and doc code blocks come pre-highlighted from the generators (section 6), so the code
  worker never sees the 24k API pages.
- `search` indexes articles, hub and samples only, as today (`pagefind: false` on API pages becomes a glob).
- The `layout` step reads layouts from `templates/layouts` (`layout: docs` is `templates/layouts/docs.liquid`) while
  `{% include %}` and `{% render %}` resolve against `templates/`, so partials are written as `partials/header`.

---

## 4. The chrome and component port

### 4.1 Layouts and partials

Starlight's page is reproduced as Liquid: `base.liquid` (html, head, body, skip link, header, mobile menu, sidebar
slot, main, footer, scripts), `docs.liquid` (the article frame: breadcrumbs, title with page actions, banner, content,
table of contents, previous/next, edit link, last updated, giscus slot), `splash.liquid` (hero pages: `index`,
`docs`, locale indexes), `api.liquid` (the API frame with the per-package sidebar and in-page search), `hub.liquid`,
`glossary.liquid`. Each of the 14 overrides becomes a partial with the same name under `templates/partials/`, so the
mapping is one to one and reviewable:

| Override (lines) | Partial | Notes |
|---|---|---|
| Sidebar (2,029) | `sidebar.liquid`, `sidebar-topics.liquid`, `sidebar-api.liquid` | topics from `data/sidebars/*.yml` with `nav_active`; the API sidebar from `api/pages` data inside `{% cache package.slug %}` (Douze 3.15); the filter box script ported as is |
| Search (767) | `search.liquid` | Pagefind UI as today (`/pagefind/pagefind-ui.js`), the C#/TS API notice, keyboard footer, `?q=` passthrough; the Starlight patch (re-init across swaps) disappears with `ClientRouter` (4.4) |
| Head (602) | `head.liquid` | fonts (`asset_url`), OG meta (`social_image_url`, `seoTitle`), JSON-LD from `structured-data` ported to a Liquid partial fed by page data, WCP cookie consent, analytics bridge, theme persistence; `ClientRouter` removed (4.4) |
| Header (584) | `header.liquid` | Install CLI modal, live indicator, Dev Hub, cookies, help |
| Footer (575) | `footer.liquid` | sections, AspireMap, ScrollToTop element |
| Banner (409) | `banner.liquid` | expiry from `bannerExpiresOn` checked in the browser (a build-time check would be stale in pages replayed from the CI cache), dismissal script |
| PageTitle (207) | `page-title.liquid` | page actions (share, chatgpt, claude, copilot: links built from the `.md` twin url, as the patched starlight-page-actions does) |
| Hero (186), MobileMenuToggle (165), MobileSiteLinks (155), PageFrame (85), SocialIcons (77), MarkdownContent (60), EditLink (41), SkipLink (7) | one partial each | `MarkdownContent`: breadcrumbs (`nav_breadcrumbs` and the `crumbs` flag), What's New publish date, image zoom script |

Starlight's own markup that the overrides wrap (the table of contents, the pagination links, the theme select, the
language select, the "last updated") is written as partials from Starlight's sources at 0.41.3 (MIT), with the same
class names, so the scoped styles and the e2e selectors keep working.

### 4.2 Styles

Three sources, all under `assets/css/`:

1. **Starlight base styles**, vendored from `@astrojs/starlight/style/*.css` (props, reset, markdown, util, asides,
   shiki/expressive-code hooks) and `@catppuccin/starlight`'s theme CSS at the pinned versions, with a `VENDOR.md`
   noting the versions and licenses. Starlight's cascade layers (`@layer starlight.base, starlight.core, ...`) are
   kept so the site's overrides keep their precedence.
2. **The site's global CSS** (`FE/src/styles`, 4,557 lines): copied as static files, with the `@fontsource` imports
   replaced by `@font-face` rules over `assets/fonts/` (the `assets` step rewrites the `url()` references to the
   fingerprinted font names, Douze 3.9, so no CSS file needs to be a template).
3. **The scoped component styles** (119 `<style>` blocks, about 19,200 lines): the largest single manual task of the
   migration. Each `.astro` component becomes a partial or a shortcode, and its `<style>` block becomes a section of
   `components.css` scoped by a class on the component's root element (`.sl-banner`, `.ar-member-card`, ...) instead
   of Astro's `data-astro-cid-*` attribute. A script (`scripts/convert-mdx/extract-styles.mjs`) does the mechanical
   part: for each component, extract the block, prefix every selector with the root class, and list the selectors
   that used `:global()` or `:where()` for a manual pass. Estimated: 2 weeks of a careful implementer, reviewed with
   the visual diff of 11.2.

The Expressive Code CSS and script are emitted by the code worker once per build (`assets/css/code.css`,
`assets/js/code.js`) from the engine's `getBaseStyles`/`getThemeStyles`/`getJsModules`, with the same `ec.config.mjs`.

### 4.3 Icons, CSS and JavaScript tooling (native tools first)

Rule for every delegated step: a fast native tool over a Node script when one exists with the needed fidelity
(macOS, Linux and Windows, x64 and arm64). Choices: Pagefind (native binary), esbuild (Go) for the client bundle,
lightningcss (Rust) for CSS bundling and minification (`scripts/build-css.mjs` runs `lightningcss --bundle --minify`
over `assets/css/site-entry.css`), libvips through NetVips in Douze for images and social images (resvg would be the
standalone alternative), and Node only for the Expressive Code engine with twoslash (section 5.4 of the Douze plan:
no native engine reproduces its frames, markers and collapsible sections, and twoslash needs the TypeScript compiler).

UnoCSS, used for icons only today (`presetStarlightIcons`, `presetIcons` with devicon, 26-class safelist), is
dropped: an SVG sprite built once by `scripts/icons-sprite.mjs` from Starlight's icon set and the devicon/mdi icons
the site uses, with the `icon` shortcode rendering `<svg><use href="/assets/icons.svg#name">`. `starlight-plugin-icons`' `pluginIcon` for Expressive Code frames stays in the worker's
`ec.config.mjs`; its `FileTree` component becomes the `filetree` shortcode (icons by extension from the same icon set,
rendered as inline SVG by the `icon` shortcode from a vendored sprite built once by `sidebar-from-ts.mjs`'s sibling
`icons-sprite.mjs`).

### 4.4 Client scripts and `ClientRouter`

The 73 script tags become TypeScript modules under `scripts/client/` bundled by esbuild (`client-js` step) into
`assets/js/*.js`, plus the `is:inline` ones kept inline in partials (theme pre-paint, banner pre-paint, sidebar state
restore). `<ClientRouter fallback="swap">` (Astro view transitions) is **dropped**: every page load is a full
document load, with `@view-transition { navigation: auto }` in CSS for the cross-document animation in browsers that
support it. Consequences, all simplifications: the `astro:page-load` / `astro:before-swap` re-initialization code in
the components (search, API search, twoslash hover, mermaid, tooltips, deployment guard, sidebar state) becomes plain
`DOMContentLoaded` code; the Starlight Search patch and `deployment-guard.ts` are not needed; `prefetch` is replaced
by `<link rel="prefetch">` on hover with a 20-line script (the `speculationrules` API where available). Risk: the e2e
specs named `*-navigation` assert behavior after navigations and some may listen for Astro's events; section 11.1
lists them for adjustment.

The 7 custom elements port unchanged (they are framework-free).

### 4.5 Components to shortcodes

Section 7.2 has the table. Rules: a Starlight built-in or a site component with a Markdown body becomes a paired
shortcode (`block: true`); one with scalar props an inline one; the markup and class names are those of the Astro
component, so its scoped styles (4.2) apply unchanged; a component with a `<script>` keeps it as a module in
`scripts/client/` loaded by the layout when the page's `components` metadata lists it (the shortcode sets
`{% assign components = components | push: "pivot" %}`... simpler: the layout always loads the small bundle; the
components' scripts are about 20 KB minified in total).

### 4.6 Data-driven pages

`hub/*`, `reference/samples/[sample]`, `hub/glossary/[term]`, `get-started/glossary`, the integrations gallery, the
contributors page and `whats-new` indexes use the same data files as today (moved under `data/`) through paginated
templates (`pagination: { data: samples, size: 1, alias: sample }`, `permalink: "reference/samples/{{ sample.slug }}/"`)
and the `markdownify` filter for Markdown fields (sample readmes, glossary definitions). The `.md` endpoints of hub,
samples and glossary become `fork` twins or a second paginated template with `markdown: false`. The CLI schema
routes are two templates over `data/schemas` (`schema.json.liquid` with `permalink: /reference/cli/configuration/schema.json`,
and a paginated `schema/[version].json.liquid`), the `.well-known/agent-skills/index.json` with its digests is computed
by the existing `compute-skill-digests.mjs` as a `batch` step before `assets`, and the samples' OG images are a second
`social-image` step over the samples pages.

---

## 5. The API reference on Douze

### 5.1 Routes as paginated templates over a page index

The generators emit, per package, a **page index** (`data/api/pages/csharp/{package}.json`, `typescript/{module}.json`):
the list of every page of that package with its url, kind and the keys needed to find its data:

```json
{ "package": "Aspire.Hosting", "slug": "aspire.hosting", "pages": [
  { "kind": "package", "url": "/reference/api/csharp/aspire.hosting/", "md": "/reference/api/csharp/aspire.hosting.md" },
  { "kind": "type", "url": "/reference/api/csharp/aspire.hosting/aspire.hosting.distributedapplication/", "type": 12, "md": "..." },
  { "kind": "members", "url": ".../aspire.hosting.distributedapplication/methods/", "type": 12, "memberKind": "method", "md": "..." } ] }
```

Douze's `paginate` takes one array, so the generator flattens the index into one file per **route kind**
(`data/api/routes/csharp-types.json`: 1,810 entries with `package` and `type` keys; `csharp-members.json`: 2,829;
`typescript-items.json`: 8,466; `typescript-members.json`: 10,634; and the package and module lists), and one template
per route under `content/reference/api/` paginates its file with a size of 1, the shape the Douze benchmark harness
already uses for this data (19,712 pages in 2.9 s):

```liquid
---
layout: api
pagination: { data: api.routes.csharp-types, size: 1, alias: route }
permalink: "{{ route.url }}"
---
{% assign pkg = api.pkgs[route.file] %}{% assign type = pkg.types[route.type] %}   # route.file is the data file key, e.g. Aspire.Hosting.13.6.0
{% render 'api/type-hero', type: type, pkg: pkg %}
```

The templates are `csharp-index.html`, `csharp-package.html`, `csharp-type.html`, `csharp-members.html`,
`typescript-index.html`, `typescript-module.html`, `typescript-item.html`, `typescript-member.html`, each with a
`.md` sibling template (`markdown: false`, `layout: false`, `permalink: "{{ route.md }}"`) that renders the twin
from the same data. Templates reach the full data through site data:
`api.pkgs[pkg.file].types[page.type]` (the `data` step keys `data/api/pkgs/Aspire.Hosting.13.6.0.json` as
`api.pkgs["Aspire.Hosting.13.6.0"]`), and the `xref` map (5.3) for links. Every lookup is a dictionary or array
index on shared nodes: no scans.

### 5.2 Components to partials

The 19 `.astro` files of `FE/src/components/api-reference` (4 unused: `InheritanceDiagram`, `MemberList`,
`MemberSignatureName`, `RemarksBlock`, dropped) become Liquid partials under `templates/api/` with the same markup:
`type-hero`, `type-signature`, `member-card`, `member-card-base`, `member-overview-list`, `enum-table`, `doc-content`
(recursive over the doc node tree: `{% render 'api/doc-node', node: child %}` for `para`, `list`, `cref`, `langword`,
`paramref`, `code`, `codeblock`, `href`), `examples`, `polyglot-attribute-panel`, `nuget-button`, `ts-member-card`,
`anchor-heading`, `api-search-bar`, `inpage-search`, `version-filter`. The two `.ts` files (`inpage-search-sync`,
`search-lifecycle`) and the per-page `ApiSearchController` scripts move to `scripts/client/api/`. The signatures and
code blocks use the pre-highlighted HTML of 5.4 instead of `<Code>`.

The per-package sidebar (`api-sidebar.ts`, `ts-api-sidebar.ts`) becomes `sidebar-api.liquid` rendered inside
`{% cache "api:" | append: pkg.slug %}` once per package (Douze 3.15), with the active item marked by a `replace` on
the fragment; the TS pages keep their breadcrumb-like nesting (module, item, member, headings), which is per page and
cheap.

### 5.3 Cross references

`data/api/xref.json`, emitted by the generators: `{ "T:Aspire.Hosting.DistributedApplication": { "url": "...", "kind": "type", "package": "Aspire.Hosting" }, "M:Aspire.Hosting.ResourceBuilderExtensions.WaitFor(...)": { "url": ".../methods/#waitfor-...", "ts": { "url": "/reference/api/typescript/aspire.hosting/distributedapplicationbuilder/waitfor/", "capabilityId": "..." } }, ... }`
plus `data/api/xref-names.json`: the member-name index that `<ApiReference name="Aspire.Hosting.X.Y">` resolves
through today (`{ "Aspire.Hosting.ResourceBuilderExtensions.WaitFor": { "csharp": "...", "typescript": "...", "overloads": [...] } }`,
with the same disambiguation rules and diagnostics as `csharp-provider.ts` / `typescript-provider.ts`, moved into
`PackageJsonGenerator` where Roslyn has the symbols and attributes). The `api` shortcode reads it:
`{% api "Aspire.Hosting.ResourceBuilderExtensions.WaitFor" %}` renders the two `<a class="ar-lang" data-lang>` links,
and `{% error %}`s on a missing or ambiguous name, which is today's unit test (`api-reference.vitest.test.ts`) turned
into a build error. `DocContent` crefs resolve through `xref` (the same-package restriction of today is lifted for
free: every package's types are in the map; external crefs stay `<code>`).

### 5.4 Highlighting

Signatures (about 50k) and the 235 `codeblock` doc nodes plus examples are highlighted **by the generators** (section
6), as HTML with `tok-*` classes, styled by `assets/css/api-code.css` with the two Expressive Code themes' colors.
The articles' fences keep Expressive Code (the worker). This keeps the 24k API pages out of the worker and the build
deterministic without Node for the API part. The frame, title and copy button markup of today's `<Code>` around a
signature is reproduced by the `member-card` partial (static markup, the copy button script is shared with the
worker's).

### 5.5 Search

The landing pages embed their index as today (`<script type="application/json" data-api-search-index>` with
`{{ api["search-csharp"] | json }}`), from `data/api/search-csharp.json` and `search-typescript.json` emitted by the
generators (the same entries as `IndexEntry` and `buildTsApiSearchIndex`); the per-package and per-type indexes are
built the same way from the page's data. The client controller is unchanged. (A later change could load the 13.6 MB
TS index with `fetch`; not in this plan, since `api-search-contract` asserts the inline element.)

### 5.6 Markdown twins

The `.md` templates of 5.1 reproduce `csharp-api-markdown.ts` and `typescript-api-markdown.ts` (1,677 lines of
TypeScript become about the same number of Liquid lines; `api-markdown.vitest.test.ts` is ported as a Douze
`CommonTests`-style fixture test in `tests/unit/`), including the 37 TS legacy aliases (a `legacy` list in the route
index). StaticHost's mapping is unchanged.

---

## 6. Generator changes (`src/tools`)

Both generators keep their inputs and their daily job (`update-integration-data.yml`); they emit more. Each
addition is a `--emit` option of the existing commands, with tests in `tests/*Generator.Tests` and a golden-file
test on one small package.

**PackageJsonGenerator**

1. **Slugs** on every type and member: `slug` (today's `slugify(name, arity)`), `packageSlug`, `url`, and member
   anchors with today's rules (`api-member-anchors.ts`: signature-based slug, FNV-1a hash on collisions, aliases),
   so that templates never compute a url.
2. **Pre-highlighted HTML**: `signatureHtml` next to `signature` for types and members, and `html` next to `text`
   for `codeblock` doc nodes and examples, produced by Roslyn's `Classifier.GetClassifiedSpans` over a syntax tree of
   the signature (the generator already has the compilation) and mapped to `tok-keyword`, `tok-type`, `tok-member`,
   `tok-param`, `tok-string`, `tok-comment`, `tok-punct` classes; type names inside signatures are wrapped in
   `<a href>` through the xref map when the type is documented. Size: about 30% more per package file.
3. **The route index** (`data/api/routes/csharp-*.json`, 5.1), **`xref.json`** and **`xref-names.json`** (5.3),
   **`search-csharp.json`** (5.5): emitted by a new `index` command that reads every package file after the batch
   (`generate-package-json.ps1` calls it last), since routes and xrefs span packages.
4. `normalize-generated-api-data.ts` runs before the index (unchanged); `validate-generated-api-data.ts` gains
   checks for the new fields.

**AtsJsonGenerator**

1. Slugs with today's disambiguation (`ts-api-routes.ts`: `createSlugIndex`, `normalizeTypeReference`, `-2` suffixes,
   member anchors), and the `legacy` aliases.
2. `signatureHtml` from a small TypeScript signature tokenizer (keywords, identifiers, type references, string
   literals, punctuation: the signatures are regular, generated text), same classes.
3. The TS route index, its part of `xref.json` (capability ids to urls, for the `ts` twins) and `search-typescript.json`.

**Twoslash types** (`generate-twoslash-types.ts`, `aspire.d.ts`) are unchanged: the code worker loads the same file.

**Data location**: the updaters (`FE/scripts/update-*.ts`, `generate-*.ps1`, `update-integration-data.ps1`) move to
`src/site/scripts/` and write under `src/site/data/`; the workflow's allowed paths list changes accordingly. The
updaters run in Node today and keep doing so (they are not part of the site build).

---

## 7. Converting the articles

### 7.1 The converter (`src/site/scripts/convert-mdx/`)

A Node script run once per file (and re-runnable: the conversion is idempotent on already converted files, which it
detects by the absence of `import` lines and JSX), with a report. It parses each `.mdx` with `remark-parse`,
`remark-frontmatter`, `remark-gfm`, `remark-directive` and `remark-mdx` (the same unified stack MDX uses) into mdast
with `mdxjsEsm`, `mdxJsxFlowElement`, `mdxJsxTextElement`, `mdxFlowExpression` and `mdxTextExpression` nodes, then
rewrites the **source text by position** (from the last node to the first, so offsets stay valid): only the JSX and
ESM ranges are replaced, everything else (prose, fences, tables, directives) is kept byte for byte, which is what
makes the diff reviewable.

For each `mdxJsxFlowElement` / `mdxJsxTextElement`:

1. Look up the component in the mapping table (7.2); unknown components are reported (`unknown-component`) and the
   file is left unconverted.
2. Convert each attribute: a string literal as is; an expression (`{...}`) evaluated statically with `acorn` when it
   is a literal, array, object, template literal without substitutions or an imported identifier (an image import
   becomes its asset path, a JSON import its data key), else reported (`expression-attribute`).
3. Emit `{% name arg1, key: value %}`; for a paired component, recurse into the children (their source ranges), then
   `{% endname %}`. Children that are `mdxFlowExpression` (`{/* comment */}`) are dropped; other expressions are
   reported.
4. `<Fragment>` is unwrapped; `<Aside>` with a plain body becomes a `:::kind[Title]` container (the directive the site
   already uses 299 times), with a `:::` fence longer than any inside it.

`mdxjsEsm` (imports, exports) are removed after their bindings were collected. Named exports (none in the content
today) are reported. `%ASPIRE_VERSION%` placeholders are kept (the `replace` step handles them, inside fences too).
The remark plugin `remark-typescript-first-apphost-tabs` (TypeScript tab before the C# tab in `aspire-lang` tab sets)
is applied once by the converter to the source order. Front matter is kept as YAML, with these changes: `template:
splash` -> `layout: splash`; `prev`/`next` kept; `sidebar: { order }` kept for a check that the data sidebar agrees;
`tableOfContents` kept; `lastUpdated` removed; `updated` and `created` written from the git history of the original
`.mdx` path (the move and rewrite defeat git's rename detection, so the `git` step would date every article at the
conversion commit; the layout prefers front matter dates when present); `hero` kept (the splash layout reads it).

Images: `import x from '@assets/foo.png'` + `<Image src={x} alt="..." />` becomes `{% image "/assets/images/foo.png",
alt: "..." %}` (the `assets` folder is copied once from `FE/src/assets`); `<ThemeImage light={a} dark={b} />` becomes
`{% image light: "...", dark: "...", alt: "...", zoomable: true %}`. SVG imports become plain paths.

Reports (`convert-report.json` and a Markdown summary): per file, the constructs converted (counts by component) and
the problems (`unknown-component`, `expression-attribute`, `expression-child`, `export`, `raw-html-with-jsx`), so the
manual queue is the list of files with problems. Expected from the inventory: the 30 mapped components cover more
than 95% of usages; the long tail (about 40 components used fewer than 10 times, 4 files importing JSON, 1 importing
`tsconfig.json?raw`, 4 `<details>`, the homepage and hub pages written as JSX-heavy MDX) is manual: about 25 files.
The converter runs on `ja/` with the same table.

### 7.2 Component mapping

| Component (uses) | Shortcode | Kind | Notes |
|---|---|---|---|
| Tabs / TabItem (1,174 / 2,485) | `{% tabs sync: "aspire-lang" %}` / `{% tab "C#", icon: "seti:c-sharp" %}` | block | `syncKey` -> `sync`; the tab script keeps the `starlight-synced-tabs__<key>` localStorage keys |
| Aside (837) | `:::note[Title]` container, or `{% aside "tip", title: "..." %}` when the body has a nested `:::` | block | one `starlight-aside` markup for both, titles from `i18n.aside` |
| ApiReference (1,433 tags in 296 files) | `{% api "Aspire.Hosting.X.Y" %}`, `{% api "...", package: "...", parameter_types: [...] %}` | inline | reads `xref-names`; build error on diagnostics |
| LearnMore (477) | `{% learnmore %}...{% endlearnmore %}` | block | |
| Include (422) | `{% include_markdown "reference/cli/includes/x.md" %}` | tag | Douze 3.4; the 14 partials get `permalink: false` through `content/reference/cli/includes/includes.yml` |
| Image (342) | `{% image "...", alt: "..." %}` | inline | width and height, WebP variants, lazy (Douze 3.8, phase S4) |
| Steps (257) | `{% steps %}...{% endsteps %}` | block | ordered list body |
| ThemeImage (156) | `{% image light: ..., dark: ..., alt, zoomable, href, label %}` | inline | |
| Badge (136) | `{% badge "New", variant: "tip", size: "small" %}` | inline | |
| LinkButton (131) | `{% linkbutton "/x/", variant: "secondary", icon: "right-arrow" %}Text{% endlinkbutton %}` | block, `display: inline` | |
| Pivot / PivotSelector (123 / 8) | `{% pivot "csharp" %}...{% endpivot %}`, `{% pivot_selector key: "aspire-lang", title: "...", options: [{ id: "csharp", title: "C#" }, ...] %}` | block / inline (`display: block`) | the `aspire-pivot-selector` element script |
| Kbd (79) | `{% kbd "Ctrl+C" %}`, `{% kbd mac: "Cmd+C", windows: "Ctrl+C" %}` | inline | starlight-kbd markup |
| InstallDotNetPackage (67), InstallPackage (29) | `{% install_dotnet_package "Aspire.Hosting.Redis" %}`, `{% install_package "...", short_name: ..., cli_only: true %}` | inline (`display: block`) | render tabs + fences through `markdownify` and the code worker |
| Icon (62) | `{% icon "open-book" %}` | inline | inline SVG from the sprite |
| OsAwareTabs (53) | `{% os_tabs sync: "terminal" %}{% tab "Windows" %}...{% endtab %}...{% endos_tabs %}` | block | the two slots become two tabs |
| LicenseBadge (49), LinkCard (38), CardGrid / Card (14 / 7), IconLinkCard (8), CapabilityGrid (8), CTABanner (7), FeatureShowcase (6), TopicHero (5), ReleaseCommunity (13), ContainerImages (35), SimpleAppHostCode (25), FileTree (27), Code (9), Expand (4), AsciinemaPlayer (4), YouTubeEmbed, GitHubRepoStats, ContributorList, ImageShowcase | one shortcode each, same name in snake case | per component | data-reading ones (`container_images`, `release_community`, `github_repo_stats`) read the moved data files through the model |
| HomePage, HeroSection, QuickStartJourney, AspireMap, NotFoundPage, Integrations, SampleGrid, SessionGrid, LiveVideosTabs, TerminalShowcase, ContainerImageCatalog, ContainerRuntimeChoices, LoopingVideo/Image, TwitchEmbed, CodespacesButton, IconAside, ThemeAwareImage | partials of the splash and hub layouts, or shortcodes written by hand | manual | used once or twice, on the homepage, hub, 404 |

### 7.3 Validating the conversion

1. **The converter's own tests** (`tests/unit/convert-mdx.test.ts`): a fixture per mapped component, nested cases,
   attribute expressions, image and JSON imports, the Aside-to-directive rule, idempotence, a file with every problem
   kind reported.
2. **Round trip on the real content**: convert every file, build with Douze, and compare each article's rendered
   HTML with the Astro build's through the structural diff of 11.2 (text content, headings with ids, link targets,
   fence count and languages, image count, aside count, tab labels). A page whose diff is not empty is in the manual
   queue with the diff.
3. **The Playwright suite** (11.1) on the converted site.
4. **Spot checks by a reviewer** of 30 pages chosen by the diff's residual noise, in both themes, on desktop and
   mobile (the e2e projects).

The converter is run once at M5 to produce the committed Markdown; from then on authors write Markdown and
shortcodes, and `src/frontend/src/content` is frozen (a CI check fails a PR that touches it after M5).

---

## 8. Locales

Strategy: **keep the 15 locales and the fallback behavior**; let Douze render the fallbacks (`site.locales.fallback:
true`; the locale folders are the children of the content folder, so `/ja/get-started/x/` is `content/ja/get-started/x.md`
and its `locale_url` is `/get-started/x/`): the 7,500 fallback routes exist as today, with the locale's chrome, the
"this page is not translated yet" notice (`fallback` metadata), `hreflang` alternates from `alternates`, and
`lang`/`dir`. The cost is seconds. The
alternative (serving English from StaticHost for missing locale paths) would change the url set, the sitemap and the
notice, for no benefit.

- UI strings: `FE/src/content/i18n/*.json` move to `data/i18n/` unchanged (nested keys; the 37 keys missing in 14
  locales fall back to English through `t`).
- Sidebar labels: `data/sidebars/*.yml` carry `label: { en: ..., fr: ... }` from the TypeScript `translations`,
  converted once by `sidebar-from-ts.mjs` (which evaluates the modules with Node and writes YAML); `nav_label: lang`
  picks the locale's label.
- Locale selector: the `language select` partial lists `site.locales.languages` (exposed by Douze in the settings
  scope, with a recorded dependency) and links `locale_url`.
- The API reference stays English only: the templates live outside `docs/`, so `localize` ignores them, and the
  locale-prefixed `/ja/reference/api/...` links are rewritten to the root by the sidebar partial (as
  `route-data-middleware` does today). StaticHost's 308 for localized API paths (today in `src/middleware.ts`, SSR
  only, so never active in production) is added to StaticHost as a redirect rule (section 9).
- `whats-new`, hub, samples and glossary are English only, as today.
- **Lunaria** (`/i18n/` dashboard, computed from git during the Astro build): dropped from the site build. It can
  run as its own scheduled workflow publishing to a static page later; nothing in the e2e suite covers it, and the
  "translate this page" link of `EditLink` points at the repository's translation guide instead.

---

## 9. Hosting: StaticHost and the AppHost

StaticHost keeps serving a static folder; the changes are small and each has a test in `tests/StaticHost.Tests`:

1. **Embedding the output.** The `ProjectReference` to `frontend.esproj` is replaced by an MSBuild target in
   `StaticHost.csproj` (`BuildSite`, before `Build` when `BuildSite=true`, which CI and `aspire publish` set): runs
   `douze -s ../../site -o $(MSBuildProjectDirectory)/wwwroot` (the tool restored through `dotnet tool restore` from
   `.config/dotnet-tools.json`). `build-static-host.mjs` goes away. `MapStaticAssets` keeps serving `wwwroot`.
2. **Immutable caching**: `Caching.targets` matches `assets/**` whose name carries a fingerprint
   (`*.[0-9a-f]{8}.*`) instead of `_astro/*`; `pagefind/*` is cached for a day; the `og/*.png` for a week.
3. **Redirects**: a `RedirectsMiddleware` reads `wwwroot/redirects.json` (Douze 3.13) at startup and answers 301
   (302 for `/whats-new/`) before static files, so clients get real redirects; the stub pages stay for crawlers and
   static previews. It also carries the two rules of `src/middleware.ts` (localized API paths to the root, trailing
   slash on `.md` and schema `.json` paths).
4. **Markdown negotiation**: unchanged (`MarkdownPathMapper`'s rules are what the `twins` step writes); the stale
   "DocFX-rendered" comment is fixed; `MarkdownNegotiationTests` gain a case for a fallback locale page.
5. **Canonical case redirects, 404 page, `Link` headers, live status, install scripts, Brotli**: unchanged.
6. **`aspire-brand.css`** linked from `FE/src/styles` by the csproj moves to `src/site/assets/css/`.

AppHost (`src/apphost/Aspire.Dev.AppHost/AppHost.cs`): in run mode, `AddViteApp("frontend", ...)` becomes an
executable resource running `douze serve -s ../../site --port 4321` (the `/api/live` proxy of the Vite config
becomes a `serve.proxy: { "/api/": "{{ env.ASPIRE_STATICHOST_URL }}" }` setting if Douze's dev server gains one;
until then the live-status client reads `ASPIRE_STATICHOST_URL` injected as a `<meta>` by the layout in `serve`
mode). Publish mode is unchanged.

---

## 10. CI

`frontend-build.yml` becomes `site-build.yml` (called by `ci.yml` on changes under `src/site`, `src/tools`,
`src/statichost`):

1. **build**: `actions/setup-dotnet` (`global.json`), `dotnet tool restore` (Douze from the Feedz preview feed
   during the migration, nuget.org after its first release), `actions/setup-node` 24 + `pnpm install
   --frozen-lockfile` in `src/site` (the workers), `actions/cache` of `src/site/.douze` keyed on the runner OS and
   Douze's version with `restore-keys` for the latest (the disk cache makes warm builds about a minute; a cold build
   is the budget of 11.3), then `douze -s src/site -o dist --plain --fail-fast --timeline timeline.html`, upload
   `dist` and `timeline.html` as artifacts; the PR comment with page counts comes from `douze`'s summary line.
2. **validation**: `pnpm lint` (eslint over `scripts/`), `pnpm test:unit` (what survives of Vitest: the converter,
   the worker, the client scripts, the data updaters, the api-markdown fixture test; the Astro-specific tests are
   removed with the components they tested), `dotnet test` of the generators and StaticHost.
3. **e2e**: unchanged matrix (3 projects × 2 shards), `playwright.config.mjs`'s `webServer` becomes StaticHost
   serving the downloaded `dist` (`dotnet run --project src/statichost/StaticHost --no-build` with `wwwroot` pointed
   at the artifact), so the tests run against what production serves (negotiation, redirects, 404, headers), not
   `astro preview`.
4. **report** and **gate**: unchanged.

`update-integration-data.yml` keeps its schedule; its paths and the allowed-files list move to `src/site/data`. The
`build-profile` label runs `douze --trace` instead of the Node profiler. `tools-tests.yml` is unchanged.

---

## 11. Parity validation

### 11.1 The Playwright suite is the gate

The 47 specs (465 tests) stay the acceptance criterion: M7 ends when the suite is green on Douze's output in the
three projects. They are grouped by what they need:

- **Unchanged** (run as they are once the chrome is ported): analytics-scripts, banner, cookie-consent,
  cookie-dialog-layout, homepage, install-modal-navigation, integrations-gallery, live-*, looping-image,
  markdown-rendering, og-metadata, pivot-selector, rss, schema-routes, site-search, site-tour, wcag-aa, webmcp,
  featured-samples, filter-navigation, gallery-search-contract, dev-* (the Dev Hub), mobile-ux, ui-regressions.
- **API** (the first to pass, at M2, with a temporary minimal chrome): api-cross-language-navigation,
  api-markdown-routes (and the separate `playwright.api-markdown.config.mjs`, which then runs against StaticHost too),
  api-reference-deep-links, api-search-contract, search-visual-parity, ts-api-search, ts-api-sidebar.
- **To adjust for full page loads** (4.4): deployment-navigation, mermaid-navigation, route-style-navigation,
  site-ui-navigation, twoslash-navigation, custom-components (deferred AppHost examples): they assert state after
  navigations; where they wait for `astro:page-load` they wait for `load` instead. The adjustment is made against
  the Astro build first (the tests must still pass there), so the suite never encodes a Douze-specific behavior.

### 11.2 The structural diff harness (`src/site/tests/parity/`)

Built in M1 against the Astro output, used at every phase: for a list of urls (every article in English and `ja`,
50 fallback pages, 200 API pages sampled by kind, the hub, samples, glossary, feeds, sitemap, llms files, 20 `.md`
twins), load both outputs, normalize (remove `data-astro-*` attributes, hashed asset names, `<script>` bodies,
whitespace, the generated ids of Expressive Code, the build date), and compare per page: text content of `main`,
the heading list with ids, the link targets (internal), the image count and `alt`s, the fence count and languages,
the aside, tab and step counts, the meta tags (`og:*`, `canonical`, `hreflang`), and the `.md` twin's headings. The
report lists the pages with differences and the kind; a visual diff (Playwright screenshots of 30 pages in both
themes, compared with a 1% threshold) runs on demand for the chrome work.

### 11.3 Performance in CI

Measured in M7 on the CI runner (`ubuntu-24.04`), recorded in this document's section 2 when done: cold build
(no `.douze`, no code cache) under 6 minutes; warm build (cache restored, no content change) under 90 seconds; peak
RSS of `douze` under 2 GB; the Node workers' time listed per step from `timeline.html`. The Douze repository's
`bench/README.md` keeps the API reference numbers; this repository's numbers are the full site's.

---

## 12. Phases

Model and effort: Opus at Medium by default; **High** where marked; **review** phases end with a review by the
planning model before dependents start. Each phase is a PR (or a short series) on `douze-migration`, rebased on
`main` weekly; `main` keeps shipping with Astro until M8. Sizes: S a few days, M one to two weeks, L three to four
weeks.

### M0: generators emit the page-shaped data (M, High, review)

**Needs** nothing from Douze. **Owns** `src/tools/*`, `tests/*Generator.Tests`, `src/site/data/api/` (the first
files of the new folder), `FE/scripts/generate-*.ps1` (an `index` call at the end), `validate-generated-api-data.ts`.
**Does** section 6: slugs and anchors, `signatureHtml`, route indexes, `xref.json`, `xref-names.json`, search indexes,
golden tests, the `ApiReference` resolver moved into the C# generator with its diagnostics and a test that the 1,433
usages of today resolve identically (a script compares the old resolver's output on every usage with the new map).
**Done when** the daily job produces the new files and the comparison script reports zero differences in resolved
urls for every `<ApiReference>` and every type and member url of today's routes.

### M1: parity harness and e2e adjustments (S)

**Needs** nothing. **Owns** `src/site/tests/parity/`, the `*-navigation` specs. **Does** 11.2 against the Astro
output of `main` (stored as a CI artifact of a reference build), and the 11.1 adjustments for full page loads,
merged to `main` (they pass on Astro). **Done when** the harness reports zero differences between two Astro builds
(a sanity run) and the adjusted specs pass on `main`.

### M2: the API reference on Douze (L, High, review)

**Needs** Douze S1 (shortcodes are not needed here, but the `markdown:` section and `StateHash` are) and S5's `cache`
tag; until S5 lands, the sidebar is rendered per page (correct, slower). **Owns** `src/site/douze.yml` (the API
branch of the graph), `src/site/content/reference/api/`, `src/site/templates/api/`, `templates/layouts/api.liquid`
with a minimal `base.liquid` (no chrome: the header and footer partials are placeholders until M3), `assets/css/api-*.css`
(moved `api-reference.css` and the signature classes), `scripts/client/api/`, `tests/unit/api-markdown` fixture.
**Does** section 5. **Done when** the 7 API specs and `api-markdown-routes` pass against StaticHost serving Douze's
output (the chrome placeholders are enough for them), the parity harness reports no differences on the 200 sampled
API pages beyond the chrome, and the API build takes under 30 s on the CI runner.

### M3: the chrome port (L, High, review)

**Needs** Douze S1, S3 (navigation and locales), S4 (assets, images, social images) from the preview feed; M2 for
the last step (the API pages wearing the chrome). **Owns**
`templates/layouts/*`, `templates/partials/*`, `assets/css/*` (except `api-*`), `assets/fonts`, `scripts/client/*`
(except `api/`), `uno.config.ts`, `scripts/build-client.mjs`, `data/sidebars/*`, `data/i18n/*`, `data/site.yml`,
`scripts/sidebar-from-ts.mjs`, `scripts/icons-sprite.mjs`. **Does** section 4 (layouts, partials, the three CSS
sources, icons, client scripts without `ClientRouter`, the sidebar data conversion) and section 8's chrome parts, on
a handful of hand-converted pages (`index`, `docs`, `get-started/first-app`, a page with tabs and asides, one `ja`
page) used as the fixture. **Done when** the visual diff of those pages in both themes and three viewports is under
the threshold, the unchanged specs that only need the chrome (banner, cookie-*, install-modal-navigation, site-tour,
site-search with Pagefind, wcag-aa on the fixture pages) pass, and the API pages wear the real chrome.

### M4: the converter (M, High, review)

**Needs** Douze S1 (shortcodes, `include_markdown`), S2 (headings, replace, twins), S4 (`image`). **Owns** `scripts/convert-mdx/*`,
`templates/shortcodes/*` (section 7.2, written against the components' markup), `tests/unit/convert-mdx*`,
`scripts/code-worker.mjs` + `ec.config.mjs`. **Does** sections 7.1 and 7.2, dry runs on the whole content with the
report, the code worker configured as today's Expressive Code. **Done when** the dry run converts at least 90% of
the files with no problem reported, every shortcode has a fixture test, and 30 converted pages pass the structural
diff.

### M5: articles, locales, outputs (M)

**Needs** M3, M4; Douze S2, S3, S4, S5 (`links`, `check-links`). **Owns** `content/**` (the converted articles committed, `ja` included, the
glossary, hub and samples templates, the feeds, sitemap, llms templates, 404), `data/redirects.yml`, `og/card.svg.liquid`,
the rest of `douze.yml`. **Does** the conversion run, the manual queue (about 25 files), the data-driven pages
(4.6), locales (8), social images, redirects, llms outputs (reproducing `starlight-llms-txt`'s three files: an index
with descriptions, the full export from `collect` with `content: true` over `docs/**` in English, the small one
excluding the sections the config excludes today), RSS, sitemap with `locale_pages`, Pagefind with the same
`data-pagefind-*` attributes. **Done when** the structural diff is clean on every English and `ja` article and the
50 sampled fallbacks, and the site-wide outputs diff clean after normalization (dates, ordering).

### M6: hosting and CI (S)

**Needs** M2 (the first full Douze output); Douze S6 for the AppHost's `douze serve` (the CI part needs nothing). **Owns** `src/statichost/*`, `tests/StaticHost.Tests`, `src/apphost/*`,
`.github/workflows/site-build.yml`, `ci.yml`, `update-integration-data.yml`, `.config/dotnet-tools.json`. **Does**
sections 9 and 10, with the Astro workflow still running in parallel on `main` (the Douze workflow runs on the branch
only, `continue-on-error` until M7). **Done when** StaticHost tests pass with Douze's output and the e2e job runs
against StaticHost.

### M7: parity and performance (M, review)

**Needs** M5, M6; Douze S7 (the release). **Does** the full suite in CI on the branch until green (expected: a few
dozen selector and timing fixes, a handful of real regressions), the performance measurements of 11.3, a week of
`douze serve` use by the docs writers with the feedback fixed, Lighthouse on 10 pages compared with `main`.
**Done when** 11.1 is green in three consecutive runs, 11.3 is within budget, and the review signs off on the diff of
the whole branch against `main` (about 2,500 files).

### M8: cutover (S)

**Does** merge `douze-migration` into `main` after a last rebase; delete `src/frontend` (the content is now
`src/site/content`), `frontend-build.yml`, the pnpm patches, `lunaria`; update `README.md`, `CONTRIBUTING.md`,
`CODESPACES.md`, the `.agents/skills/doc-writer` skill (it describes Astro and MDX today), the PR templates; keep
the reference Astro build artifact of M1 for a month for comparisons. **Done when** production serves the Douze build
and the daily data job has run once on `main` with the new generators.

### Summary

| Phase | Needs (Douze) | Needs (site) | Size, effort | Review |
|---|---|---|---|---|
| M0 generators | | | M, High | yes |
| M1 parity harness | | | S | no |
| M2 API reference | S1 (S5 for the sidebar cache) | M0, M1 | L, High | yes |
| M3 chrome | S1, S3, S4 | M1, M2 (last step) | L, High | yes |
| M4 converter | S1, S2, S4 | | M, High | yes |
| M5 articles and outputs | S2, S3, S4, S5 | M3, M4 | M | no |
| M6 hosting and CI | S6 (dev server only) | M2 | S | no |
| M7 parity and performance | S7 | M5, M6 | M | yes |
| M8 cutover | | M7 | S | no |

M0, M1 and the Douze S1 start together; M2 and M3 run in parallel (different folders); M4 runs in parallel with M2
and M3 once S1 and S2 are on the preview feed; M6 can start as soon as M2 produces output.

---

## 13. Roadmap across both repositories

The same table as section 6 of `docs/site-features-plan.md` in the Douze repository, from this side:

| Order | Douze | aspire.dev | Dependency |
|---|---|---|---|
| 1 | S1 Markdown pipeline, shortcodes, engine additions | M0 generators, M1 parity harness | none between them |
| 2 | S2, S3, S4, S5, S6 in parallel | M2 API reference (starts on S1; takes S5's `cache` when it lands) | M2 needs S1 |
| 3 | S6 watch and serve (needs S1 only, parallel with S2 to S5) | M3 chrome (needs S1, S3, S4), M4 converter (needs S1, S2, S4) | preview feed |
| 4 | S7 docs sample, benchmarks, first release | M5 articles and outputs (needs M3, M4; S2 to S5), M6 hosting and CI (needs M2; S6 for the dev server) | |
| 5 | fixes from M7 | M7 parity and performance (needs S7) | |
| 6 | | M8 cutover | |

Rough calendar with one implementer per stream: Douze S1 two weeks; S2 to S5 two to three weeks in parallel; S6 two
weeks; S7 one week. Site M0 two weeks (parallel with S1); M2 four weeks and M3 four weeks in parallel from week 3;
M4 two weeks in parallel from week 4; M5 two weeks; M6 one week (parallel with M5); M7 two weeks; M8 a few days.
About 12 to 14 weeks end to end, the chrome port and the API templates being the long poles.

---

## 14. Risks

1. **The scoped CSS port (19,200 lines)** is the largest manual task and the easiest place to lose fidelity.
   Mitigation: the extraction script, the visual diff at M3, and keeping Starlight's class names.
2. **Dropping `ClientRouter`** changes every "after navigation" behavior; some scripts rely on the swap events in ways
   the specs do not cover. Mitigation: M1 adjusts the specs on Astro first; a week of author use at M7.
3. **Expressive Code engine outside Astro**: `astro-expressive-code` wraps `expressive-code`'s engine; the standalone
   engine renders the same HTML and the same base styles, but the Starlight integration adds its theme CSS variables
   and the `starlight-plugin-icons` plugin is loaded through a cwd-relative `tsImport`. Mitigation: M4 starts with the
   worker on 30 fences compared with the Astro output; the code worker is Douze's reference worker, so Douze's tests
   cover the protocol.
4. **Twoslash time**: 400 fences at several hundred milliseconds each, serialized; the per-fence cache under
   `.douze/code-cache` makes it a one-time cost per fence, and CI caches `.douze`. A cache miss storm (a change to
   `aspire.d.ts` from the daily job) costs the full minutes once a day.
5. **Starlight's and Catppuccin's future updates** stop flowing: the vendored CSS is a snapshot. Accepted: the site
   owns its look from M3.
6. **`starlight-llms-txt` and `starlight-page-actions` behaviors** (the exact `llms*.txt` formats, the share menu)
   are reproduced by hand; agents and tooling consuming them may notice format differences. Mitigation: the
   structural diff normalizes and compares them; the `.md` twins improve (no JSX).
7. **Fonts in CI containers** for social images: `fontfile` on every text block (section 3.2), verified in M5 on the
   Linux runner.
8. **Search parity**: Pagefind's index on Douze's HTML has the same content but the ranking can shift with markup
   differences (`data-pagefind-weight`); `site-search` only checks the dialog. Accepted.
9. **The Douze preview feed** moves under the site during M2 to M5: pin the Douze version in
   `.config/dotnet-tools.json` and bump deliberately.
10. **The daily data job** writes 80 MB of JSON plus the new indexes into `src/site/data`; the repository grows
    faster with `signatureHtml`. Mitigation: measured at M0 (about +30% per file); Git LFS is not needed below 100 MB
    per file.
11. **Authors' workflow change** (MDX to Markdown + shortcodes, `douze serve` instead of `astro dev`): the
    `doc-writer` skill and `CONTRIBUTING.md` are rewritten at M8, and the shortcode files double as documentation.
