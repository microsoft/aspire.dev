# `{review}` — sign-off on the draft PR

Take the finished article from draft to ready-to-merge, and prove it works by driving
`doc-tester` through a **blind** end-to-end run of the article's own scenarios.

## Actions

1. **Mark the PR ready for review** (`release/{N.N}` → the repository's default branch).
2. **PR description.** Write/refresh it: summary, headline highlights, breaking
   changes, and key links (release tag, notable PRs).
3. **CI green.** Confirm all checks pass (coordinate with {polish} if not), and that
   {polish}'s **final `{validate}` pass** converged clean — no edit made after the
   validate gate is shipping unverified.
4. **Diagnostics `@mentions`.** Ensure the `docs-from-code` diagnostics-author aka-link
   requests are posted on the PR (from {polish}); re-affirm if missing.
5. **Request reviewers.** Add the right reviewers for a what's-new page.
6. **Final holistic read.** One last impact/DX pass — does the top of the page sell the
   release honestly and clearly?

## Blind acceptance test (`doc-tester`)

Drive the [`doc-tester`](../../doc-tester/SKILL.md) skill to read **only** the finished
"What's new in Aspire N.N" article — **no cheating**, no external lookups — and run
**every** test scenario the article documents (upgrade steps, code samples, CLI
commands, feature walkthroughs). The article must be self-sufficient: a developer
following it verbatim should succeed.

### Safety & isolation (required)

The article documents **stateful** commands — `aspire update --self` mutates the
machine's CLI, and feature walkthroughs can deploy to Azure/Kubernetes, publish
artifacts, or touch external services. Never run these blindly against the working
machine. Before executing:

- **Disposable environment only.** Run scenarios in a throwaway sandbox (fresh
  container / VM / temp working directory) that can be discarded afterward — never the
  dev machine, a shared box, or any production context.
- **Classify each scenario by side-effect first:** *read-only / local* (safe to run) vs
  *external or persistent* (installs, `--self` updates, deployments, publishes — anything
  that writes outside the sandbox or reaches a remote service).
- **Require explicit authorization** for the external/persistent class; don't execute
  them without the maintainer's go-ahead. Absent authorization, **inspect / dry-run** the
  steps for correctness and record them as "verified by inspection, not executed" rather
  than mutating anything.

- Any scenario that fails blind is a **defect in the article** → bounce back to
  {polish} (or {validate} if it's a factual error), fix, and re-run.

## Reviewing someone else's what's-new PR

This modality can also **review** a what's-new PR you didn't write: run the same
content-standard checks ({critique}'s rubric), the {validate} factual loop, and the
`doc-tester` blind run, then leave review feedback on the PR.

## Exit criteria

- `doc-tester` passes **every** in-article scenario **blind**.
- PR is undrafted, description is complete, CI is green, reviewers requested,
  diagnostics `@mentions` posted — **ready to merge**.
