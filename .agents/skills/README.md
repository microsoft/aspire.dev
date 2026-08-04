# Agent skills

Reusable skills for AI agents working in the aspire.dev repository. Each skill lives in its own
folder as a `SKILL.md` with YAML frontmatter (`name`, `description`) and is discovered automatically —
there's no central registry to update. Add a new skill by creating `.agents/skills/<name>/SKILL.md`.

> These are **internal** skills for contributors and agents working *on* this repo. They are separate
> from the public skills served under `src/frontend/public/.well-known/agent-skills/`.

## Skills at a glance

| Skill | What it's for |
|-------|---------------|
| [`aspire`](./aspire/SKILL.md) | Run, debug, and manage the repo's distributed app via the Aspire CLI. |
| [`container-images`](./container-images/SKILL.md) | Extract container image references from Aspire source into the site's JSON data. |
| [`doc-pr-reviewer`](./doc-pr-reviewer/SKILL.md) | Review a single docs PR for factual accuracy against Aspire's source of truth. |
| [`doc-tester`](./doc-tester/SKILL.md) | Validate documentation against Aspire's actual behavior. |
| [`doc-writer`](./doc-writer/SKILL.md) | Write and maintain accurate documentation pages. |
| [`hex1b`](./hex1b/SKILL.md) | Automate any terminal app in a headless virtual terminal. |
| [`playwright-cli`](./playwright-cli/SKILL.md) | Drive a browser for web testing, screenshots, and data extraction. |
| [`code-review`](./code-review/SKILL.md) | Review code changes (C#, TypeScript, Astro, HTML, CSS) for bugs and test coverage — no nits. |
| [`twoslash-validator`](./twoslash-validator/SKILL.md) | Validate and fix two-slash TypeScript code samples. |
| [`update-integrations`](./update-integrations/SKILL.md) | Sync integration docs links and API reference data. |
| [`update-samples`](./update-samples/SKILL.md) | Refresh the samples data file from `microsoft/aspire-samples`. |
