# `{draft/scaffold}` — initialize a release (structure only)

> Aliases: `draft`, `scaffold`, `init`. **Structure only — no researched content.**

Stand up everything a new "What's new in Aspire N.N" page needs so the team can
start iterating: the release branch, a draft PR, the skeleton MDX, the site banner,
the sidebar entry, and the version constants. Idempotent — safe to re-run; detect
and update what already exists instead of duplicating.

## Input

- Target release `N.N` (e.g. `13.5`). **Prompt for it** if not supplied.
- Derived: `SLUG = aspire-N-N`, `VERSION_FULL = N.N.0` (unless told otherwise),
  `RELEASE_TAG_URL = https://github.com/microsoft/aspire/releases/tag/vN.N.0`.
  `RELEASE_DATE` may be unknown at init — leave the `{{RELEASE_DATE}}` token for
  {research}/{polish} to fill.

## Actions

1. **Release branch.** Ensure a `release/{N.N}` branch exists in the repository. If
   missing, create it from the **latest default branch** (e.g. `main`) — fetch first so
   you branch from an up-to-date base and avoid later conflicts.
2. **Draft PR.** Ensure a **draft** PR from `release/{N.N}` into the repository's
   **default branch** exists for the team to iterate on. Create it if missing; don't
   mark it ready here (that's {review}).
3. **Scaffold the MDX.** Copy `references/whats-new-template.mdx` to
   `src/frontend/src/content/docs/whats-new/{SLUG}.mdx`. Replace the scaffold tokens
   (`{{VERSION_MAJOR_MINOR}}`, `{{VERSION_FULL}}`, `{{SLUG}}`, `{{RELEASE_DATE}}`,
   `{{RELEASE_TAG_URL}}`) and delete the template's leading comment block. Keep it
   **structure only** — placeholders and `TODO(...)` markers, no real prose. Preserve
   the **content-standards taxonomy**: Deployment and Integrations **separate**, plus
   dedicated **"New integrations"** and **"Default container image updates"** sections.
   If the file already exists, reconcile structure without clobbering existing content.
4. **Version constants.** Update `src/frontend/config/aspire-versions.mjs`:
   `currentAspireMajorMinorVersion = 'N.N'` and `currentAspireVersion = 'N.N.0'` (only
   when N.N is the new current release). This drives the `%ASPIRE_VERSION%` remark
   placeholders site-wide.
5. **Site-wide announcement banner.** The banner is **per-page frontmatter**, not a
   global config. Update the `banner.content` string **and its link** to point at
   `/whats-new/{SLUG}/` across every landing page that carries it, and set
   `bannerAutoDismissAfterDays: 14` (and `bannerExpiresOn` if used):
   - English: `src/frontend/src/content/docs/index.mdx`, `docs.mdx`,
     `community/index.mdx`.
   - Every locale: `src/frontend/src/content/docs/{locale}/index.mdx` (+
     `ja/docs.mdx`). Translate the announcement text per locale and point at the
     locale-appropriate whats-new path. (Grep `banner:` under
     `src/frontend/src/content/docs/` to enumerate current banner pages.)
6. **Sidebar entry.** In `src/frontend/config/sidebar/docs.topics.ts`, add
   `{ label: 'Aspire N.N', slug: 'whats-new/{SLUG}' }` at the **top** of the What's-new
   `items`. Roll the now-older version into the "Previous versions" group per the
   existing pattern.
7. **Assets folder.** Create `src/frontend/src/assets/whats-new/aspire-{VERSION_FULL}/`
   (empty) for screenshots to land later.

## Output

- Committed scaffold on `release/{N.N}`, with an open **draft** PR into the
  repository's default branch.

## Exit criteria

- Page exists and is structurally sound (frontmatter + imports + section skeleton).
- Sidebar resolves the new slug; banner points at the new article across locales.
- Version constants updated; draft PR is open.
- **No researched prose yet** — only structure and placeholders.
