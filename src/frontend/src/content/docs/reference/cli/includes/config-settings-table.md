---
title: Config Settings Table
---

| Key                                          | Default                            | Description |
| -------------------------------------------- | ---------------------------------- | ----------- |
| `appHost.language`                           | —                                  | Language of the AppHost, such as `typescript/nodejs` or `python`. The CLI uses it to choose the runtime that runs the AppHost. |
| `appHost.path`                               | —                                  | Path to the default AppHost entry point, such as `apphost.mts`, `Program.cs`, or an AppHost project file, relative to the directory that contains `aspire.config.json`. Set it in the local `aspire.config.json` file; the CLI ignores it in global configuration. |
| `certificates.nssDbPaths`                    | —                                  | NSS database paths used for browser certificate trust on Linux. Separate paths with the platform path separator. Prefix a path with `firefox=` or `chromium=` to apply the trust settings expected by that browser family. Takes precedence over the upstream `DOTNET_DEV_CERTS_NSSDB_PATHS` environment variable. |
| `channel`                                    | —                                  | Aspire channel used to resolve Aspire packages, such as `stable`, `staging`, or `daily`. `aspire new`, `aspire init`, and `aspire update` can record it, `aspire add` reads it for non-C# AppHosts, and `aspire update` uses it when you don't pass `--channel`. |
| `docs.api.sitemapUrl`                        | `https://aspire.dev/sitemap-0.xml` | API reference sitemap used by `aspire docs api`. Leave it unset to use the built-in aspire.dev source. |
| `docs.llmsTxtUrl`                            | `https://aspire.dev/llms-full.txt` | `llms.txt` documentation source used by `aspire docs`. Leave it unset to use the built-in aspire.dev source. |
| `features.defaultWatchEnabled`               | `false`                            | Enable or disable watch mode by default when running Aspire applications for automatic restarts on file changes. |
| `features.experimentalPolyglot:go`           | `false`                            | Enable or disable experimental Go AppHost support. |
| `features.experimentalPolyglot:java`         | `false`                            | Enable or disable experimental Java AppHost support. |
| `features.experimentalPolyglot:python`       | `false`                            | Enable or disable experimental Python AppHost support. |
| `features.experimentalPolyglot:rust`         | `false`                            | Enable or disable experimental Rust AppHost support. |
| `features.nugetSignatureVerificationEnabled` | `true`                             | Enable or disable defaulting the `DOTNET_NUGET_SIGNATURE_VERIFICATION` environment variable for NuGet operations. When enabled on Linux, the CLI sets the variable to `true` unless you've set it to `false`. |
| `features.polyglotIntegrationFilterEnabled`  | `false`                            | Enable or disable an experimental filter that restricts `aspire add`, `aspire integration list`, and `aspire integration search` in non-C# AppHosts to integrations with the `polyglot` NuGet tag. The filter fails closed, so enabling it against a remote feed hides every integration. Azure DevOps Artifacts feeds ignore `tags:` query scoping, and nuget.org returns no first-party integrations for the tag. Enable it only against a local package source or hive, where the CLI reads the tag from the package's `.nuspec` file. |
| `features.showAllTemplates`                  | `false`                            | Show all available templates, including experimental ones, in `aspire new` and `aspire init`. |
| `features.showDeprecatedPackages`            | `false`                            | Show or hide deprecated packages in `aspire add` search results. |
| `features.stagingChannelEnabled`             | `false`                            | Enable or disable access to the `staging` channel for early access to preview features and packages. When enabled, daily, local, and per-PR CLI builds can also resolve the `staging` channel. |
| `features.updateNotificationsEnabled`        | `true`                             | Enable or disable Aspire CLI update notifications. |
| `overrideStagingFeed`                        | —                                  | Feed URL for the `staging` channel. Any non-empty value lets every CLI build resolve the `staging` channel, and a valid `http` or `https` URL replaces the default staging feed. To set it, run `aspire config set -g overrideStagingFeed <feed-url>`. Without this setting or `features.stagingChannelEnabled`, `--channel staging` only resolves on `stable` or `staging` Aspire CLI builds. Daily, local, and per-PR builds refuse it and report the recovery options. This key isn't part of the published JSON Schema, so schema-aware editors flag it as an unknown property. |
| `packages.<packageId>`                       | —                                  | Version of a hosting integration package for a non-C# AppHost, keyed by package ID. A value that ends in `.csproj` is treated as a project reference. `aspire add` adds entries, and `aspire update` updates their versions. For more information, see [Add and restore integrations](/app-host/typescript-apphost/#add-and-restore-integrations). |
| `profiles.<name>.applicationUrl`             | —                                  | Application URLs for the launch profile, such as `https://localhost:17000;http://localhost:15000`. To learn where each kind of AppHost stores launch profiles, see [AppHost configuration](/app-host/configuration/). |
| `profiles.<name>.environmentVariables`       | —                                  | Environment variables for the launch profile. |
| `sdk.version`                                | Installed CLI version              | Aspire SDK version for a non-C# AppHost, which determines the version of the `Aspire.Hosting` packages to use. `aspire update` updates this value. |

Each `.` in a key maps to a nested object in `aspire.config.json`. For example, `aspire config set appHost.path ./apphost.mts` writes `"appHost": { "path": "./apphost.mts" }`. Replace placeholders such as `<packageId>` and `<name>` with your own values.

:::caution
`aspire config set` treats every `.` and `:` in a key as a nesting separator, so it can't write keys whose names contain those characters:

- In `features.experimentalPolyglot:<language>`, `experimentalPolyglot:<language>` is a single feature name. Without `--global`, the CLI writes a nested `experimentalPolyglot` object to the local `aspire.config.json` file, and later commands fail to load the file. Set these flags with `--global`, or add them to the local file by hand, for example `"experimentalPolyglot:go": true` in the `features` object.
- Package IDs such as `Aspire.Hosting.Redis` contain dots. Use `aspire add` to add packages, or edit the `packages` object by hand.
:::
