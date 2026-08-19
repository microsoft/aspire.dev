# `{review}` — sign-off on the draft PR

Take the finished article from draft to ready-to-merge, and prove it works by driving
`doc-tester` through a **blind** end-to-end run of the article's own scenarios.

## Actions

1. **Mark the PR ready for review** (`release/{N.N}` → the repository's default branch).
2. **PR description.** Write/refresh it: summary, headline highlights, breaking
   changes, and key links (release tag, notable PRs).
3. **CI green.** Confirm all checks pass (coordinate with {polish} if not).
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
