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

## StaticHost publishing

StaticHost publishes Brotli-compressed static assets using `Optimal` compression.
This reduces compression time for the generated documentation and API catalog.
HTML, Markdown, and other original assets remain available to clients that do
not accept Brotli. Hashed `_astro/` assets retain their immutable cache headers.

`src/statichost/StaticHost/Publishing.targets` sets the compression default and
maps `BrotliCompressionLevel` to the compatibility property that .NET 10's
publish target consumes. Explicit public or compatibility-property overrides
remain supported.

Publish logs include `[publish-timing]` messages with the compression level,
asset count, compression duration, and subsequent static-asset metadata and
manifest duration. Use these messages to distinguish MSBuild work from the
frontend build and container archive creation.

Run the publishing regression tests without building the frontend:

```shell title="Run isolated static-asset publishing tests"
dotnet test tests/StaticHost.Tests/StaticHost.Tests.csproj --configuration Release --filter FullyQualifiedName~PublishingTargetsTests
```

These tests publish small isolated projects using the production targets. They
check the default and overridden compression levels, compressed file contents,
HTTP content negotiation, and cache headers. AppHost CI runs them with the
StaticHost tests and includes their publish binary logs in
`logs-AppHost-ubuntu-latest`.

Add the `build-profile` label to a pull request to run full StaticHost publishing
diagnostics alongside the frontend profile. This opt-in CI job builds the
frontend, publishes the Linux container archive, verifies the frontend output
and representative Brotli round trips, and uploads
`statichost-publish-performance`. The artifact contains the publish log, MSBuild
binary log, resource measurements, frontend timings, and output sizes. It does
not upload or deploy the container image.

Use the `compression-profile` label for a controlled `SmallestSize` versus
`Optimal` comparison. The job renders the frontend once, snapshots every output
file with SHA-256, and republishes each compression variant without rebuilding
the frontend or StaticHost assembly. It clears only the generated publish and
compression directories between variants. Both variants must retain identical
frontend content, assembly/configuration hashes, and container base layers.

The comparison records Brotli and published-output totals, sizes by directory,
actual OCI archive sizes, compression timings, CPU time, and peak RSS. Chromium
measures response/transfer sizes, TTFB, FCP/LCP, main-thread activity, and JS heap
for home, a guide, and median-sized C# and TypeScript API pages. Each page gets
three cold/warm browser-cache pairs in desktop and mobile-like scenarios.
The mobile-like profile uses 5 Mbps downstream, 40 ms simulated latency, and
4x CPU throttling. An isolated native decoder measurement and 1/5/20 Mbps
body-byte transfer models are also included.

These are lab measurements against Kestrel with the published SDK static-asset
manifest. Front Door, TLS, Redis, live APIs, external requests, and physical
device behavior are not measured. Server filesystem caches are not forcibly
evicted. Medians and ranges are descriptive, not statistical significance
claims. Review `comparison/comparison.json` in
`statichost-publish-performance` before deciding whether the byte-size tradeoff
is acceptable.

Measure full-site publishing in CI. Compare equivalent source commits, SDKs,
runner images, and clean intermediate directories before attributing a timing
change to compression. A full StaticHost publish also builds the frontend.
Do not run a local full-site build without explicit maintainer approval.

## 🆘 Getting help

- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/microsoft/aspire.dev/issues)
- **Discussions**: Join conversations in [GitHub Discussions](https://github.com/microsoft/aspire.dev/discussions)
- **Discord**: Connect with the community on the [Aspire Discord](https://discord.com/invite/raNPcaaSj8)

## 📄 License

By contributing to this project, you agree that your contributions will be licensed under the same license as the project. See [LICENSE](LICENSE) for details.

## 🤝 Code of conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information, see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
