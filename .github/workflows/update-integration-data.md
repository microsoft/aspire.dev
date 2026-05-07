---
description: Daily update of integration data, sample metadata, and GitHub statistics by running pnpm update:all and creating a PR with the changes.
on:
  schedule: daily on weekdays
permissions:
  contents: read
  actions: read
runtimes:
  node:
    version: "24"
steps:
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
4. Check for existing open PRs created by this workflow
5. If there are changes, create a pull request with the updated data files
6. If there are no changes, call the `noop` safe output explaining that integration data is already up to date

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
- Use today's date in the PR title formatted as `M/D/YY` (e.g., `2/24/26`)
- When creating a PR, first create a local branch, add only the allowed generated files, and commit the changes locally. Then call `create-pull-request` with `branch` set to the exact output of `git branch --show-current`.
- Never include workflow files, package manifests, lockfiles, source files, or documentation edits in the generated data PR.

## PR Details

**Title**: `Update integration data and GitHub stats (DATE)`

**Body** (use this template):

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

### Review Checklist
- [ ] Verify integration data looks reasonable
- [ ] Check for any suspicious changes or anomalies
- [ ] Ensure package counts and versions are updated appropriately
- [ ] Confirm official Aspire package icons still use package-specific NuGet icon URLs
```

## Safe Outputs

- If files were modified and no existing PR: use `create-pull-request` with the title and body above
- If files were modified and existing workflow-created PRs were found: use `create-pull-request` for the replacement and `close-pull-request` for the superseded PRs
- If no files were modified: use `noop` with a clear explanation
