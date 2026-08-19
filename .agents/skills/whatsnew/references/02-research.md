# `{research}` — build the change dossier

Enumerate **every** change in the release and understand each one well enough to
write a compelling, factual, engaging impact statement. Output is a research
dossier (scratch on the branch / session workspace) — **not** shipped prose.

## Sources (authoritative)

- `microsoft/aspire` **`release/{N.N}` branch** — the actual code that shipped.
- **GitHub release notes** — `https://github.com/microsoft/aspire/releases/tag/vN.N.0`
  (also the canonical **release date** and the header's release-tag URL).
- **Automated wiki change-log** — `https://github.com/microsoft/aspire/wiki/{N.N}-Change-log`.
- **Merged PRs + labels**, milestone/issues for `N.N`. Also dashboard/CLI repos where relevant.
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
4. **Default container image tag bumps.** Diff `container-images.json`; list every
   default image whose **tag** changed (old → new) with any data-volume/migration
   caveat. → "🐳 Default container image updates".
5. **Header facts.** Record the **release date** (`Released MMMM D, YYYY`) and the
   release-tag URL for the standardized header.
6. **Edges.** Note preview-only/experimental packages, Community-Toolkit changes,
   and **breaking changes** (what changed, who's affected, remediation).

## Output — the dossier

A categorized dossier (scratch, on branch — not shipped) with, per change:

- Section it belongs to (taxonomy-mapped; Integrations/Deployment separate).
- One-line **impact note** ("compelling, factual, engaging truth").
- Source PR link + contributor handle(s).
- `LearnMore` target path, or explicit "no target yet".
- New-integration / image-tag-bump / breaking-change flags as applicable.
- Release date + release-tag URL for the header.

## Skills orchestrated

- `container-images` — regenerate/confirm image data if the checked-in JSON is stale
  (full regeneration is owned by {polish}; here it's for research accuracy only).

## Exit criteria

- Every shipped change has a dossier entry with a source link, an impact note, and a
  `LearnMore` target (or explicit "none yet").
- New integrations, image-tag bumps, and breaking changes are each explicitly listed.
- Release date + release-tag URL captured.
