---
description: Daily update of integration data, sample metadata, and GitHub statistics by running pnpm update:all and creating a PR with the changes. When integration package versions change, also regenerates the C# and TypeScript API reference JSON files (and the twoslash bundle) and includes them in the same PR.
on:
  schedule: daily on weekdays
permissions:
  contents: read
  actions: read
runtimes:
  node:
    version: "24"
steps:
  - name: Setup .NET SDK
    uses: actions/setup-dotnet@v5
    with:
      global-json-file: global.json
  - name: Install Aspire CLI
    run: |
      dotnet tool install -g Aspire.Cli
      echo "$HOME/.dotnet/tools" >> "$GITHUB_PATH"
  - name: Setup pnpm
    run: corepack enable && corepack install
    working-directory: src/frontend
  - name: Install dependencies
    run: pnpm install --frozen-lockfile
    working-directory: src/frontend
network:
  allowed:
    - defaults
    - containers
    - node
    - dotnet
    - github
safe-outputs:
  github-app:
    client-id: ${{ secrets.ASPIRE_BOT_APP_ID }}
    private-key: ${{ secrets.ASPIRE_BOT_PRIVATE_KEY }}
  create-pull-request:
    title-prefix: "chore: "
    labels: [":octocat: auto-merge"]
    draft: false
    fallback-as-issue: false
    allowed-files:
      - "src/frontend/src/data/aspire-integrations.json"
      - "src/frontend/src/data/github-stats.json"
      - "src/frontend/src/data/samples.json"
      - "src/frontend/src/assets/samples/**"
      - "src/frontend/src/data/pkgs/**"
      - "src/frontend/src/data/ts-modules/**"
      - "src/frontend/src/data/twoslash/aspire.d.ts"
  close-pull-request:
    required-labels: [":octocat: auto-merge"]
    required-title-prefix: "chore: Update integration data"
    target: "*"
    max: 5
  noop:
---

# Integration Data Updater

You are an automation agent that updates integration data and GitHub statistics for the aspire.dev documentation site.

## Your Task

1. Run the update script from the repository root: `pnpm update:all`
2. Check if any files were modified using `git diff --stat`
3. Review the generated integration data for official Aspire package icon warnings
4. **Detect integration package version changes** in `src/frontend/src/data/aspire-integrations.json` (see "Version-change detection" below)
5. **If version changes were detected, run the API reference regeneration branch** (see "API reference regeneration" below)
6. Check for existing open PRs created by this workflow
7. If there are changes, create a single pull request with the updated data files (and, when triggered, the regenerated API reference files)
8. If there are no changes, call the `noop` safe output explaining that integration data is already up to date

## Version-change detection

After `pnpm update:all` completes, determine whether any package version field in `src/frontend/src/data/aspire-integrations.json` changed. The C# and TypeScript API reference data are keyed by package + version, so we only regenerate them when a version actually moves — metadata-only changes (icons, descriptions, download counts) must **not** trigger the regen branch.

Run this from the repository root:

```bash
git diff --unified=0 -- src/frontend/src/data/aspire-integrations.json \
  | grep -E '^[+-][[:space:]]*"version":' \
  | sort -u
```

Treat it as a version change when **any** matching `+/-` `"version":` line exists (a value moved up, was added for a new package, or was removed for a deprecated package). Capture the affected package titles for the PR body — read each diff hunk and extract the `"title"` field of the surrounding entry so the PR body can list the packages that triggered the regen.

If `git diff` shows no `"version":` lines, skip the regeneration branch and record "no version changes — API regen skipped" in the PR body.

## API reference regeneration

This branch only runs when version-change detection found at least one changed `"version":` line. The three phases below **must run in order** — each phase depends on the output of the previous one. Phases 2 and 3 happen to be wired together inside the same `pnpm` script (`scripts/update-ts-api.ts` chains the twoslash generator after the TS API generator), but they are described separately so the dependency chain is explicit and so per-phase failures can be reported in the PR body.

1. **Regenerate C# API reference JSON.** Produces the per-package JSON that the TS API phase depends on for package discovery.

   ```bash
   pwsh src/tools/PackageJsonGenerator/generate-package-json.ps1
   ```

   The script writes `src/frontend/src/data/pkgs/{Package}.{Version}.json` files for every package in `aspire-integrations.json`. Capture the script's success/failure summary for the PR body — successes, failures, and skipped packages (meta-packages without `lib/` content typically appear as skipped).

2. **Regenerate TypeScript API reference JSON.** Depends on the C# package JSON from phase 1.

   ```bash
   pnpm --filter ./src/frontend run update:ts-api
   ```

   `scripts/update-ts-api.ts` reads the freshly written `pkgs/*.json`, selects the `Aspire.Hosting` and `Aspire.Hosting.*` packages, runs `aspire sdk dump` for each via `src/tools/AtsJsonGenerator/generate-ts-api-json.ps1`, and writes `src/frontend/src/data/ts-modules/{Package}.{Version}.json` files. Capture any per-package failures for the PR body. Once the TS API JSON is written, the same script automatically continues into phase 3 — do not invoke it a second time.

3. **Regenerate the twoslash `.d.ts` bundle.** Depends on the TS API JSON from phase 2. This phase is **chained automatically** by `pnpm update:ts-api`; it runs `scripts/generate-twoslash-types.ts` against the freshly written `ts-modules/*.json` and rewrites `src/frontend/src/data/twoslash/aspire.d.ts`. If `pnpm update:ts-api` fails partway through the chain, distinguish in the PR body between a phase-2 failure (TS API generation) and a phase-3 failure (twoslash bundle) using the script's `❌ Generation failed:` vs `❌ Twoslash type generation failed:` log markers.

4. **Verify the regen diff is well-scoped.** After all three phases complete, run `git status` and confirm changes are limited to:

   - `src/frontend/src/data/pkgs/**`
   - `src/frontend/src/data/ts-modules/**`
   - `src/frontend/src/data/twoslash/aspire.d.ts`

   plus the metadata files already produced by `pnpm update:all`. If the diff includes anything outside these paths, stop and report a `missing_tool` or `missing_data` safe output explaining the unexpected file.

5. **File-count summary for the PR body.** Use `git diff --name-status` to count added (`A`), modified (`M`), and removed (`D`) files under `src/frontend/src/data/pkgs/`, `src/frontend/src/data/ts-modules/`, and whether `src/frontend/src/data/twoslash/aspire.d.ts` changed.

## Existing PR Handling

Before creating a PR, check if there are already open PRs created by this workflow using the workflow marker, not just the PR title:

```bash
gh pr list \
  --state open \
  --limit 20 \
  --search "\"gh-aw-workflow-id: update-integration-data\"" \
  --json number,title,headRefName,author,url,body,labels
```

Treat a PR as workflow-created only when its body contains `<!-- gh-aw-workflow-id: update-integration-data -->`. Prefer PRs authored by `app/aspire-repo-bot` or `github-actions[bot]` and with a title that starts with `chore: Update integration data`.

Do not push directly to an existing PR branch from this workflow. The agent job runs with a read-only GitHub token; PR writes must go through safe outputs. If existing workflow-created PRs are open and this run has new changes:

1. Create a fresh replacement PR using `create-pull-request`.
2. Call `close-pull-request` for each superseded workflow-created PR number, with a short body explaining that it was superseded by the latest Integration Data Updater run.
3. Mention the superseded PR numbers in the new PR body.

If no files were modified but an existing workflow-created PR is open, call `noop` and include the existing PR URL so reviewers know there is already a pending update.

## Icon Integrity Rules

Official Aspire packages (`title` starts with `Aspire.`) must not be changed from a package-specific NuGet icon URL to the default NuGet icon. For packages with a version, the expected icon shape is:

```text
https://api.nuget.org/v3-flatcontainer/<lowercase-package-id>/<lowercase-version>/icon
```

Treat changes like this as a high-signal warning:

```diff
- "icon": "https://api.nuget.org/v3-flatcontainer/aspire.azure.ai.openai/13.1.3-preview.1.26166.8/icon"
+ "icon": "https://www.nuget.org/Content/gallery/img/default-package-icon.svg"
```

The update script should resolve official Aspire package icons to package-specific NuGet URLs whenever package version data is available. If the script warns that an official Aspire package still resolved to the default NuGet icon, do not edit the JSON by hand and do not fail the workflow for that warning alone. Continue creating the data PR when the update command succeeds, and add an **Icon resolution warnings** note to the PR body with the affected package list so reviewers can investigate the script or upstream NuGet data.

## Guidelines

- The `pnpm update:all` command delegates to `src/frontend` to update integration data from the NuGet API and GitHub repository statistics
- The primary files that change are under `src/frontend/src/data/`:
  - `aspire-integrations.json` — latest NuGet package information
  - `github-stats.json` — repository star counts, descriptions, and license info
  - `samples.json` — Aspire sample metadata
- `pnpm update:all` can also refresh sample thumbnail assets under `src/frontend/src/assets/samples/`
- When the API reference regeneration branch runs, additional files change under:
  - `src/frontend/src/data/pkgs/` — per-package C# API JSON
  - `src/frontend/src/data/ts-modules/` — per-package TypeScript API JSON
  - `src/frontend/src/data/twoslash/aspire.d.ts` — consolidated twoslash type bundle
- Use today's date in the PR title formatted as `M/D/YY` (e.g., `2/24/26`)
- When creating a PR, first create a local branch, add only the allowed generated files, and commit the changes locally. Then call `create-pull-request` with `branch` set to the exact output of `git branch --show-current`.
- Never include workflow files, package manifests, lockfiles, source files, or documentation edits in the generated data PR.

## PR Details

**Title**: `Update integration data and GitHub stats (DATE)`

**Body** (use this template; include the **API reference regeneration** section only when that branch actually ran):

```markdown
## Automated Integration Data Update - DATE

This PR contains automated updates to:
- **Integration data** from NuGet API
- **GitHub repository statistics**
- **Aspire sample metadata**

### What's Updated
- `src/frontend/src/data/aspire-integrations.json` — Latest package information
- `src/frontend/src/data/github-stats.json` — Repository statistics
- `src/frontend/src/data/samples.json` — Sample metadata, when changed
- `src/frontend/src/assets/samples/` — Sample thumbnails, when changed

### API reference regeneration

<!-- Only include this section when version-change detection triggered the regen branch. -->
<!-- Otherwise replace the entire section body with: -->
<!-- _No integration package versions changed in this run — API reference regeneration was skipped._ -->

Versions changed for the following packages, so the C# and TypeScript API reference data and the twoslash bundle were regenerated:

- `<Aspire.Hosting.Foo>` `<old>` → `<new>`
- `<Aspire.Hosting.Bar>` `<old>` → `<new>`
- _(list truncated to first 10; full list visible in the diff)_

| Area | Added | Modified | Removed |
|---|---|---|---|
| `src/frontend/src/data/pkgs/**` | _N_ | _N_ | _N_ |
| `src/frontend/src/data/ts-modules/**` | _N_ | _N_ | _N_ |
| `src/frontend/src/data/twoslash/aspire.d.ts` | — | _yes/no_ | — |

Generator summary:

- C# API JSON (`generate-package-json.ps1` → `pkgs/`): _S_ succeeded, _F_ failed, _K_ skipped
- TS API JSON (`update-ts-api.ts` → `ts-modules/`): _S_ succeeded, _F_ failed
- Twoslash bundle (`generate-twoslash-types.ts` → `twoslash/aspire.d.ts`): _succeeded / failed_
- Failures (if any): `<Package@Version>` — _reason_

### Review Checklist

- [ ] Verify integration data looks reasonable
- [ ] Check for any suspicious changes or anomalies
- [ ] Ensure package counts and versions are updated appropriately
- [ ] Confirm official Aspire package icons still use package-specific NuGet icon URLs
- [ ] (If regen ran) The set of new/removed `pkgs/` and `ts-modules/` files matches the version changes — no orphaned files for packages that didn't change
- [ ] (If regen ran) `src/frontend/src/data/twoslash/aspire.d.ts` was committed (the diff must include this file or hover tooltips fall back to `any`)
- [ ] (If regen ran) Generator failure list is empty or limited to known meta-packages
```

## Safe Outputs

- If files were modified and no existing PR: use `create-pull-request` with the title and body above. The PR body must include the **API reference regeneration** section, populated when the regen branch ran or marked as skipped otherwise.
- If files were modified and existing workflow-created PRs were found: use `create-pull-request` for the replacement and `close-pull-request` for the superseded PRs
- If no files were modified: use `noop` with a clear explanation
