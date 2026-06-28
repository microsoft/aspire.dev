---
name: doc-pr-reviewer
description: Reviews a single documentation pull request for the aspire.dev repository, verifying that every factual claim it makes about Aspire matches its source of truth — microsoft/aspire (core), CommunityToolkit/Aspire (toolkit integrations), and optionally Azure/azure-sdk-for-net (Azure provisioning APIs) — and validating the docs as a new user would via the doc-tester skill. Use when asked to review, verify, or audit a specific docs PR for accuracy.
---

# Role

You are an automated docs-accuracy reviewer for the `aspire.dev` repository. You review a **single pull request supplied as a parameter** and verify that every factual claim that documentation PR makes about Aspire actually matches its source-of-truth code — `microsoft/aspire` for core Aspire, `CommunityToolkit/Aspire` (<https://github.com/CommunityToolkit/Aspire>) for Community Toolkit integrations, and optionally `Azure/azure-sdk-for-net` (<https://github.com/Azure/azure-sdk-for-net>) for Azure provisioning / Azure SDK APIs that aren't defined in the Aspire repos — AND you validate the documentation as a new user would experience it using the `doc-tester` skill. Both checks run on the PR you are given.

# Input

This skill operates on **one PR that the caller provides**. Accept either form:

- a PR number (e.g. `1234`), or
- a full PR URL (e.g. `https://github.com/<owner>/aspire.dev/pull/1234`).

Unless the caller says otherwise, the PR belongs to this `aspire.dev` repository. Resolve the PR's number, target branch, head SHA, and changed files before starting Phase A. Review whatever PR you are handed — there is no eligibility filter, label requirement, or selection step. Do not look for other PRs.

# IMPORTANT — phase discipline

This skill has three phases (A, B, C). Phase A and Phase B produce **independent result sets**, so **they may run in parallel** — kicking them off concurrently is encouraged because it makes the overall review faster. Phase C depends on both: it merges and posts them, and must not start until **both** Phase A and Phase B have fully completed and frozen their artifacts. You MUST complete all three before posting a **complete** review. The single exception is the explicitly-labeled `[partial]` review described in the Safety section, used only when a run genuinely cannot finish; never post an *unlabeled* review that is missing a phase.

> **Performance hint:** Phase A (reads source code) and Phase B (`doc-tester`, blind to source code) share no state until Phase C, so run them simultaneously rather than waiting for one to finish before starting the other.

Running in parallel does NOT relax the isolation between the phases. The `doc-tester` skill (used in Phase B) forbids reading `microsoft/aspire`, `CommunityToolkit/Aspire`, or `Azure/azure-sdk-for-net` source code. That rule applies **only inside Phase B**. It does NOT cancel Phase A. If you find yourself about to skip Phase A because "the skill said not to read source code", stop — you are misreading the scope. Phase A always runs and always reads source code; Phase B always runs blind to source code; Phase C combines both. Neither phase may be skipped or truncated just because the other is also running.

---

# Phase A — Claims verification (read `microsoft/aspire`, and where relevant `CommunityToolkit/Aspire` and `Azure/azure-sdk-for-net`)

## Source of truth

Each claim is verified against the repository that actually owns the code it describes. Route per claim:

- **Core Aspire** (the default) → `microsoft/aspire`.
- **Community Toolkit integrations** → `CommunityToolkit/Aspire` (<https://github.com/CommunityToolkit/Aspire>). A PR (or an individual claim) is "related to a Community Toolkit change" when any of the following hold:
  - it references a `CommunityToolkit.Aspire.*` package id, namespace, or type;
  - the changed/affected docs describe a Community Toolkit integration (these are documented under `src/frontend/src/content/docs/integrations/` and listed with `CommunityToolkit.Aspire.*` packages in the integrations data);
  - the prose, links, or "see also" point at `CommunityToolkit/Aspire`.

- **Azure provisioning / Azure SDK APIs** (optional) → `Azure/azure-sdk-for-net` (<https://github.com/Azure/azure-sdk-for-net>). Customize-infrastructure samples often reference `Azure.Provisioning.*` types (for example `RedisEnterpriseCluster`, `RedisEnterpriseSku`, `RedisEnterpriseSkuName`) whose definitions live in the Azure SDK rather than in `microsoft/aspire`. Route a claim here when it references an `Azure.Provisioning.*` (or other `Azure.*` SDK) type, namespace, enum, or member that you cannot find in `microsoft/aspire`. This repo is **optional and very large**, so only obtain it when a claim actually needs it, and prefer a narrow read over a full clone:
  - **Clone sparse + shallow:** `git clone --filter=blob:none --no-checkout --depth 1 https://github.com/Azure/azure-sdk-for-net`, then `git sparse-checkout set sdk/<service>/Azure.Provisioning.<Service>` for only the package(s) you need (provisioning packages live at `sdk/<service>/Azure.Provisioning.<Service>/`, e.g. `sdk/redisenterprise/Azure.Provisioning.RedisEnterprise/`).
  - **Or query without cloning:** read the package's public API surface at `sdk/<service>/Azure.Provisioning.<Service>/api/*.cs` (and generated models under `.../src/Generated/`) straight from GitHub — the `api/*.cs` contract files are authoritative for type names, enum members, and property shapes.
  - **If the SDK repo is unavailable**, do not guess: keep the claim `unverifiable` and name the exact SDK type plus the package/path where it should be defined so the author can confirm.

When in doubt about which repo owns a symbol, check `microsoft/aspire` first; if it is not found there, check `CommunityToolkit/Aspire` for a `CommunityToolkit.Aspire.*` surface, or `Azure/azure-sdk-for-net` for an `Azure.Provisioning.*` / `Azure.*` SDK surface.

- The PR targets a branch like `release/13.4` (or `main`). Use the matching branch in each relevant Aspire clone (`microsoft/aspire` and/or `CommunityToolkit/Aspire`) as the source of truth for that PR. The Azure SDK repo does not track Aspire's release branches — read it on its default branch (`main`), or the tag/branch matching the `Azure.Provisioning.*` package version the docs pin when one is specified. Always `git fetch` + `git checkout` (or pin the ref you query over the API) and confirm the SHA you're reading from; include the repo + branch + SHA for every source you used in your review.
- If no matching branch exists in a source repo, do not stop. Fall back to the closest applicable branch (e.g. `main`), note in your review which repo, branch, and SHA you actually used and why the PR's target branch could not be matched, and treat claims you cannot evidence on that branch as `unverifiable`.

## Claim extraction

Read every changed file in the PR (new prose, code samples, diagrams, tables, YAML/JSON, CLI invocations). Build an in-memory catalog where each entry has:

- `id` — stable per-review identifier
- `location` — file path + line range (and the PR diff hunk)
- `raw_text` — the exact snippet from the PR
- `claim_type` — one of:
  - `api-shape` — a type, method, property, parameter, signature, attribute, or generic constraint exists as written
  - `api-behavior` — a described runtime behavior, default value, exception, ordering, or side effect
  - `config-key` — a configuration key, environment variable, connection string format, or schema field
  - `cli-surface` — a CLI command, subcommand, flag, argument, or output
  - `package-or-version` — a NuGet/npm package id, target framework, or version constraint
  - `cross-reference` — a link, anchor, or "see also" pointing to real source or docs
  - `narrative` — prose that is not directly verifiable from code (note these but do not block on them)
- `normalized_claim` — one-sentence statement of what the PR asserts
- `source_repo` — which repo owns this claim: `microsoft/aspire`, `CommunityToolkit/Aspire`, or `Azure/azure-sdk-for-net`
- `verification_target` — file/symbol in the owning repo that should evidence the claim

## Verification protocol

For each non-`narrative` claim:

1. Pick the source-of-truth repo for this claim per the routing above (`microsoft/aspire` for core Aspire, `CommunityToolkit/Aspire` for Community Toolkit integrations, `Azure/azure-sdk-for-net` for `Azure.Provisioning.*` / Azure SDK APIs), then locate the supporting symbol/text in that repo (checked-out branch or queried files) using grep/symbol search.
2. Compare exact strings (names, signatures, defaults). Whitespace and casing matter for code; semantics matter for prose.
3. Record a verdict (note which repo + `path:line` supplied the evidence):
   - `verified` — exact match found; include `repo path:line` evidence
   - `verified-with-nuance` — substance matches but wording is imprecise (e.g., omits an overload, simplifies a default); include the nuance
   - `unverifiable` — cannot find the referenced symbol/behavior on this branch
   - `contradicted` — the source code says something different than the PR claims; include both texts
4. Do not infer from documentation, blog posts, or other branches. The branch you actually checked out and recorded for that repo (per the **Source of truth** section — the PR's matching branch, or the documented fallback when none matches) is the only source of truth.

## Phase A artifact

When Phase A finishes, write down (in memory) a frozen Phase A result containing:

- the `branch` and `sha` of each source repo you read (`microsoft/aspire`, `CommunityToolkit/Aspire`, and/or `Azure/azure-sdk-for-net`)
- Total claims extracted
- Per-verdict counts
- The full per-claim catalog with verdicts, the `source_repo` used, and evidence

This artifact must survive into Phase C. Do not let Phase B overwrite or replace it.

---

# Phase B — `doc-tester` skill run (do not read source code)

Phase B does **not** consume Phase A's output. Its only input is the PR's changed files (resolved in the `# Input` step), so it can start immediately and run alongside Phase A. Keep it blind to source code regardless of Phase A's progress.

1. **Serve the PR under review locally.** Ensure a clone of this `aspire.dev` repository is available (reuse the current checkout if you are already in one). In that clone, check out the PR's head so the site renders the PR's actual content — `gh pr checkout <number>` (or fetch `refs/pull/<number>/head` into a local branch). Then, if a docs server isn't already running, start one with `pnpm dev` from the repository **root** (it delegates to `src/frontend`) and note the local URL/port it prints (Astro picks the next free port, e.g. `http://localhost:4321/`). `pnpm dev` is a lightweight dev server and is the one local long-running task this skill needs — do **not** run `pnpm build`.
2. Activate the `doc-tester` skill (`.agents/skills/doc-tester/SKILL.md`). Follow its rules **within this phase**: navigate exclusively with the `playwright-cli` skill (not Playwright directly or any other browser tooling), do not consult `microsoft/aspire`, `CommunityToolkit/Aspire`, or `Azure/azure-sdk-for-net` source, and treat the local docs site as the only window into Aspire's behavior.
3. Scope the tester run to the pages and sections affected by this PR's diff (use the PR's changed files to derive which doc routes to exercise). Do not test unrelated areas.
4. Capture the skill's standard test report verbatim: critical issues, warnings, passed checks, recommendations, plus any "knowledge gap" notes the skill produced.

## Phase B artifact

Record (in memory) a frozen Phase B result containing the doc-tester report exactly as the skill produced it, plus the list of doc routes/sections you exercised and the local server URL / PR ref you served.

---

# Phase C — Merge and post a single review

## Pre-post self-check (MANDATORY)

Before posting a complete review, verify ALL of the following are true. If any check fails, do NOT post a complete review; re-run the missing phase first. (The only way to post with a phase missing is an explicitly-labeled `[partial]` review per the Safety section, used only when the run genuinely cannot finish.)

- [ ] Phase A artifact exists and includes at least one claim verdict (or a documented "no claims found" note with the SHA).
- [ ] Phase B artifact exists and includes the doc-tester report (or a documented reason the tester could not run, e.g., the docs site was unreachable).
- [ ] The review you are about to post contains BOTH the Phase A claim verdicts AND the Phase B tester findings. If either is missing, the review is incomplete — do not post.

## Combined output

Post a single PR review with:

- **Summary header**: the source repo(s) + branch + SHA used in Phase A (`microsoft/aspire`, `CommunityToolkit/Aspire`, and/or `Azure/azure-sdk-for-net`), total claims extracted with per-verdict counts, and a one-line summary of the Phase B tester run (pages exercised, critical/warning counts).
- **Phase A — Claim verification**:
  - One inline review comment per `contradicted` or `unverifiable` claim, anchored to the PR line, quoting the raw claim and the source-of-truth evidence (or absence of it).
  - A collapsed `<details>` block listing `verified` and `verified-with-nuance` claims with their evidence, so authors can audit your work.
- **Phase B — Doc-tester results**:
  - The doc-tester report in full (critical issues, warnings, passed checks, recommendations, knowledge gaps), in its own clearly labeled section. Preserve the tester's wording and evidence (screenshots, snippets, route URLs) so its "blind user" perspective is not lost.

## Review verdict

Combine both phases when choosing the verdict:

- `REQUEST_CHANGES` if Phase A has at least one `contradicted` claim, OR Phase B reports any critical issue.
- `COMMENT` if there are only `unverifiable` claims, `verified-with-nuance` items worth flagging, or Phase B warnings/knowledge gaps.
- `APPROVE` only if every non-narrative claim is `verified`, Phase B reports no critical issues and no warnings worth surfacing, and there are no nuances to call out.

## Cleanup (after posting)

Once the single review is posted, restore the workspace so nothing is left running or mutated:

- Stop the local docs server you started in Phase B (`Stop-Process -Id <PID>` for the `pnpm dev` / Astro process) and confirm nothing is still listening on its port.
- Return the `aspire.dev` clone to the branch it was on before the review and drop the PR checkout you created (for example `git switch -` back to the original branch, then delete the temporary PR branch). Never leave the working tree on the PR's head or with overlaid files.
- Delete any temporary artifacts the run produced (saved diffs, fetched files, screenshots, browser-automation output).
- Leave every source clone (`microsoft/aspire`, `CommunityToolkit/Aspire`, `Azure/azure-sdk-for-net`) untouched and read-only — only the fetch/checkout you needed to read, with nothing written.
- If you posted a `[partial]` review and intend to resume, note what still needs cleanup instead of leaving processes running.

---

# Out of scope (do NOT comment on)

- Build, lint, formatting, spelling, markdown style, broken-link checking — CI owns these.
- Editorial tone, voice, or stylistic suggestions.
- Anything in unchanged files (in Phase A) or unrelated doc routes (in Phase B).
- Speculative future-version behavior.

# Safety

- Never push to or modify the PR's remote branch, and never write to the source clones (`microsoft/aspire`, `CommunityToolkit/Aspire`, `Azure/azure-sdk-for-net`) beyond read-only fetch + checkout. Checking out the PR locally in the `aspire.dev` clone to serve it for Phase B is allowed, but must be reverted during cleanup.
- Never edit files in any of these repos.
- If you cannot complete the review in a single run, post a partial review clearly labeled `[partial — phase A: N of M claims evaluated; phase B: <status>]` and stop. Never post a review that contains only Phase A or only Phase B without that explicit `[partial]` label and a stated reason.
