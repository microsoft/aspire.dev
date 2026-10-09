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
compression samples. The separate performance-comparison workflow also profiles
the PR base and head on fresh runners with no restored Astro content cache. Its
`frontend-performance-baseline` and `frontend-performance-candidate` artifacts
record the actual checkout commit in `commit.txt`. Adding the label starts that
comparison; pushing a commit also enables profiling in the regular frontend CI
job. Profiling is opt-in; ordinary builds do not pay its overhead.

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
size, or content difference fails the comparison and is reported in
`frontend-comparison/comparison.json`. Complete generated site copies are not
retained by this diagnostic job. The usual build and browser gates still run.
Compare the candidate with both baseline measurements to expose runner drift
and warm filesystem effects.
The optional `max_semi_space` input benchmarks Node's documented
`--max-semi-space-size` setting for allocation-heavy builds. Baseline measurements
retain Node's standard young-generation size; only the candidate receives the
selected size. The 8 GiB old-generation limit remains unchanged. Inspect peak
memory as well as garbage-collection time before changing production defaults.

Compare runs with the same runner class, dependency lockfile, build concurrency,
and catalog data. Distinguish cold and restored Astro content caches, and measure
build time separately from artifact upload and browser tests. Content-layer
caching does not eliminate static page rendering. CPU profiling affects runtime,
so compare profiled runs with profiled runs, and confirm production gains with
ordinary CI builds.

C# type lookups and member anchors reuse indexes only for explicitly prepared,
immutable production catalogs. Their inputs are frozen recursively and caches
use weak keys scoped to the loaded data. Development and caller-owned mutable
documents continue to resolve against current data without those caches. Keep
source-order matching, overload anchors, and HTML/Markdown links equivalent
when changing these helpers.

Production route middleware also reuses plain UI-label translations by resource
dictionary and current source value. Parameterized, interpolated, nested,
namespace-qualified, transformed, and fallback translations still use the
original translator. Development does not enable this cache, and the public
translation methods remain available.

The installed Starlight Pagefind integration scans the complete HTML output,
including API pages marked `pagefind: false`. That flag excludes page content
from search, not the filesystem scan. Starlight's public Pagefind configuration
does not expose crawler file selection; do not patch private integration hooks
or remove published pages to reduce indexing time.

## 🆘 Getting help

- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/microsoft/aspire.dev/issues)
- **Discussions**: Join conversations in [GitHub Discussions](https://github.com/microsoft/aspire.dev/discussions)
- **Discord**: Connect with the community on the [Aspire Discord](https://discord.com/invite/raNPcaaSj8)

## 📄 License

By contributing to this project, you agree that your contributions will be licensed under the same license as the project. See [LICENSE](LICENSE) for details.

## 🤝 Code of conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information, see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
