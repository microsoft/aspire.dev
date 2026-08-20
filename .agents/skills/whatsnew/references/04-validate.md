# `{validate}` — factual + build-readiness correctness (looped)

Prove the article is good-to-go **without running `pnpm build`**. The core is a
**Ralph loop** around `doc-pr-reviewer` until the (large) diff is 100% factual *and
still engaging*.

## Does NOT

- **Never runs `pnpm build`** locally. Verify build-readiness by inspection instead.

## Core loop (Ralph)

Run the [`doc-pr-reviewer`](../../doc-pr-reviewer/SKILL.md) skill against the PR diff,
then **fix → re-review → repeat** until it converges clean:

1. `doc-pr-reviewer` fact-checks every claim against its source of truth
   (`microsoft/aspire` core, CommunityToolkit/Aspire, Azure SDK where relevant).
2. Apply fixes for each finding (correct the claim, or cut it).
3. Re-run until **no factual findings remain** — while keeping the prose engaging
   (don't sand off the voice to satisfy a nit; fix the fact, keep the impact).

## Also checks

- **TypeScript samples:** run [`twoslash-validator`](../../twoslash-validator/SKILL.md)
  on every `twoslash` block.
- **MDX/frontmatter validity:** imports resolve; frontmatter well-formed; emoji `##`
  headings only in the TOC range (min/max heading level 2).
- **Sidebar + localization sync:** the new slug is wired in `docs.topics.ts`; note any
  JA (`ja/whats-new/`) copy that is out of sync (JA translation follows the normal
  localization flow — flag, don't block).
- **Links & assets resolve:** every internal link, `LearnMore` target, and
  image/asset reference exists. For links **into `release/{N.N}`** that may not be
  merged yet: **block on truly-broken**, **warn on not-yet-merged `docs-from-code`**
  targets.
- **Banner + version wiring:** banner points at the new article across locales; version
  constants in `aspire-versions.mjs` are correct.

## Editorial guardrails enforced here

Order by impact / customer DX · lead with positives · `<Aside>` used judiciously (don't
burn the reader's eyes) · developer empathy · KISS · no walls of text · a genuinely
good technical read.

## Skills orchestrated

- `doc-pr-reviewer` (primary, looped) · `twoslash-validator` (TS samples).

## Exit criteria

- `doc-pr-reviewer` converges with **no** factual findings.
- All `twoslash` samples pass; all links/assets resolve (or are explicitly
  warn-listed as pending `docs-from-code`).
- MDX/frontmatter valid; sidebar/banner/version wiring correct.
