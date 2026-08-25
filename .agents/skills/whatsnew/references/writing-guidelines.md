# What's-new writing guidelines (humanized voice)

> **Source of truth for style:** the [`doc-writer`](../../doc-writer/SKILL.md) skill.
> This file adds only the **what's-new-specific** conventions on top. When the two
> ever disagree, `doc-writer` wins for voice/tone/terminology; this file wins for
> what's-new structure and the content standards below.

A what's-new page is the **first thing** most developers read about a release. It
has to be accurate to a fault *and* genuinely enjoyable to read. Aim for the bar a
staff engineer would set reviewing their own team's release notes.

## The bar

- **Impact first.** Every section and bullet leads with *what the developer can now
  do* and *why it matters* — not the mechanics of how it was built. Order sections
  and bullets by customer impact / DX, not by internal area or PR order.
- **Positives first.** Open with wins. Caveats, breaking changes, and limitations
  come after the value is clear (breaking changes live in their own section).
- **KISS.** Shortest prose that fully conveys the change. Cut filler, hedging, and
  restatement. Prefer one strong sentence over three weak ones.
- **No walls of text.** Break up long passages. A section is bullets + short prose +
  (optionally) one focused code sample — not an essay.
- **Judicious alerts.** `<Aside>` is a spotlight; overuse blinds the reader. Reserve
  it for genuinely important call-outs (breaking changes, required actions, sharp
  edges). If half the page is asides, none of them land. *Do not burn the reader's eyes.*
- **Developer empathy.** Write to a busy engineer skimming for what changed. Answer
  "do I care, and what do I do about it?" fast.
- **Factual, not marketing.** Concrete capabilities, real API names, honest scope.
  No superlatives that research can't back. "Compelling, factual, engaging truths."

## What's-new structural conventions

- **Title/frontmatter:** `title: "What's new in Aspire N.N"`, a tight SEO
  `description` (headline features, ≤ ~200 chars for OG cards), `sidebar.label:
  "Aspire N.N"`, `sidebar.order: 0`, `tableOfContents` min/max heading level `2`
  (only `##` sections show in the on-page TOC), and `publishDate: YYYY-MM-DD`.
- **`seoTitle` (recommended):** the visible `title` is short (~24 chars), so add a
  custom `seoTitle` to hit the optimal 50–60 char social-card range. It's used
  **verbatim** as `og:title`/`twitter:title` (no `· Aspire` suffix appended) and
  falls back to `title` when unset — so it tunes the social card without touching the
  visible H1 or sidebar label. Weave in the headline themes, e.g.
  `seoTitle: "What's new in Aspire N.N — <theme 1>, <theme 2>, and more"`.
- **Standardized header (automatic — never hand-authored):** the `Released MMMM D,
  YYYY` badge and the GitHub release-notes link render **centrally** from the page's
  `publishDate` frontmatter and its slug (`components/starlight/MarkdownContent.astro`
  + `utils/whats-new.ts`). Just set `publishDate` — never place a `<Badge>` or a
  release-tag link in the body. Omit `publishDate` and the badge simply doesn't show.
- **Lede:** 2–4 sentences. Lead with the single biggest win, then name the other
  headline themes. Bold the concrete feature names.
- **Feedback line:** the standard Discord + GitHub issues line (see template) — keep verbatim.
- **"This release introduces" bullets** map **1:1** to the top-level `##` sections
  that follow, in the **same order**, and end with "…and much more."
- **Section headings** are emoji-prefixed `##` (see taxonomy below). Use `####`
  subsections within a section (e.g. one per breaking change or per new integration).
- **Upgrade section** comes first after the lede: `## 🆙 Upgrade to Aspire N.N` with a
  `<span id="upgrade-to-aspire-N-N">` anchor and `<Steps>` for `aspire update --self` /
  `aspire update`. Include the breaking-changes caution `<Aside>` **only when the
  release actually has breaking changes** (omit it otherwise — see below).
- **Bug fixes** section links to the GitHub release tag rather than re-listing fixes.
- **Community contributions** thanks contributors by `@handle` with a one-line note
  on what each shipped. Never omit credit for a merged community PR.
- **Breaking changes (conditional).** When the release has them, this is the final
  `##` section, with a `<span id="breaking-changes">` anchor and one `####` per change:
  what changed, who's affected, exact remediation. **Not every release ships breaking
  changes** — when there are none, omit both this section *and* the upgrade caution
  `<Aside>` (and any breaking-changes intro bullet). Never ship an empty section.

## Content standards (maintainer-mandated)

These are the specific quality gates critique/validate enforce:

1. **Don't over-group sections.** Never merge distinct themes (no "Deployment and
   integrations"). **Deployment** and **Integrations** are **separate** top-level
   sections.
2. **Call out brand-new integrations distinctly.** New integrations go in a dedicated
   **"✨ New integrations"** section, separate from **"📦 Integration updates"**
   (changes to existing integrations). New integrations must not be buried. **Scope:
   first-party `microsoft/aspire` integrations only** — **Community Toolkit**
   (`CommunityToolkit/Aspire`) integrations ship on their own cadence with their own
   release notes, so don't list them here. Mention the Toolkit only when a core
   integration migrates to/from it or is deprecated in favor of it.
3. **Highlight default container image tag bumps.** When a hosting integration's
   default container image **tag** bumps (e.g. RabbitMQ 4.2→4.3, PostgreSQL
   17.6→18.3), call it out in **"🐳 Default container image updates"** with old → new
   tags. Source of truth: `src/frontend/src/data/container-images.json` — diff prior
   vs new release. We historically under-report these.
4. **`publishDate` set** in frontmatter — the release-date badge + GitHub release-notes link auto-render (no hand-placed header).

## Language/tech conventions (inherited from doc-writer — quick reference)

- **Aspire** is the product name — never prepend the old pre-rebrand qualifier.
  **AppHost**, **resource** (not "component"), **integration** (not "connector").
- **Inclusive framing:** name runtimes/languages positively (C#, TypeScript, Python,
  Go) rather than defining any of them in opposition to another.
- **Second person, active voice, imperative mood.** Concise, professional-approachable.
- **Dates spelled out:** "August 18, 2025" — never "8/18/25".
- **C#/TypeScript parity:** when a feature spans AppHost languages, show both with
  `<Tabs syncKey='aspire-lang'>` / `<TabItem>` so the tab choice syncs page-wide.
- **Version tokens:** in prose for the *current* release you may use the build-time
  placeholders `%ASPIRE_VERSION%` / `%ASPIRE_VERSION_MAJOR_MINOR%` (replaced by the
  remark plugin). The article slug, sidebar, and header use the literal version.
