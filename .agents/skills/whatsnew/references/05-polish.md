# `{polish}` — final refinements + late automation (applies edits)

The one phase that **applies edits**. Turn a validated draft into a finished,
ship-ready article; triage CI; ping diagnostics authors; and run the automated data
ingestion once content has settled — then **re-validate**, because every edit here
lands *after* the `{validate}` gate and must not ship unchecked.

## Editorial (apply edits)

- Tighten to **KISS**; smooth flow and voice per the `doc-writer` skill; dedupe.
- Confirm the "This release introduces" bullets map **1:1** to sections (same order).
- Right-size `<Aside>` usage (judicious — don't burn the reader's eyes).
- C#/TypeScript **tab parity** (`syncKey='aspire-lang'`) complete and correct.
- Reconcile **"✨ New integrations"**, **"📦 Integration updates"**, and **"🐳 Default
  container image updates"** against the freshly regenerated data (below).
- Finalize **contributor thanks** (`@handle` + one-line note per merged community PR).
- **SEO:** tighten `title`/`description` frontmatter and add descriptive `alt` text to
  every image. Add a custom **`seoTitle`** — the visible `title` ("What's new in Aspire
  N.N", ~24 chars) is shorter than the optimal 50–60 char social-card range, and
  `seoTitle` is used **verbatim** as `og:title`/`twitter:title` (no `· Aspire` suffix)
  without bloating the H1/sidebar label (e.g. `seoTitle: "What's new in Aspire N.N —
  <headline theme 1>, <headline theme 2>, and more"`).
- Set the `publishDate` frontmatter (ISO `YYYY-MM-DD`) if it was still pending — the `Released MMMM D, YYYY` badge auto-renders from it.

## CI triage

- Evaluate and resolve CI failures on the PR (lint, link-check, twoslash, build on CI).

## Diagnostics authors (`docs-from-code` follow-up)

For each **new diagnostics article** that originated from a `docs-from-code`-labeled
`microsoft/aspire` feature PR, `@mention` the original PR author with the standard
request so the short link gets created and named:

> `@{gh-alias}` Please create an aka link for this new diagnostic and name it
> accordingly: `https://aka.ms/aspire/diagnostics/{aspireNNN}`

(matching the article's route, e.g. `/diagnostics/aspire010/`). Post these as PR
comments (also re-affirmed in {review}).

## Automated data ingestion (owned here)

Once content has settled, regenerate the generated data from the `release/{N.N}`
**staging feed** (`darc-pub-microsoft-aspire-{shortSha}` — resolves `Aspire.*` on
`release/*` branches):

- Run `src/frontend/scripts/update-integration-data.ps1` (`pnpm update:all`) to
  regenerate the **C#/TS API JSON** + the **twoslash bundle**.
- Orchestrate the [`update-integrations`](../../update-integrations/SKILL.md),
  [`update-samples`](../../update-samples/SKILL.md), and
  [`container-images`](../../container-images/SKILL.md) skills as needed to refresh
  **`container-images.json`**, samples, and stats.
- Re-reconcile the image-tag and new/updated integration sections against the
  regenerated data, then commit.

## Re-validate (mandatory gate)

Everything above edits content **after** the `{validate}` gate — prose, frontmatter,
regenerated data, reconciled sections — so those edits must be re-checked before
handoff. **Re-run [`{validate}`](./04-validate.md)** on the changed article and loop
`polish → validate` until it converges clean:

- `doc-pr-reviewer` surfaces **no** new factual findings on the edited prose.
- `twoslash-validator` passes on any changed/regenerated `twoslash` blocks.
- MDX/frontmatter still valid; all links/assets still resolve; sidebar/banner/version
  wiring intact.

`{polish}` is **not done** until this final `{validate}` pass is green (`{review}`
re-confirms it).

## Skills orchestrated

- `doc-writer` (voice) · `update-integrations` · `update-samples` · `container-images`
  · `doc-pr-reviewer` / `twoslash-validator` (final re-validate gate).

## Exit criteria

- Article reads clean and finished; CI is **green**.
- Generated data regenerated and committed; the three integration/image sections
  reconciled against it.
- Diagnostics-author `@mentions` posted.
- A final `{validate}` pass runs **after** all polish edits and converges clean — no
  polish edit bypasses the validation gate.
