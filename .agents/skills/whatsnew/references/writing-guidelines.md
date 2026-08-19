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
  "Aspire N.N"`, `sidebar.order: 0`, and `tableOfContents` min/max heading level `2`
  (only `##` sections show in the on-page TOC).
- **Standardized header (new articles only):** a `Released MMMM D, YYYY`
  `<Badge variant="note" size="large">` followed by a GitHub release-tag link
  (`.../releases/tag/vN.N.0`) with `<Icon name="github" />`. Existing pages are left
  as-is — do not retrofit.
- **Lede:** 2–4 sentences. Lead with the single biggest win, then name the other
  headline themes. Bold the concrete feature names.
- **Feedback line:** the standard Discord + GitHub issues line (see template) — keep verbatim.
- **"This release introduces" bullets** map **1:1** to the top-level `##` sections
  that follow, in the **same order**, and end with "…and much more."
- **Section headings** are emoji-prefixed `##` (see taxonomy below). Use `####`
  subsections within a section (e.g. one per breaking change or per new integration).
- **Upgrade section** comes first after the lede: `## 🆙 Upgrade to Aspire N.N` with a
  `<span id="upgrade-to-aspire-N-N">` anchor, the breaking-changes caution `<Aside>`,
  and `<Steps>` for `aspire update --self` / `aspire update`.
- **Bug fixes** section links to the GitHub release tag rather than re-listing fixes.
- **Community contributions** thanks contributors by `@handle` with a one-line note
  on what each shipped. Never omit credit for a merged community PR.
- **Breaking changes** is the final `##` section, with a `<span id="breaking-changes">`
  anchor and one `####` per change: what changed, who's affected, exact remediation.

## Content standards (maintainer-mandated)

These are the specific quality gates critique/validate enforce:

1. **Don't over-group sections.** Never merge distinct themes (no "Deployment and
   integrations"). **Deployment** and **Integrations** are **separate** top-level
   sections.
2. **Call out brand-new integrations distinctly.** New integrations go in a dedicated
   **"✨ New integrations"** section, separate from **"📦 Integration updates"**
   (changes to existing integrations). New integrations must not be buried.
3. **Highlight default container image tag bumps.** When a hosting integration's
   default container image **tag** bumps (e.g. RabbitMQ 4.2→4.3, PostgreSQL
   17.6→18.3), call it out in **"🐳 Default container image updates"** with old → new
   tags. Source of truth: `src/frontend/src/data/container-images.json` — diff prior
   vs new release. We historically under-report these.
4. **Standardized header** present and correct on new articles (badge + release-tag link).

## Language/tech conventions (inherited from doc-writer — quick reference)

- **Aspire**, not ".NET Aspire". **AppHost**, **resource** (not "component"),
  **integration** (not "connector").
- **Inclusive framing:** name runtimes/languages positively (C#, TypeScript, Python,
  Go). Avoid "non-.NET" / "other languages" framing.
- **Second person, active voice, imperative mood.** Concise, professional-approachable.
- **Dates spelled out:** "August 18, 2025" — never "8/18/25".
- **C#/TypeScript parity:** when a feature spans AppHost languages, show both with
  `<Tabs syncKey='aspire-lang'>` / `<TabItem>` so the tab choice syncs page-wide.
- **Version tokens:** in prose for the *current* release you may use the build-time
  placeholders `%ASPIRE_VERSION%` / `%ASPIRE_VERSION_MAJOR_MINOR%` (replaced by the
  remark plugin). The article slug, sidebar, and header use the literal version.
