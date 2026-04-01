---
name: container-images
description: "Extracts all container image references (registry, image, tag) from the microsoft/aspire source code and produces a JSON data file for the aspire.dev Astro site. USE FOR: update container images JSON, refresh container image data, list all aspire container images, sync container image versions, generate container-images.json. DO NOT USE FOR: updating the container image versions in aspire source code itself (that's a product repo change), NuGet package data (use the integrations skill), or Dockerfile-based images for dev containers. INVOKES: bash, file read/write. FOR SINGLE OPERATIONS: Use grep/find to quickly check a single image tag."
---

# Container Images Skill

This skill extracts **every** container image reference from the [`microsoft/aspire`](https://github.com/microsoft/aspire) product repository and writes a structured JSON file to [`microsoft/aspire.dev`](https://github.com/microsoft/aspire.dev) at:

```
src/frontend/src/data/container-images.json
```

This JSON is consumed by Astro components on the aspire.dev site to render a browsable catalog of all container images used by .NET Aspire hosting integrations.

---

## Source code pattern

All container image metadata in `microsoft/aspire` lives in **static classes** named `*ContainerImageTags` (or `*ContainerImageTags.cs`). Each file follows a strict, consistent pattern:

```csharp
internal static class <Name>ContainerImageTags
{
    public const string Registry = "<registry-host>";
    public const string Image = "<image-path>";
    public const string Tag = "<tag>";

    // Some files have additional companion images, e.g.:
    public const string <Companion>Registry = "<registry-host>";
    public const string <Companion>Image = "<image-path>";
    public const string <Companion>Tag = "<tag>";
}
```

### Where to find them

All files matching the glob pattern:

```
src/**/ContainerImageTags.cs
src/**/*ContainerImageTags.cs
```

These span across many projects including (but not limited to):

| Project | File |
|---|---|
| `Aspire.Hosting.Redis` | `RedisContainerImageTags.cs` |
| `Aspire.Hosting.PostgreSQL` | `PostgresContainerImageTags.cs` |
| `Aspire.Hosting.SqlServer` | `SqlServerContainerImageTags.cs` |
| `Aspire.Hosting.MongoDB` | `MongoDBContainerImageTags.cs` |
| `Aspire.Hosting.MySql` | `MySqlContainerImageTags.cs` |
| `Aspire.Hosting.Kafka` | `KafkaContainerImageTags.cs` |
| `Aspire.Hosting.RabbitMQ` | `RabbitMQContainerImageTags.cs` |
| `Aspire.Hosting.Nats` | `NatsContainerImageTags.cs` |
| `Aspire.Hosting.Garnet` | `GarnetContainerImageTags.cs` |
| `Aspire.Hosting.Valkey` | `ValkeyContainerImageTags.cs` |
| `Aspire.Hosting.Seq` | `SeqContainerImageTags.cs` |
| `Aspire.Hosting.Qdrant` | `QdrantContainerImageTags.cs` |
| `Aspire.Hosting.Keycloak` | `KeycloakContainerImageTags.cs` |
| `Aspire.Hosting.Oracle` | `OracleContainerImageTags.cs` |
| `Aspire.Hosting.Milvus` | `MilvusContainerImageTags.cs` |
| `Aspire.Hosting.Elasticsearch` | `ElasticsearchContainerImageTags.cs` |
| `Aspire.Hosting.Yarp` | `YarpContainerImageTags.cs` |
| `Aspire.Hosting.Azure.Storage` | `StorageEmulatorContainerImageTags.cs` |
| `Aspire.Hosting.Azure.CosmosDB` | `CosmosDBEmulatorContainerImageTags.cs` |
| `Aspire.Hosting.Azure.ServiceBus` | `ServiceBusEmulatorContainerImageTags.cs` |
| `Aspire.Hosting.Azure.EventHubs` | `EventHubsEmulatorContainerImageTags.cs` |
| `Aspire.Hosting.Azure.SignalR` | `SignalREmulatorContainerImageTags.cs` |
| `Aspire.Hosting.Azure.AppConfiguration` | `AppConfigurationEmulatorContainerImageTags.cs` |
| `Aspire.Hosting.Azure.Functions` | `DurableTaskSchedulerEmulatorContainerImageTags.cs` |
| `Aspire.Hosting.Azure.Kusto` | `AzureKustoEmulatorContainerImageTags.cs` |

> **Important:** New hosting packages may be added at any time. Always discover files dynamically — never rely on a hardcoded list.

---

## Extraction procedure

### Step 1 — Clone or access the aspire repo at HEAD

```bash
# If working locally:
git clone --depth 1 https://github.com/microsoft/aspire.git /tmp/aspire
```

### Step 2 — Find all ContainerImageTags files

```bash
find /tmp/aspire/src -name '*ContainerImageTags.cs' -type f
```

### Step 3 — Parse each file

For each file, extract **all** image groups. A single file can define multiple images (primary + companions). The parsing rules are:

1. **Primary image**: Fields named exactly `Registry`, `Image`, `Tag`.
2. **Companion images**: Fields with a prefix, e.g. `PgAdminRegistry`, `PgAdminImage`, `PgAdminTag` — group them by the shared prefix.
3. **Alternate tags**: Fields like `TagVNextPreview`, `ManagementTag` — include these as additional tag variants on the same image.
4. **Static properties vs const fields**: Most use `public const string`, but some (e.g. Kusto) use `public static string { get; }`. Handle both.
5. **Computed tags**: Some tags are computed, e.g. `public const string ManagementTag = $"{Tag}-management";` — resolve these to their literal value.
6. **Derive the `aspirePackage`** from the project directory name (e.g. `src/Aspire.Hosting.Redis/` → `Aspire.Hosting.Redis`).
7. **Derive the `sourceFile`** as the path relative to the repo root.

### Step 4 — Build the JSON

Each entry in the output array represents **one distinct container image**:

```json
[
  {
    "aspirePackage": "Aspire.Hosting.Redis",
    "name": "Redis",
    "registry": "docker.io",
    "image": "library/redis",
    "tag": "8.6",
    "fullImage": "docker.io/library/redis:8.6",
    "sourceFile": "src/Aspire.Hosting.Redis/RedisContainerImageTags.cs",
    "sourceUrl": "https://github.com/microsoft/aspire/blob/main/src/Aspire.Hosting.Redis/RedisContainerImageTags.cs",
    "isCompanion": false,
    "companionOf": null,
    "alternateTags": []
  },
  {
    "aspirePackage": "Aspire.Hosting.Redis",
    "name": "Redis Commander",
    "registry": "docker.io",
    "image": "rediscommander/redis-commander",
    "tag": "latest",
    "fullImage": "docker.io/rediscommander/redis-commander:latest",
    "sourceFile": "src/Aspire.Hosting.Redis/RedisContainerImageTags.cs",
    "sourceUrl": "https://github.com/microsoft/aspire/blob/main/src/Aspire.Hosting.Redis/RedisContainerImageTags.cs",
    "isCompanion": true,
    "companionOf": "Redis",
    "alternateTags": []
  },
  {
    "aspirePackage": "Aspire.Hosting.Azure.CosmosDB",
    "name": "CosmosDB Emulator",
    "registry": "mcr.microsoft.com",
    "image": "cosmosdb/linux/azure-cosmos-emulator",
    "tag": "stable",
    "fullImage": "mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:stable",
    "sourceFile": "src/Aspire.Hosting.Azure.CosmosDB/CosmosDBEmulatorContainerImageTags.cs",
    "sourceUrl": "https://github.com/microsoft/aspire/blob/main/src/Aspire.Hosting.Azure.CosmosDB/CosmosDBEmulatorContainerImageTags.cs",
    "isCompanion": false,
    "companionOf": null,
    "alternateTags": ["vnext-preview"]
  }
]
```

### Field definitions

| Field | Type | Description |
|---|---|---|
| `aspirePackage` | string | The NuGet package / project name (directory name under `src/`) |
| `name` | string | Human-friendly name. For primary images, derive this from the class name (strip `ContainerImageTags` / `EmulatorContainerImageTags` suffix, split PascalCase). For companion images, derive this from the companion prefix/type (e.g. `PgAdmin*`, `RedisCommander*`) rather than only from the class name. |
| `registry` | string | Container registry host (e.g. `docker.io`, `mcr.microsoft.com`, `ghcr.io`, `quay.io`, `container-registry.oracle.com`) |
| `image` | string | Image path within the registry |
| `tag` | string | Primary tag |
| `fullImage` | string | Fully qualified image reference: `{registry}/{image}:{tag}` |
| `sourceFile` | string | Relative path to the source file in `microsoft/aspire` |
| `sourceUrl` | string | GitHub permalink to the source file on the `main` branch |
| `isCompanion` | boolean | `true` if this is a companion/tooling image (e.g. pgAdmin, Kafka UI, phpMyAdmin) |
| `companionOf` | string? | Name of the primary image this companions, or `null` |
| `alternateTags` | string[] | Any additional tag constants defined for this image (e.g. `vnext-preview`, `management`) |

### Step 5 — Sort and write

Sort the array by `aspirePackage` (ascending), then by `isCompanion` (primary first), then by `name` (ascending).

Write to: `src/frontend/src/data/container-images.json`

---

## Validation checklist

After generating the file, verify:

- [ ] Every `*ContainerImageTags.cs` file in `src/` is represented
- [ ] No duplicate entries (same `registry` + `image` + `tag` + `aspirePackage`)
- [ ] All `fullImage` values are well-formed (`registry/image:tag`)
- [ ] Companion images are correctly linked to their primary
- [ ] The JSON is valid and properly formatted (2-space indent)
- [ ] The file is sorted per the rules above

## Consuming the data in Astro

The JSON file at `src/frontend/src/data/container-images.json` can be imported directly in Astro components:

```typescript
import containerImages from '../data/container-images.json';
```

This follows the same pattern as existing data files like `aspire-integrations.json`, `samples.json`, and `github-stats.json` in the same directory.

## Linking to related content

Each container image entry can be cross-referenced with:

- The **integration docs** at `src/frontend/src/data/integration-docs.json` (match on `aspirePackage`)
- The **NuGet integrations** at `src/frontend/src/data/aspire-integrations.json` (match on `title` ≈ `aspirePackage`)
- The **source file** link back to `microsoft/aspire` for contributors

## Important rules

- **Always discover files dynamically** — new hosting packages are added frequently.
- **Parse both `const` and `static` property patterns** — they both exist in the codebase.
- **Resolve string interpolation** in computed tag values (e.g. `$"{Tag}-management"`).
- **Do not include** devcontainer images, test-only images, or images from the `playground/` directory.
- **Only extract from `src/` directory** files matching `*ContainerImageTags.cs`.
- **The aspire.dev repo is an Astro site** — the data file lives alongside other JSON data consumed by components.
