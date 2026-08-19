---
name: whatsnew
description: "Step-argument skill that formalizes writing an Aspire \"What's new in N.N\" release-notes page (src/frontend/src/content/docs/whats-new/aspire-N-N.mdx) as a repeatable lifecycle. Invoke as `/whatsnew {modality}` where modality is one of: draft|scaffold (init), research, critique, validate, polish, review. USE FOR: start/scaffold a new what's-new page for a release, research a release's changes into a dossier, critique a draft, fact-check/validate the diff, polish and run data ingestion, or sign off the PR. DO NOT USE FOR: general docs pages (use doc-writer), reviewing an arbitrary docs PR (use doc-pr-reviewer), or product-repo changes. ORCHESTRATES: doc-writer, doc-pr-reviewer, doc-tester, twoslash-validator, update-integrations, update-samples, container-images."
---

# What's-new release-notes skill

Formalizes the previously ad-hoc process of writing an Aspire **"What's new in
Aspire N.N"** page as a single, step-argument skill with a repeatable lifecycle.
Invoke it as `/whatsnew {modality}` — the modality argument selects one phase:

```
{draft｜scaffold} → {research} → {critique} → {validate} → {polish} → {review}
   init/structure    dossier      self-review   fact-check    edits+data    sign-off
```

Each phase has a dedicated spec under [`references/`](./references/). This skill
**orchestrates** existing skills — it does not duplicate them.

## Dispatch on the modality argument

Read the argument, then follow the matching spec. `draft`, `scaffold`, and `init`
are aliases for the same phase. If no argument is given, ask which phase to run (or
infer from context — e.g. a fresh release with no page → `draft`).

| Modality | Alias | Purpose | Spec | Edits content? |
|----------|-------|---------|------|----------------|
| `draft` | `scaffold`, `init` | Stand up branch, draft PR, skeleton MDX, banner, sidebar, version constants. **Structure only.** | [`01-draft-scaffold.md`](./references/01-draft-scaffold.md) | Skeleton only |
| `research` | — | Enumerate every change into an impact-focused **dossier** (scratch, not shipped). | [`02-research.md`](./references/02-research.md) | No |
| `critique` | — | Content-quality **self-review** of draft vs dossier; severity-ranked findings. | [`03-critique.md`](./references/03-critique.md) | **No — reports only** |
| `validate` | — | **Ralph loop** with `doc-pr-reviewer` until 100% factual; samples/links/assets. **No `pnpm build`.** | [`04-validate.md`](./references/04-validate.md) | Fixes only |
| `polish` | — | Editorial pass + CI triage + diagnostics-author `@mentions` + **automated data ingestion**. | [`05-polish.md`](./references/05-polish.md) | **Yes** |
| `review` | — | Undraft PR, description, reviewers + `doc-tester` **blind** run of every in-article scenario. | [`06-review.md`](./references/06-review.md) | No |

## Supporting references

- [`whats-new-template.mdx`](./references/whats-new-template.mdx) — structure-only
  skeleton the `draft` phase copies (with scaffold tokens + the standardized header +
  the mandated section taxonomy).
- [`writing-guidelines.md`](./references/writing-guidelines.md) — humanized voice +
  the maintainer content standards. Defers to `doc-writer` for canonical style.

## Cross-cutting rules (apply to every phase)

### Git / branching / PR
- Release work uses **`release/{N.N}` branches on `upstream`** (`microsoft/aspire.dev`).
- Always cut `release/{N.N}` from the **latest `upstream/main`** (fetch first) to avoid
  merge conflicts.
- Iterate via a **draft PR** `release/{N.N}` → `upstream` `main`; `{review}` undrafts it.
- `aspire.dev` is **not** an IEvangelist repo → **standard git-flow (PRs)**, target
  `upstream`. The `dapine/{context}` feature-branch prefix does **not** apply to
  `release/*` branches.

### Voice & quality (see `writing-guidelines.md` + `doc-writer`)
- **Impact first, positives first, KISS.** No walls of text, no marketing fluff.
- **Judicious `<Aside>`** — a spotlight, not a floodlight. Don't burn the reader's eyes.
- **Content standards:** Deployment and Integrations are **separate** sections; a
  distinct **"New integrations"** section for brand-new ones; a **"Default container
  image updates"** section for tag bumps; the standardized header (release-date badge +
  release-tag link) on new articles only.

### Safety / mechanics
- **Never run `pnpm build` locally** — validate build-readiness by inspection.
- Each modality is **idempotent** — safe to re-run; `critique`/`validate` loop to
  convergence.
- Prefer built-in tools over shell; Windows-friendly paths.

## Key repository paths

| What | Path |
|------|------|
| What's-new pages | `src/frontend/src/content/docs/whats-new/aspire-N-N.mdx` (JA under `.../ja/whats-new/`) |
| Version constants | `src/frontend/config/aspire-versions.mjs` (`currentAspireMajorMinorVersion`, `currentAspireVersion`) |
| Sidebar | `src/frontend/config/sidebar/docs.topics.ts` (What's-new `items`) |
| Announcement banner | `banner:` frontmatter on `content/docs/index.mdx`, `docs.mdx`, `community/index.mdx`, and each `{locale}/index.mdx` (+ `ja/docs.mdx`); rendered by `src/frontend/src/components/starlight/Banner.astro` |
| Assets | `src/frontend/src/assets/whats-new/aspire-<version>/` |
| Container image data | `src/frontend/src/data/container-images.json` |
| Diagnostics articles | `src/frontend/src/content/docs/diagnostics/aspire<area><NNN>.mdx` → `/diagnostics/aspire<NNN>/` |
| Data ingestion | `src/frontend/scripts/update-integration-data.ps1` (`pnpm update:all`) |

## Orchestrated skills

`doc-writer` (voice/style) · `doc-pr-reviewer` (validate loop) · `doc-tester` (review
blind run) · `twoslash-validator` (TS samples) · `update-integrations` /
`update-samples` / `container-images` (polish data ingestion).
