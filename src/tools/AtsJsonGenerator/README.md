# AtsJsonGenerator

Transforms one `aspire sdk dump --format json` document into one
language-neutral AppHost API package in
`src/frontend/src/data/apphost-modules/`.

The generator preserves ATS identities and attaches projections for TypeScript,
Python, Go, Java, and Rust to every capability, handle, DTO, enum, and exported
value. A projection is either `supported` or `unsupported`; unsupported
projections always include a reason.

In addition to signatures and declarations, projections expose structured
language-specific data:

- DTO projections use `fields: [{ name, type, isOptional?, isNullable? }]`.
- Enum projections use `members: [{ name, value? }]`.
- Exported values use `valueExpression`.
- Handle projections use `kind: "interface" | "class" | "handle"` and
  `implementedInterfaces`.

The shared item retains the original ATS fields independently of these
language projections.

## Generate one package

```powershell
aspire sdk dump --format json -o Aspire.Hosting.dump.json

dotnet run --project .\AtsJsonGenerator.csproj -- `
  --input .\Aspire.Hosting.dump.json `
  --output ..\..\frontend\src\data\apphost-modules\Aspire.Hosting.json `
  --support-output .\Aspire.Hosting.support.json `
  --package-name Aspire.Hosting `
  --package-version 13.2.0 `
  --source-repo https://github.com/microsoft/aspire `
  --dump-cli-version 13.2.0 `
  --dump-product-commit 62028348b5d02dfc8f8baf03a4472946537b0d16
```

Use `--base <semantic-package.json>` for integration packages. Deduplication
removes matching ATS item identities after all five language projections have
been generated, so it cannot produce language-specific drift.

## Generate the package set

```powershell
.\generate-apphost-api-json.ps1 `
  -AspireRepoPath D:\GitHub\aspire `
  -SupportOutput ..\..\frontend\src\data\apphost-language-support.json
```

Without arguments, the script reads package names and versions from
`src/frontend/src/data/pkgs/`. Its default output directory is
`src/frontend/src/data/apphost-modules/`. The support output defaults to
`ASPIRE_API_LANGUAGE_SUPPORT_FILE`, when set, or
`src/frontend/src/data/apphost-language-support.json`.

Full runs aggregate exactly the staged semantic modules. Filtered and explicit
runs merge staged modules with the existing module directory, replacing every
successfully regenerated package while preserving unaffected packages. The
aggregation is performed by the C# `support` command:

Large interrupted runs can resume in disjoint explicit-package chunks without
redumping core. Pass `-BaseModulePath` with the completed
`Aspire.Hosting.<version>.json` semantic module so every integration still
deduplicates against core. `-SkipBuild` is available when the generator was
already built before launching parallel chunks.

```powershell
dotnet run --project .\AtsJsonGenerator.csproj -- support `
  --input-dir ..\..\frontend\src\data\apphost-modules `
  --output ..\..\frontend\src\data\apphost-language-support.json
```

`generate-ts-api-json.ps1` remains as a compatibility shim and forwards its
parameters to `generate-apphost-api-json.ps1` with a deprecation warning.

## Semantic package schema

```json
{
  "schemaVersion": "1.0",
  "generatorProvenance": {
    "repository": "microsoft/aspire",
    "commit": "62028348b5d02dfc8f8baf03a4472946537b0d16",
    "lockFile": "src/tools/AtsJsonGenerator/upstream-sources.lock.json"
  },
  "dumpProvenance": {
    "cliVersion": "13.2.0",
    "productCommit": "62028348b5d02dfc8f8baf03a4472946537b0d16"
  },
  "package": {
    "name": "Aspire.Hosting",
    "version": "13.2.0",
    "sourceRepository": "https://github.com/microsoft/aspire",
    "sourceCommit": "..."
  },
  "items": [
    {
      "id": "capability:Aspire.Hosting/addContainer",
      "kind": "capability",
      "name": "addContainer",
      "capabilityId": "Aspire.Hosting/addContainer",
      "parameters": [],
      "returnType": "ContainerResource",
      "projections": {
        "typescript": {
          "status": "supported",
          "validation": "source-derived",
          "identifier": "addContainer",
          "signature": "addContainer(name: string): Promise<ContainerResource>",
          "sourceFile": "aspire.mts",
          "parameters": [],
          "return": {
            "type": "Promise<ContainerResource>",
            "errorModel": "exception"
          }
        },
        "python": { "status": "supported", "validation": "source-derived", "identifier": "add_container", "sourceFile": "aspire.py" },
        "go": { "status": "supported", "validation": "source-derived", "identifier": "AddContainer", "sourceFile": "aspire.go" },
        "java": { "status": "supported", "validation": "source-derived", "identifier": "addContainer", "sourceFile": "Aspire.java" },
        "rust": { "status": "supported", "validation": "source-derived", "identifier": "add_container", "sourceFile": "lib.rs" }
      }
    }
  ]
}
```

The optional support matrix uses this contract:

```json
{
  "schemaVersion": "1.0",
  "generatedFrom": {
    "repository": "microsoft/aspire",
    "commit": "62028348b5d02dfc8f8baf03a4472946537b0d16",
    "lockFile": "src/tools/AtsJsonGenerator/upstream-sources.lock.json",
    "dumpProvenance": {
      "cliVersion": "13.2.0",
      "productCommit": "62028348b5d02dfc8f8baf03a4472946537b0d16"
    }
  },
  "packages": {
    "Aspire.Hosting@13.2.0": {
      "package": {
        "name": "Aspire.Hosting",
        "version": "13.2.0"
      },
      "items": {
        "capability:Aspire.Hosting/addContainer": {
          "kind": "capability",
          "name": "addContainer",
          "languages": {
            "typescript": { "supported": true, "validation": "source-derived" },
            "python": { "supported": true, "validation": "source-derived" },
            "go": { "supported": true, "validation": "source-derived" },
            "java": { "supported": true, "validation": "source-derived" },
            "rust": { "supported": true, "validation": "source-derived" }
          }
        }
      }
    }
  }
}
```

Transformation fails if any item is missing a language projection.

## Validation

```powershell
dotnet test ..\..\..\tests\AtsJsonGenerator.Tests\AtsJsonGenerator.Tests.csproj
```
