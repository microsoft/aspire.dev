# `{draft/scaffold}` — initialize a release (structure only)

> Aliases: `draft`, `scaffold`, `init`. **Structure only — no researched content.**

Stand up everything a new "What's new in Aspire N.N" page needs so the team can
start iterating: the release branch, the skeleton MDX, the site banner, the sidebar
entry, and the version constants — all **committed**, and only then a **draft PR**.
Idempotent — safe to re-run; detect and update what already exists instead of
duplicating.

## Input

- Target release `N.N` (e.g. `13.5`). **Prompt for it** if not supplied.
- Derived: `SLUG = aspire-N-N`, `VERSION_FULL = N.N.0` (unless told otherwise). The
  release-date badge and GitHub release-notes link render **automatically** from the
  page's `publishDate` frontmatter + slug — no token needed for them.
- `RELEASE_DATE` (→ frontmatter `publishDate: YYYY-MM-DD`) may be unknown at init.
  If so, **delete the `publishDate:` line** and let {research}/{polish} add it — the
  badge simply doesn't render until it's set.

## Actions

1. **Release branch.** Ensure a `release/{N.N}` branch exists in the repository. If
   missing, create it from the **latest default branch** (e.g. `main`) — fetch first so
   you branch from an up-to-date base and avoid later conflicts. **Check it out** now;
   the draft PR is opened **last**, only after the scaffold is committed (a branch with
   no commits ahead of the default branch has no diff, so a PR can't be created yet).
2. **Scaffold the MDX.** Copy `references/whats-new-template.mdx` to
   `src/frontend/src/content/docs/whats-new/{SLUG}.mdx`. Replace the scaffold tokens
   (`{{VERSION_MAJOR_MINOR}}`, `{{VERSION_FULL}}`, `{{SLUG}}`, and `{{RELEASE_DATE}}`
   → `publishDate`, or drop that line if the date is unknown) and delete the template's
   leading comment block. Keep it
   **structure only** — placeholders and `TODO(...)` markers, no real prose. Preserve
   the **content-standards taxonomy**: Deployment and Integrations **separate**, plus
   dedicated **"New integrations"** and **"Default container image updates"** sections.
   If the file already exists, reconcile structure without clobbering existing content.
3. **Version constants.** Update `src/frontend/config/aspire-versions.mjs`:
   `currentAspireMajorMinorVersion = 'N.N'` and `currentAspireVersion = 'N.N.0'` (only
   when N.N is the new current release). This drives the `%ASPIRE_VERSION%` remark
   placeholders site-wide.
4. **Site-wide announcement banner.** The banner is **per-page frontmatter**, not a
   global config. Update the `banner.content` string **and its link** to point at
   `/whats-new/{SLUG}/` across every landing page that carries it, and set
   `bannerAutoDismissAfterDays: 14` (and `bannerExpiresOn` if used):
   - English: `src/frontend/src/content/docs/index.mdx`, `docs.mdx`,
     `community/index.mdx`.
   - Every locale: `src/frontend/src/content/docs/{locale}/index.mdx` (+
     `ja/docs.mdx`). Translate the announcement text per locale and point at the
     locale-appropriate whats-new path. (Grep `banner:` under
     `src/frontend/src/content/docs/` to enumerate current banner pages.)
5. **Sidebar entry.** In `src/frontend/config/sidebar/docs.topics.ts`, add
   `{ label: 'Aspire N.N', slug: 'whats-new/{SLUG}' }` at the **top** of the What's-new
   `items`. Roll the now-older version into the "Previous versions" group per the
   existing pattern.
6. **Assets folder.** Create `src/frontend/src/assets/whats-new/aspire-{VERSION_FULL}/`
   (empty) for screenshots to land later.
7. **Commit the scaffold.** Stage and commit all of the above on `release/{N.N}` so the
   branch has a diff against the default branch (nothing to PR otherwise).
8. **Draft PR.** *Now* open a **draft** PR from `release/{N.N}` into the repository's
   **default branch** for the team to iterate on. Create it if missing; don't mark it
   ready here (that's {review}).

## Output

- Committed scaffold on `release/{N.N}`, with an open **draft** PR into the
  repository's default branch.

## Exit criteria

- Page exists and is structurally sound (frontmatter + imports + section skeleton).
- Sidebar resolves the new slug; banner points at the new article across locales.
- Version constants updated; draft PR is open.
- **No researched prose yet** — only structure and placeholders.
