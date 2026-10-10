# Contributing to `aspire.dev`

Thank you for your interest in contributing to the aspire.dev! This guide will help you get started with local development and contributing to the project.

## Visit our contributor guide

Please see the full [Contributor guide](https://aspire.dev/community/contributor-guide/) for detailed instructions on how to contribute to aspire.dev, including guidelines for submitting issues, making pull requests, and coding standards.

## Help translate the docs

We welcome translation contributions! Please see our [Translation guide](https://aspire.dev/community/translation-guide/) to learn how to help translate aspire.dev into other languages. You can check the [translation status dashboard](https://aspire.dev/i18n/) to see what needs to be translated or updated.

## 🏗️ Project structure

```text
└───📂 frontend                   # Astro + Starlight documentation site
   ├───📂 src
   │    ├───📂 components         # Reusable Astro components
   │    ├───📂 content
   │    │    ├───📂 docs          # Markdown / MDX documentation pages
   │    │    └───📂 i18n          # Component translation locales
   │    ├───📂 data               # JSON integration & metadata
   │    ├───📂 styles             # Global & theme CSS
   │    └───📂 assets             # Images, videos, media
   ├───📂 scripts                 # Build & data update scripts
   └───📂 public                  # Static assets served as-is
```

## Environment badge

Set `PUBLIC_ENVIRONMENT_BADGE` to display a small text badge beside the header logo
and wordmark, for example `staging`, `test`, or `release/13.6`. The value is public
and rendered as text when Astro builds the site.

Local development (`pnpm dev`, including the frontend started by Aspire) defaults
to `localhost` when the variable is unset. An explicitly empty or whitespace-only
value hides the badge. Production builds have no badge by default; leave the
variable unset or empty for live deployments.

To override the badge locally, set the variable in your shell or in
`src/frontend/.env.local` and restart the dev server:

```dotenv
PUBLIC_ENVIRONMENT_BADGE=release/13.6
```

For the Azure DevOps vnext build, set this environment variable on the **frontend
build step**, not only on the deployed host. Use the full release branch name:

```yaml
env:
  PUBLIC_ENVIRONMENT_BADGE: $[replace(variables['Build.SourceBranch'], 'refs/heads/', '')]
```

For `refs/heads/release/13.6`, this renders `release/13.6`. Do not use
`Build.SourceBranchName`, which keeps only the final path segment. Apply this
setting only to the vnext build, not the live build. If vnext builds a different
source branch, set the intended label explicitly instead. Changing the badge on
a deployed static site requires rebuilding its frontend assets.

## Build performance diagnostics

Production builds retain the complete documentation and API catalogs. To collect
CI diagnostics, add the `build-profile` label to a pull request before pushing a
commit. The next pull-request CI run uploads a `frontend-performance` artifact
containing the Node CPU profile, phase timings, build log, output inventory, and
compression samples. Profiling is opt-in; ordinary builds do not pay its overhead.

The existing `Frontend Build` workflow also supports manual dispatch with
`profile_build: true`. Its optional `build_ref` selects an exact source commit
for the build, validation, and browser tests; leave it empty to build the
workflow's commit. This permits baseline profiling independently of a PR.
Set `cold_cache: true` on both runs to prevent Astro content-cache restoration.
Use the same Node version and cache conditions for both comparisons.
The manual `build_concurrency` input benchmarks Astro's documented page-generation
setting without changing its production default. Compare memory and output
contracts as well as wall time before selecting a different default.

For acceptance measurements, set `comparison_ref` to the exact baseline commit
SHA and enable `profile_build`. An additional job runs baseline, candidate, then
baseline again on one runner, at the same checkout path with fresh build
processes and cleared Astro content caches. It records CPU models and hashes every output file; any path,
size, or meaningful content difference fails the comparison and is reported in
`frontend-comparison/comparison.json`. Complete generated site copies are not
retained by this diagnostic job. The usual build and browser gates still run.
Compare the candidate with both baseline measurements to expose runner drift
and warm filesystem effects.

The comparison preserves raw hashes and audits three existing sources of
non-determinism: animation-instance UUIDs (keeping their DOM grouping intact),
RSS fallback publication times generated during the recorded build window
(protecting authored dates), and Pagefind JSON object-key ordering (preserving
every value and array order). No files are excluded. API links, anchors, rendered
content, scripts, styles, and search-index data remain part of the comparison.
Node's standard young-generation size and the 8 GiB old-generation limit remain
unchanged. A controlled 64 MiB semi-space experiment regressed build time and
increased peak memory; it was not adopted. Inspect total wall time and peak
memory, not just a single CPU hotspot, before changing runtime defaults.

Compare runs with the same runner class, dependency lockfile, build concurrency,
and catalog data. Distinguish cold and restored Astro content caches, and measure
build time separately from artifact upload and browser tests. Content-layer
caching does not eliminate static page rendering. CPU profiling affects runtime,
so compare profiled runs with profiled runs, and confirm production gains with
ordinary CI builds.

The installed Starlight Pagefind integration scans the complete HTML output,
including API pages marked `pagefind: false`. That flag excludes page content
from search, not the filesystem scan. Starlight's public Pagefind configuration
does not expose crawler file selection; do not patch private integration hooks
or remove published pages to reduce indexing time.

### Measured optimization candidates

The release baseline generated 32,441 pages and 69,030 output files, including
19,293 TypeScript API HTML pages and 4,914 C# API HTML pages. Static rendering,
not API Markdown serialization, was the principal cost. In one release CPU
profile, Starlight tab-panel parsing accounted for approximately 132 seconds,
syntax tokenization for 119 seconds, and garbage collection for 137 seconds.
These are overlapping sampled costs, not additive wall-time savings.

| Candidate | Controlled result | Decision |
| --- | --- | --- |
| Indexed C# type lookups and reused member anchors | Candidate 1,354.5s; baselines 1,355.2s and 1,409.8s | Essentially tied with the first baseline; removed because improvement was not demonstrated beyond drift |
| Additional plain UI-label caching | One comparison improved, another regressed about 5% | Removed; no reliable end-to-end benefit |
| V8 64 MiB semi-space | Candidate 1,392.9s; baselines 1,321.4s and 1,282.9s, with increased peak memory | Rejected |
| Different Astro concurrency | Separate runners also changed unchanged Pagefind timings from 70s to 132s | Inconclusive; default remains 4 |

The [API-only controlled run](https://github.com/microsoft/aspire.dev/actions/runs/37973002345)
passed all quality gates and compared every output file successfully after the
audited normalization above. The timings in this table come from the opt-in
Astro lifecycle report, which ends before the last finalization integration;
the accompanying `/usr/bin/time` results cover the entire Astro process.
These experiments do **not** establish a production build-time reduction.
Unproven runtime changes were removed rather than retained for their
microbenchmark results.

Further optimization should target the measured shared rendering work using
supported upstream APIs. In particular, avoid repeatedly parsing large rendered
tab panels or tokenizing identical signatures, but preserve panel accessibility,
page-specific identifiers, code themes, copy buttons, and plugins. The installed
library implementation owns these behaviors; private-hook overrides and
cached whole-page HTML are not acceptable substitutes. Profile and prove a
supported implementation before changing production rendering.

## 🆘 Getting help

- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/microsoft/aspire.dev/issues)
- **Discussions**: Join conversations in [GitHub Discussions](https://github.com/microsoft/aspire.dev/discussions)
- **Discord**: Connect with the community on the [Aspire Discord](https://discord.com/invite/raNPcaaSj8)

## 📄 License

By contributing to this project, you agree that your contributions will be licensed under the same license as the project. See [LICENSE](LICENSE) for details.

## 🤝 Code of conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information, see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
