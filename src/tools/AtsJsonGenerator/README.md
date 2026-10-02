# AtsJsonGenerator

Transforms `aspire sdk dump --format json` output into structured JSON files for the aspire.dev TypeScript API reference pages.

## Overview

The Aspire CLI can emit a JSON description of all TypeScript-accessible capabilities for any hosting package via `aspire sdk dump --format json`. This tool transforms that output into a docs-friendly JSON format suitable for consumption by Astro's content collections.

The companion `generate-ts-api-json.ps1` script reads the generated C# package JSON files in `src/frontend/src/data/pkgs/` and regenerates TypeScript API JSON using the same `Aspire.Hosting*` and `CommunityToolkit.Aspire.Hosting*` package/version sets. Modules with no generated functions or types are omitted so empty packages don't appear in the TypeScript API reference.

### Script behavior

- **Concurrency:** `Aspire.Hosting` is generated first, then packages that don't need supporting scan context, then packages that do. Packages in each wave run concurrently, up to 8 at a time by default. Set `ASPIRE_TS_API_PARALLELISM` to change the limit; `1` processes one package at a time. `-AspireRepoPath` runs always process one package at a time because dumps build shared repo projects.
- **Timeouts and retries:** Each `aspire` CLI call is limited to 10 minutes, and each transformer or enum-supplement call to 5 minutes. A dump or export that fails without producing a result is attempted up to three times.
- **Error diagnostics:** A dump that reports error diagnostics fails the package, with one exception. When the CLI writes the dump and exits nonzero, the script passes `--tolerate-known-scanner-diagnostics` to the transformer. That option accepts only the known inherited duplicate-capability scanner defect, where a method inherited by several proxy types is reported as `Duplicate capability '…': defined at 'Namespace.TypeA.Method' and 'Namespace.TypeB.Method'`. The transformer also checks the dump's `HandleTypes`: each defining type must be the type that owns the capability ID or derive from it, so unrelated types that share a capability ID aren't tolerated. Any other error diagnostic still fails the package. The transformer prints each tolerated diagnostic, and the script summary lists them under `Packages with tolerated ATS diagnostics:` for `update-integration-data.ps1` to surface in its pull request. Remove the tolerance once the shipped Aspire CLI includes [microsoft/aspire#20443](https://github.com/microsoft/aspire/pull/20443).

## Usage

### Single file

```bash
# First, generate the dump from the Aspire CLI
aspire sdk dump --format json -o Aspire.Hosting.dump.json

# Then transform it for the docs site
dotnet run --project AtsJsonGenerator.csproj -- \
  --input Aspire.Hosting.dump.json \
  --output ../../frontend/src/data/ts-pkgs/Aspire.Hosting.json \
  --package-name "Aspire.Hosting" \
  --version "13.2.0" \
  --source-repo "https://github.com/microsoft/aspire"
```

### Batch mode

Process multiple pre-generated dump files:

```bash
dotnet run --project AtsJsonGenerator.csproj -- batch \
  --input Aspire.Hosting.json Aspire.Hosting.Redis.json \
  --output-dir ../../frontend/src/data/ts-pkgs/
```

Or discover and dump all integration packages from a local Aspire repo clone:

```bash
dotnet run --project AtsJsonGenerator.csproj -- batch \
  --aspire-repo /path/to/microsoft/aspire \
  --output-dir ../../frontend/src/data/ts-pkgs/ \
  --version "13.2.0"
```

## Output Format

The generated JSON follows this schema:

```json
{
  "package": {
    "name": "Aspire.Hosting",
    "version": "13.2.0",
    "language": "typescript",
    "sourceRepository": "https://github.com/microsoft/aspire"
  },
  "functions": [
    {
      "name": "addContainer",
      "capabilityId": "Aspire.Hosting/addContainer",
      "qualifiedName": "addContainer",
      "description": "Adds a container resource",
      "kind": "Method",
      "signature": "addContainer(name: string, image: string): ContainerResource",
      "parameters": [...],
      "returnType": "ContainerResource",
      "returnsBuilder": true,
      "targetTypeId": "Aspire.Hosting/...",
      "expandedTargetTypes": [...]
    }
  ],
  "handleTypes": [
    {
      "name": "ContainerResource",
      "fullName": "Aspire.Hosting.ApplicationModel.ContainerResource",
      "kind": "handle",
      "isInterface": false,
      "capabilities": [...]
    }
  ],
  "dtoTypes": [...],
  "enumTypes": [...]
}
```

## Capability Kinds

- **Method** — Top-level functions called on the builder (e.g., `addContainer`, `withEndpoint`)
- **PropertyGetter** — Property access on handle types (e.g., `EndpointReference.port`)
- **PropertySetter** — Property mutation on handle types (e.g., `ExecuteCommandContext.setResourceName`)
- **InstanceMethod** — Methods called on handle instances (e.g., `DistributedApplication.run`)

## Building

```bash
cd src/tools/AtsJsonGenerator
dotnet build
```
