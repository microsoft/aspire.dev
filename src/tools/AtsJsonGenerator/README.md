# AtsJsonGenerator

Transforms `aspire sdk dump --format json` output into structured JSON files for the aspire.dev TypeScript and Go API reference pages.

## Overview

The Aspire CLI can emit a JSON description of all polyglot-accessible capabilities for any hosting package via `aspire sdk dump --format json`. This tool transforms that output into a docs-friendly JSON format suitable for consumption by Astro's content collections. `--language typescript` (the default) writes the TypeScript modules and `--language go` writes the [Go modules](#go-output).

The companion `generate-ts-api-json.ps1` script reads the generated C# package JSON files in `src/frontend/src/data/pkgs/` and regenerates TypeScript API JSON using the same `Aspire.Hosting*` and `CommunityToolkit.Aspire.Hosting*` package/version sets. Modules with no generated functions or types are omitted so empty packages don't appear in the API reference. Pass `-Language go` to generate the Go modules into `src/frontend/src/data/go-modules/` from the same package/version sets; the concurrency, timeout, retry and diagnostic behavior below applies to both languages.

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

## Go output

`--language go` (`-l go`) writes the JSON behind the Go API reference in `src/frontend/src/data/go-modules/`. It reuses the naming and type rules of the Go AppHost SDK generator (`Aspire.Hosting.CodeGeneration.Go` in [microsoft/aspire](https://github.com/microsoft/aspire)), so signatures show the Go that an AppHost author writes. `typescript` stays the default and its output is unchanged.

A Go AppHost compiles every package it uses into one flat `package aspire` (import path `apphost/modules/aspire`). A docs module is the contributing NuGet package, so each module has its own `package.name` and the same `package.importPath`.

### Go usage

Generate `Aspire.Hosting` first, then pass it, and any supporting packages, as `--base` for the packages that build on it:

```bash
dotnet run --project AtsJsonGenerator.csproj -- \
  --language go \
  --input Aspire.Hosting.dump.json \
  --output ../../frontend/src/data/go-modules/Aspire.Hosting.json \
  --package-name "Aspire.Hosting" \
  --source-repo "https://github.com/microsoft/aspire"

dotnet run --project AtsJsonGenerator.csproj -- \
  --language go \
  --input Aspire.Hosting.Redis.dump.json \
  --output ../../frontend/src/data/go-modules/Aspire.Hosting.Redis.json \
  --package-name "Aspire.Hosting.Redis" \
  --base ../../frontend/src/data/go-modules/Aspire.Hosting.json
```

`--base` accepts Go JSON only. It removes the functions, handles, DTOs, enums and exported values that a base already documents, and it seeds name resolution so the retained signatures use the base's exact type names. When two bases document the same type, the first `--base` wins. Without a base, a module also lists the core handle types that its dump references. `batch` accepts `--language` too, but it has no `--base`.

To refresh the committed data for every package, run `pnpm update:go-api` from `src/frontend`. It drives `generate-ts-api-json.ps1 -Language go`, which generates `Aspire.Hosting` first so that every other module resolves its names against it.

### Go output format

```json
{
  "package": {
    "name": "Aspire.Hosting.Redis",
    "version": "13.6.0",
    "language": "go",
    "importPath": "apphost/modules/aspire",
    "sourceRepository": "https://github.com/microsoft/aspire"
  },
  "functions": [
    {
      "name": "AddRedis",
      "capabilityId": "Aspire.Hosting.Redis/addRedis",
      "qualifiedName": "addRedis",
      "description": "Adds a Redis container to the application model.",
      "returns": "The resource builder.",
      "kind": "Method",
      "signature": "AddRedis(name string, options ...*AddRedisOptions) RedisResource",
      "receiver": "DistributedApplicationBuilder",
      "parameters": [{ "name": "name", "type": "string", "description": "..." }],
      "options": {
        "typeName": "AddRedisOptions",
        "fields": [{ "name": "Port", "jsonName": "port", "type": "*float64", "description": "..." }]
      },
      "returnType": "RedisResource",
      "errorModel": "deferred",
      "returnsBuilder": true,
      "targetTypeId": "Aspire.Hosting/Aspire.Hosting.IDistributedApplicationBuilder",
      "expandedTargetTypes": ["Aspire.Hosting.IDistributedApplicationBuilder"],
      "appliesTo": ["DistributedApplicationBuilder"]
    }
  ],
  "handleTypes": [
    {
      "name": "RedisResource",
      "fullName": "Aspire.Hosting.ApplicationModel.RedisResource",
      "kind": "handle",
      "implementedInterfaces": ["IComputeResource", "ResourceWithConnectionString"],
      "capabilities": [...],
      "synthesizedMembers": []
    }
  ],
  "dtoTypes": [...],
  "enumTypes": [...],
  "exportedValues": [...]
}
```

Reading the model (boolean properties that are `false` are not written):

- **Names.** `name` is the Go name. `qualifiedName` stays the ATS name that the TypeScript module uses (for example `RedisResource.connectionStringExpression`); a name without a `.` is a package-level extension export and a dotted name belongs to a handle type.
- **Signature and options.** `signature` omits the `func` keyword. Required parameters are positional; optional parameters become the fields of a trailing `options ...*<Name>Options` argument that `options.fields` documents. A field has a `jsonName` unless it is a callback (`isCallback`, with a `callbackSignature`). When `options.isDirect` is true the options type is an existing DTO and `fields` is empty.
- **Error model.** `errorModel` is `returned` (a trailing `error` result), `deferred` (a fluent handle return; failures surface when `Err()` is checked on a later result) or `none` (for example a mutable list or dictionary accessor).
- **Fluent returns.** `returnsBuilder` marks a method that returns a resource builder. `returnsReceiver` marks a method that returns the type it was called on, so each type in `appliesTo` substitutes its own name for `returnType`.
- **`appliesTo`.** The Go names of the concrete handle types that expose the function, with interface targets expanded. A handle's `capabilities` lists only functions that target it directly, so a page must combine them with every function whose `appliesTo` names the type, across all modules.
- **Handles.** `isMarker` handles are interface metadata that declare no methods of their own in Go; their methods live on each concrete implementing type. `implementedInterfaces` holds Go names. `synthesizedMembers` lists the hand-written members the Go SDK adds on top of the generated ones, for example `Get`, `Required`, `Value` and `RequiredValue` on `InteractionInputCollection`.
- **DTOs, enums and exported values.** DTO fields use Go types (`[]T`, `map[K]V`, `*T` when optional, `any` for unions). Enum members are `<EnumName><Value>` constants. Exported values are grouped by their first path segment, and each entry's `value` is the Go literal text.
- **Prose.** `description`, `remarks` and `returns` come from XML documentation and can contain markdown. `remarks` can contain an unclosed code fence, so consumers must tolerate that.

### Go limitations

- **Azure Provisioning proxies.** `generate-ts-api-json.ps1 -Language go` skips the generated `Aspire.Hosting.Azure.Provisioning.<Service>` packages. Each one projects an entire `Azure.Provisioning` library, which comes to about 72 MB of JSON and tens of thousands of member pages, against about 6 MB for every other package combined. The base `Aspire.Hosting.Azure.Provisioning` package is kept, and a full run removes any stale output for the skipped packages.
- **Per-package names.** Names are resolved one dump at a time, seeded by the `--base` modules. A collision gets the sanitized assembly name as a prefix, then a numeric suffix, and a foreign interface that no base documents is assumed to be an exported handle. A real AppHost resolves names across all of its packages, so two integrations that define the same simple name can be named differently here. Don't assume a name is unique across modules, and generate packages in a stable order.
- **Skipped capabilities.** A capability with no concrete Go type to receive it is left out and reported as `Skipped N capabilities without a concrete Go type`. Runtime-provided capabilities (on `ReferenceExpression` or on a mutable list or dictionary) are omitted silently.
- **Callback properties on DTOs.** The dump doesn't carry the signature of a callback property, so these render as `func(...any) any` where the SDK has a typed callback (for example `CommandOptions.UpdateState`).
- **Enums.** Enum values come from the dump, supplemented by `aspire sdk export` when the package has generated exports. An enum that a signature references but the dump doesn't declare (for example `HealthStatus`) has no page.
- **SDK helper types.** Types that the Go SDK hand-writes in `base.go` are not generated, so they have no page.

## Building

```bash
cd src/tools/AtsJsonGenerator
dotnet build
```
