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

## Hybrid API documentation POC

The normal build remains fully static. Opting in with `ASPIRE_HYBRID_API_DOCS=1`
at **build time** leaves non-API documentation and assets static, but renders all
C# and TypeScript API HTML and Markdown on demand through the existing StaticHost.
This includes both API search pages. The convenience command `build:hybrid` sets
the flag only for its child build; `build:hybrid:skip-search` also skips Pagefind.
Setting a runtime flag alone cannot convert an already-static artifact.
Use `build:hybrid`, not the static-only `build:statichost` command, for this mode.

Run full-site comparisons in CI, not on your development machine. From the
**Frontend Build** workflow, select the POC option, or use:

```powershell
gh workflow run frontend-build.yml --repo microsoft/aspire.dev --ref YOUR_BRANCH -f hybrid_api_poc=true
```

A PR carrying the `hybrid-api-poc` label also runs the POC checks when CI is
triggered by opening, reopening, or pushing to the PR. The comparison builds both
modes from the same commit and reports output counts, build resource usage, and
cold/warm rendering measurements in `hybrid-api-docs-results`.
The manual POC selection runs its focused checks and comparison without also
duplicating the ordinary frontend build and all viewport test shards.

Download the completed `hybrid-api-docs-poc` artifact into the frontend directory:

```powershell
gh run download RUN_ID --repo microsoft/aspire.dev --name hybrid-api-docs-poc-windows --dir .\src\frontend\dist-hybrid
$env:ASPIRE_HYBRID_API_DOCS = '1'
aspire start --non-interactive
```

Restore frontend dependencies with the repository's existing pnpm setup first.
The downloaded directory contains `client`, `server`, and `hybrid-api-docs.json`.
Use `hybrid-api-docs-poc` on Linux or `hybrid-api-docs-poc-windows` on Windows.
The Node adapter's build paths are platform-specific; a Linux artifact cannot
run on Windows. The manifest checks the platform before starting the renderer.
The manifest and server stay outside the public static root. Browse the
StaticHost endpoint in the Aspire dashboard. The AppHost runs two private Node
processes, `api-docs` and `api-docs-standby`, from the same artifact. Dependencies
must already be restored; startup does not install packages or rebuild the site.
Missing or incompatible artifacts cause an actionable startup error instead of
starting a development server or rebuilding the site.

Astro's native `memoryCache()` is the only response cache: 128 LRU entries with a
30-minute lifetime, not a 128 MiB byte budget. It does not guarantee cold-miss
coalescing. StaticHost forwards every request, buffers up to 64 MiB, and sends
on-demand output with `Cache-Control: no-store`. Negotiated Markdown shares the
native `.md` entry; its private/Vary headers are applied during forwarding.
Authorization requests bypass caching; preference cookies are not forwarded.

Workers verify a real API render before becoming ready. StaticHost retries a
failed GET against the matching-build standby, with 10-second attempts within a
30-second budget. `/healthz/api-docs` reports renderer readiness; `/healthz`
reports host liveness. If both workers fail, APIs return gateway errors while
static pages remain available. Restarting Node clears its cache; restarting
StaticHost does not. Restart the whole pair when replacing the artifact.

Existing Redis/live-status behavior and the static Azure deployment are
unchanged. Hybrid publishing models a .NET main container and two private Astro
sidecars in the same App Service, without shared volumes. Build the renderer
image with `src/frontend/Dockerfile.hybrid`, push it to the App Service registry,
and supply its immutable image reference as `Parameters__api_docs_image` to the
Aspire deployment. Both images must use the same Linux build artifact. No Azure
resources are provisioned by the POC CI. Runtime images are restricted to bundled
local files and dimensions up to 4096 pixels.

Set `HybridApiDocsArtifactDirectory` to select an artifact outside `dist-hybrid`,
for example when keeping Windows local and Linux deployment artifacts separate.

Unset the flag to return to the ordinary Vite/local workflow:

```powershell
Remove-Item Env:ASPIRE_HYBRID_API_DOCS
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

## 🆘 Getting help

- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/microsoft/aspire.dev/issues)
- **Discussions**: Join conversations in [GitHub Discussions](https://github.com/microsoft/aspire.dev/discussions)
- **Discord**: Connect with the community on the [Aspire Discord](https://discord.com/invite/raNPcaaSj8)

## 📄 License

By contributing to this project, you agree that your contributions will be licensed under the same license as the project. See [LICENSE](LICENSE) for details.

## 🤝 Code of conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information, see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
