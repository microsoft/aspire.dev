# `{research}` — build the change dossier and draft the article

Enumerate **every** change in the release and understand each one well enough to
write a compelling, factual, engaging impact statement — then **author the
first-draft prose** into the scaffolded MDX from that dossier. The dossier is the
reasoning artifact (scratch on the branch / session workspace); the **draft it
produces is the article body** that `{critique}` and `{validate}` then review.
This is the phase that turns the skeleton into a real, reviewable page.

## Sources (authoritative)

- `microsoft/aspire` **`release/{N.N}` branch** — the actual code that shipped.
- **GitHub release notes** — `https://github.com/microsoft/aspire/releases/tag/vN.N.0`
  (also the canonical **release date** and the header's release-tag URL).
- **Automated wiki change-log** — `https://github.com/microsoft/aspire/wiki/{N.N}-Change-log`.
- **Merged PRs + labels**, milestone/issues for `N.N`. Also, the `microsoft/dcp` repo when relevant.
- **`src/frontend/src/data/container-images.json`** — diff prior vs new release to
  find default container image **tag** bumps.

## Actions

1. **Enumerate & understand.** For each change: what it is, the exact API/CLI surface,
   and *why it matters to the developer*. Capture the source PR link and candidate
   **contributor handle(s)**.
2. **Detect `docs-from-code`.** On each originating PR, check for the `docs-from-code`
   label. Those automated docs PRs may be **open or already merged into
   `release/{N.N}`** — meaning deep-link targets for `LearnMore` may already exist on
   the branch. Record the target path (or an explicit "no target yet").
3. **Classify against the taxonomy.** Map each change to a top-level section. Keep
   **Deployment** and **Integrations** distinct. Explicitly separate:
   - **Brand-new integrations** → "✨ New integrations".
   - **Changes to existing integrations** → "📦 Integration updates".
   Scope: "New integrations" is for **first-party `microsoft/aspire`** integrations
   only. **Community Toolkit** (`CommunityToolkit/Aspire`) integrations ship on their
   own cadence with their own release notes — do **not** list them here. Only mention
   the Toolkit when a **core** integration migrates **to/from** it or is deprecated in
   favor of it (e.g. a hosting package moving to `CommunityToolkit.Aspire.*`).
4. **Default container image tag bumps.** Diff `container-images.json`; list every
   default image whose **tag** changed (old → new) with any data-volume/migration
   caveat. → "🐳 Default container image updates".
5. **Release date.** Record the **release date** → the page's `publishDate`
   frontmatter (the badge + GitHub release-notes link then render automatically; the
   release-tag URL is derived from the slug, so there's nothing to hand-author).
6. **Edges.** Note preview-only/experimental packages, Community Toolkit changes,
   and **breaking changes** (what changed, who's affected, remediation). If the
   release ships **no** breaking changes, record that explicitly so the draft omits
   the section (next step).
7. **Author the draft.** Populate the scaffolded MDX from the dossier: write the lede,
   the "This release introduces" bullets (1:1 with the `##` sections, same order), and
   each section body with impact-first prose, `LearnMore` deep-links, and C#/TypeScript
   `<Tabs syncKey='aspire-lang'>` where a feature spans AppHost languages. Credit each
   merged community PR by `@handle`. **Only include sections that apply** — delete any
   standard section with no content. In particular, when the release has **no breaking
   changes**, remove the "⚠️ Breaking changes" section *and* the breaking-changes
   caution `<Aside>` in the Upgrade section (and its "This release introduces" bullet
   if present). This is a **first draft**: `{critique}` reviews it, `{validate}`
   fact-checks it, and `{polish}` refines it.

## Output — the dossier + first draft

A categorized dossier (scratch, on branch — not shipped) with, per change:

- Section it belongs to (taxonomy-mapped; Integrations/Deployment separate).
- One-line **impact note** ("compelling, factual, engaging truth").
- Source PR link + contributor handle(s).
- `LearnMore` target path, or explicit "no target yet".
- New-integration / image-tag-bump / breaking-change flags as applicable.
- Release date (→ frontmatter `publishDate`).

…and, authored **from** that dossier, the **populated draft MDX** — the article body
(lede, intro bullets, and section prose) that becomes the reviewable page.

## Skills orchestrated

- `container-images` — regenerate/confirm image data if the checked-in JSON is stale
  (full regeneration is owned by {polish}; here it's for research accuracy only).

## Exit criteria

- Every shipped change has a dossier entry with a source link, an impact note, and a
  `LearnMore` target (or explicit "none yet").
- New integrations, image-tag bumps, and breaking changes are each explicitly listed.
- Release date captured (for `publishDate`).
- The scaffolded MDX is **populated from the dossier** (lede, intro bullets, and
  section bodies) into a reviewable first draft, with inapplicable sections removed
  (e.g. no "⚠️ Breaking changes" section or caution when the release has none).
