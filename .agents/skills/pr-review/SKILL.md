---
name: pr-review
description: "Reviews new or changed CODE on aspire.dev for correctness, safety, and adequate test coverage — not documentation prose. USE FOR: reviewing a PR supplied as a number or URL (or the current branch's diff), checking C#/TypeScript/Astro/HTML/CSS changes for bugs, catching correctness/security/data-loss/accessibility regressions, verifying that important scenarios have unit tests, e2e tests (desktop/tablet/mobile), and axe-core accessibility tests. DO NOT USE FOR: validating documentation content or examples (use doc-tester), reviewing a documentation PR for factual accuracy (use doc-pr-reviewer), writing or fixing docs pages (use doc-writer), two-slash TypeScript blocks (use twoslash-validator), or nitpicking style/formatting (ESLint and Prettier own that). INVOKES: git (read-only diff inspection), gh (to resolve and fetch a PR by number or URL), and optionally the repo's existing test commands for verification. FOR SINGLE OPERATIONS: read the diff with git or gh pr diff and apply the relevant language checklist directly."
---

# PR Review Skill

Use this skill to review **code** changes on aspire.dev and produce a high-signal review. The bar is
the highest possible code quality: correct, safe, tested, and accessible. This skill mirrors the
[microsoft/aspire](https://github.com/microsoft/aspire) PR-review flow — **do not nitpick**. Report
only real, high-confidence problems and gaps that a maintainer must act on.

This skill reviews code (C#, TypeScript, Astro, HTML, CSS). It does **not** validate documentation
accuracy or prose — that belongs to `doc-tester`, `doc-writer`, and (for reviewing a docs PR)
`doc-pr-reviewer`.

## Input

This skill reviews **one change set**, supplied in any of these forms:

- a **PR number** (e.g. `1422`),
- a **full PR URL** (e.g. `https://github.com/microsoft/aspire.dev/pull/1422`), or
- **nothing** — review the current local branch's diff against its base branch.

Unless the caller says otherwise, a PR belongs to this `aspire.dev` repository. Review exactly the PR
you are given — there is no eligibility filter or selection step; do not go looking for other PRs.
Before reviewing, resolve the PR's **base branch**, **head SHA**, and **changed files** (see below).

### Resolve a PR with `gh` (read-only)

Prefer inspecting the diff without switching branches; check the PR out only when you need to run
something (tests/build). A PR URL can be passed directly; for a bare number, pass `--repo` so `gh`
targets the right repository rather than a fork remote.

```powershell
# Metadata: base branch, head SHA, and the list of changed files
gh pr view <number-or-url> --repo microsoft/aspire.dev --json number,baseRefName,headRefName,headRefOid,files

# The full unified diff to review
gh pr diff <number-or-url> --repo microsoft/aspire.dev

# Check it out locally — only needed to run the optional verification commands
gh pr checkout <number-or-url> --repo microsoft/aspire.dev
```

Use the resolved **base branch** wherever the workflow below references a base ref.

## ⚠️ Core rule: signal over noise

**Only report issues you are confident are real and worth a maintainer's time.** If you would preface
a comment with "nit", "consider", "maybe", or "personal preference", do not write it.

- ✅ **Report:** bugs, incorrect logic, unhandled failures, race conditions, resource leaks, security
  holes (XSS, injection, secret leakage), data loss, breaking API/behavior changes, broken
  accessibility, responsive/layout breakage, and **missing tests for important scenarios**.
- ❌ **Do not report:** formatting, import order, naming preferences, whitespace, "could be more
  idiomatic", subjective refactors, or anything ESLint/Prettier/`dotnet format` already enforces.

If a change is correct and adequately tested, say so plainly. A clean review is a valid outcome.

## Severity and confidence model

Classify every finding. Only surface **high-confidence** findings.

| Severity | Meaning | Examples |
|----------|---------|----------|
| **Critical** | Ships a bug, breaks users, or is unsafe. Must fix before merge. | Null deref, XSS, data loss, wrong output, broken build/route, secret committed. |
| **High** | Likely defect or a real gap that should be fixed before merge. | Unhandled error path, race, missing e2e/axe coverage for a user-facing scenario, accessibility regression. |
| **Medium** | Legitimate concern worth addressing; not necessarily blocking. | Fragile logic with no unit test, edge case not handled, unclear failure mode. |

**Confidence gate:** verify the claim against the actual code before writing it. Trace the value,
read the surrounding function, and confirm the code path is reachable. If you cannot confirm it,
either dig until you can or phrase it as an explicit question — do not assert a bug you haven't
verified. When in doubt, leave it out.

## Scope

**In scope (review these):**

- **C#** — `src/statichost/**`, `src/tools/**`, `src/apphost/**`, and their tests under `tests/**`.
- **Frontend TypeScript** — `src/frontend/src/**/*.ts`, scripts under `src/frontend/scripts/**`,
  and tests under `src/frontend/tests/**`.
- **Astro components/pages** — `src/frontend/src/**/*.astro`.
- **HTML** and **CSS/styles** — markup and `src/frontend/src/styles/**`, component-level styles,
  and anything affecting layout, theming, or responsiveness.

**Out of scope (defer, do not review here):**

- Documentation prose and examples in `src/frontend/src/content/docs/**` (`.md`/`.mdx` body content)
  → route to `doc-tester` / `doc-writer`.
- Two-slash TypeScript code fences → route to `twoslash-validator`.
- Generated data files (e.g. `src/frontend/src/data/*.json`) unless the generator logic changed.
- Pure formatting/lint concerns → owned by ESLint, Prettier, and `dotnet format`.

> Note: CSS/HTML embedded in or emitted by components **is** in scope when it affects behavior,
> layout, responsiveness, or accessibility, even if it lives near docs.

## Per-language review checklists

Apply only the checklists for languages that actually changed. Keep findings high-signal.

### C# (`StaticHost`, tools, AppHost — xUnit, `net10.0`, nullable enabled)

- **Correctness:** middleware ordering and short-circuiting; request/response paths; header and
  content-negotiation parsing (`AcceptHeaderParser`, path mapping) handle malformed/edge input.
- **Nullability:** honor the enabled nullable context — no unjustified `!`, no ignored possible-null.
- **Async:** no `async void` (except handlers), no sync-over-async (`.Result`/`.Wait()`), pass
  `CancellationToken` where the surrounding APIs do.
- **Resource safety:** `using`/`await using` for streams, `HttpClient`/handlers, temp files/dirs;
  no leaked `IDisposable`.
- **DI lifetimes:** singletons must not capture scoped/transient state; no captive dependencies.
- **Exceptions:** no swallowed exceptions that hide failures; failures surface as correct status/logs.
- **Security:** validate/normalize any path derived from input (path traversal); never log secrets.

### TypeScript (frontend `src`, `scripts`, tests)

- **Type safety:** no `any` that erases a real contract; no unsafe casts hiding a mismatch; narrow
  before use. Prefer failing types over `@ts-expect-error`/`eslint-disable` unless justified.
- **Null/undefined:** guard optional DOM lookups (`querySelector`, `getElementById`) and API/JSON
  fields before dereferencing.
- **DOM/browser:** event listeners are removed when appropriate; no leaks in long-lived scripts;
  correct handling of `localStorage`/`sessionStorage` access (can throw) — see existing `try/catch`
  patterns in `tests/e2e/helpers`.
- **Async:** every `await`/promise has an error path; no unhandled rejections; no floating promises.
- **Security:** never build DOM from untrusted strings via `innerHTML`; escape/encode user or
  external data; no secrets or tokens embedded client-side.

### Astro components/pages (`*.astro`)

- **Server vs client:** frontmatter runs at build/SSR — keep browser-only APIs inside `<script>` or
  client directives. Use the correct hydration directive (`client:load`/`idle`/`visible`) and only
  when hydration is actually needed.
- **Props:** typed and validated; required props aren't silently `undefined`.
- **Escaping/XSS:** `set:html` only on trusted, sanitized content; prefer expressions (auto-escaped).
- **Routing/data:** dynamic routes (`getStaticPaths`) produce the expected set; no broken/duplicate
  routes; build-time fetches fail loudly, not silently.

### HTML

- **Semantics:** meaningful elements (`button`, `nav`, `main`, headings) over `div` soup; one logical
  `h1` per page; correct heading order.
- **Accessibility:** accessible names for interactive elements and icons; `alt` on images; `label`
  associations for inputs; keyboard-operable controls (no click-only handlers on non-interactive
  elements); valid ARIA (don't override native semantics).

### CSS / styles (`src/frontend/src/styles/**`, component styles)

- **Responsiveness:** verify behavior at the three tested breakpoints (mobile/tablet/desktop) — no
  overflow, clipped content, or unusable controls. New layout usually needs an e2e check (below).
- **Theming:** use existing design tokens/CSS variables and theme selectors rather than hardcoded
  colors that break dark/light or Catppuccin theming.
- **Accessibility:** don't disable focus outlines without an equivalent visible focus style; preserve
  sufficient color contrast (WCAG AA) — this is enforced by the axe-core suite.

## Test-coverage expectations

Treat missing coverage for an **important scenario** as a review finding (High for user-facing
behavior, Medium for internal logic). "Important" = user-visible behavior, a bug being fixed, a
branch/edge case, or anything a regression would silently break. Trivial or purely cosmetic changes
don't require new tests — use judgment.

### Unit tests

- **Frontend (Vitest):** logic in `src/frontend/src/**` and `scripts/**` should have unit tests under
  `src/frontend/tests/unit/**`. A bug fix should add a test that fails without the fix.
- **C# (xUnit):** logic in `src/**` should have tests under `tests/**` (e.g. `StaticHost.Tests`,
  `*.Tests`). Parsers, mappers, and middleware especially need edge-case coverage.

### End-to-end tests (Playwright — desktop, tablet, mobile)

Important user-facing scenarios need an e2e test under `src/frontend/tests/e2e/**`. The Playwright
config (`src/frontend/playwright.config.mjs`) runs every spec across **all three viewport projects**,
so a single well-written spec is validated on:

| Project | Device / viewport |
|---------|-------------------|
| `desktop-chromium` | Desktop Chrome, 1440×900 |
| `tablet-chromium` | iPad Pro 11 |
| `mobile-chromium` | Pixel 7 |

- Confirm new/changed interactive UI, navigation, and responsive layout have e2e coverage that will
  run across all three projects. Use viewport-aware helpers (e.g. `isNarrowViewport`) when behavior
  differs by size, following existing specs like `ui-regressions.spec.ts`.
- Flag scenarios that only make sense on one form factor but are untested on the others (e.g. a
  mobile menu with no mobile assertion).

### Accessibility tests (axe-core)

Anything with accessibility implications — new pages, new interactive components, changed markup,
focus/keyboard behavior, or color/theming — should be covered by an `@axe-core/playwright` check.

- Follow the existing pattern in `src/frontend/tests/e2e/wcag-aa.spec.ts`: run `AxeBuilder` with
  `withTags(['wcag2a', 'wcag2aa'])` and assert **zero** violations.
- New top-level routes should be added to the audited-pages list; new interactive widgets should get
  a targeted axe assertion. Flag accessibility-affecting changes that ship with no axe coverage.

## Review workflow

1. **Get the change set.** If given a PR (number or URL), resolve it with `gh` per [Input](#input) —
   read `gh pr diff <pr>` plus the changed-file list, and `gh pr checkout <pr>` only if you need to
   run something. Otherwise review the current local branch, substituting the PR's base branch for
   `<base>` (usually `main`):
   ```powershell
   git --no-pager diff --stat <base>...HEAD
   git --no-pager diff <base>...HEAD
   ```
2. **Classify changed files** by language/area (C#, TS, Astro, HTML, CSS, tests) and by whether they
   are in scope. Set docs-only prose aside.
3. **Read for real understanding.** Open changed files and enough surrounding context to trace each
   changed code path — don't review lines in isolation.
4. **Apply the per-language checklists** to each in-scope change, verifying every candidate finding
   against the actual code before recording it.
5. **Assess test coverage** against the expectations above: unit, e2e (all three viewports), and
   axe-core. Record missing coverage for important scenarios as findings.
6. **Produce the report** in the format below. If nothing meets the confidence bar, say the change
   looks correct and adequately covered.

## Optional verification commands (read-only)

Running tests is **recommended, not required**. Use these to confirm a suspicion or validate coverage.
Run frontend commands from `src/frontend`.

```powershell
# Frontend unit tests (Vitest)
pnpm test:unit

# Frontend e2e tests across desktop/tablet/mobile (Playwright)
pnpm test:e2e

# Single e2e project / spec
pnpm exec playwright test --project=mobile-chromium tests/e2e/wcag-aa.spec.ts

# C# tests (xUnit)
dotnet test Aspire.Dev.slnx
```

Lint/format (`pnpm lint`, `pnpm format`, `dotnet format`) already enforce style — don't re-report
what they cover.

## Output format

Group findings by severity, most severe first. Omit empty groups. Each finding:

- **`path:line`** — one-line summary of the problem.
  - **Why it matters:** the concrete consequence (what breaks, for whom).
  - **Suggested fix:** the smallest correct change (or a targeted question if unverifiable).

End with a short **Test coverage** summary: which changed scenarios have unit / e2e (desktop, tablet,
mobile) / axe-core coverage, and which important ones are missing it.

Example skeleton:

```md
## Critical
- `src/statichost/StaticHost/AgentReadiness/AcceptHeaderParser.cs:42` — parser dereferences a null
  segment for a malformed `Accept` header.
  - Why it matters: a crafted header returns 500 instead of negotiating content.
  - Suggested fix: guard the empty-segment case before indexing; add a xUnit case for it.

## High
- `src/frontend/src/components/Menu.astro:18` — mobile menu toggle has no e2e coverage.
  - Why it matters: regressions on the Pixel 7 / iPad projects would ship silently.
  - Suggested fix: add a spec under tests/e2e that exercises the toggle (runs on all viewports).

## Test coverage
- Unit: ✅ AcceptHeaderParser change covered once the null case is added.
- E2E: ⚠️ Menu toggle untested on tablet/mobile.
- Accessibility: ✅ New route added to wcag-aa.spec.ts audited pages.
```

If there are no findings: state that the change is correct and adequately tested, and give the
coverage summary.
