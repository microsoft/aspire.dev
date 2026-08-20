# `{critique}` — content-quality review (reports, does not edit)

A rigorous self-review of the **draft** against the **dossier**. Produces an
actionable, severity-ranked findings report. **Makes no edits** — {polish} acts on it.

## Inputs

- The **draft** `whats-new/aspire-N-N.mdx` (authored in {research} from the dossier).
- The {research} dossier.
- [`writing-guidelines.md`](./writing-guidelines.md) and the `doc-writer` skill (style/tone/voice/tech-stack).

## What it evaluates

**Accuracy**
- Every claim traces to the dossier / a real PR. No invented APIs, flags, or behavior.
- API names, CLI commands, and version numbers are exact.
- `LearnMore`/links point at real targets (or are flagged as not-yet-merged
  `docs-from-code`).

**Engaging, impact-first framing**
- Sections and bullets lead with developer impact, ordered by customer DX.
- Positives first; caveats/breaking changes appropriately placed.
- KISS — no walls of text, no filler, no marketing superlatives.

**What's-new style adherence**
- "This release introduces" bullets map **1:1** to the `##` sections, same order.
- Emoji section headings correct; `####` subsections used where appropriate.
- `<Aside>` used **judiciously** (not eye-burning). Breaking-changes caution present
  **only** when the release has breaking changes — when it has none, both the caution
  *and* the "⚠️ Breaking changes" section are omitted (no empty section left behind).
- C#/TypeScript **tab parity** (`syncKey='aspire-lang'`) wherever a feature spans AppHost languages.
- `publishDate` frontmatter set (the `Released MMMM D, YYYY` badge + GitHub release-notes link auto-render; no hand-placed header).

**Content standards (mandated)**
- Deployment and Integrations are **separate** (not over-grouped).
- A distinct **"✨ New integrations"** section exists when new **first-party**
  integrations shipped. Community Toolkit integrations are **not** listed here — they
  ship separately with their own release notes.
- **"🐳 Default container image updates"** lists every tag bump found in research.

**Completeness**
- No missing sections vs the dossier; no thin/unsubstantiated statements.
- Every merged community PR is credited by `@handle`.
- No dead or placeholder links / leftover `TODO(...)` markers (except intentionally
  pending `docs-from-code` targets, which must be flagged).

## Output

A severity-ranked findings list — **Blocker / Major / Minor / Nit** — each with the
location and a concrete suggested fix. **No edits are made in this phase.**

## Exit criteria

- A findings report the author / {polish} can act on directly.
- Every content standard above has an explicit pass/fail note.
