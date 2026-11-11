---
title: DuckDB hosting integration
description: Configure an embedded DuckDB file resource in the Aspire AppHost, select its database path, and pass writable or read-only connections.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

The DuckDB hosting integration describes a database file as a `DuckDBResource`. It starts no container or executable. The consuming app loads the embedded database engine. See [Get started with the DuckDB integration](/integrations/databases/duckdb/duckdb-get-started/) for the architecture.

## Installation

Install [📦 CommunityToolkit.Aspire.Hosting.DuckDB](https://nuget.org/packages/CommunityToolkit.Aspire.Hosting.DuckDB) in the AppHost:

{% install_package "CommunityToolkit.Aspire.Hosting.DuckDB" %}

For a TypeScript AppHost, add the package to the configuration to generate its bindings:

```json title="aspire.config.json"
{
  "packages": {
    "CommunityToolkit.Aspire.Hosting.DuckDB": "*"
  }
}
```

## Add DuckDB resource

Add a file resource named `analytics` and reference it from an ASP.NET Core project named `Api`. Reference that project from the C# AppHost to generate `Projects.Api`.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();
const analytics = await builder.addDuckDB('analytics');
const api = await builder.addProject('api', '../Api/Api.csproj');
await api.withReference(analytics);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var analytics = builder.AddDuckDB("analytics");
builder.AddProject<Projects.Api>("api")
    .WithReference(analytics);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

By default, the resource uses the AppHost process's temporary directory and a randomly generated filename ending in `.duckdb`. Each new resource declaration gets a new filename.

Before the application starts, the hosting integration creates the directory. DuckDB creates the file when a consuming app first opens a writable connection.

## Select a database path

Specify both the directory and filename to reuse a database across AppHost runs:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { fileURLToPath } from 'node:url';
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();
const databasePath = fileURLToPath(new URL('./data/', import.meta.url));
const analytics = await builder.addDuckDB('analytics', {
  databasePath,
  databaseFileName: 'analytics.duckdb',
});
const api = await builder.addProject('api', '../Api/Api.csproj');
await api.withReference(analytics);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);
var databasePath = Path.Combine(builder.AppHostDirectory, "data");

var analytics = builder.AddDuckDB(
    "analytics",
    databasePath: databasePath,
    databaseFileName: "analytics.duckdb");
builder.AddProject<Projects.Api>("api")
    .WithReference(analytics);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The filename includes its extension. The resource combines it with `databasePath` to produce the data source. There are no DuckDB-specific data-volume or bind-mount helpers because the resource is not a container.

:::caution
The consuming process must be able to access the configured path. A reference
does not mount or copy the file into containers or onto remote machines. On
non-Windows systems, startup changes an existing database file's permissions
to allow read/write access for user, group, and others. Use a directory with
appropriate access controls for sensitive data.
:::

## Open an existing database read-only

Prepare `data/warehouse.duckdb` before starting the AppHost. Configure read-only access to prevent the consuming connection from modifying it:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { fileURLToPath } from 'node:url';
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();
const databasePath = fileURLToPath(new URL('./data/', import.meta.url));
const analytics = await builder.addDuckDB('analytics', {
  databasePath,
  databaseFileName: 'warehouse.duckdb',
});
await analytics.withReadOnly();

const api = await builder.addProject('api', '../Api/Api.csproj');
await api.withReference(analytics);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var analytics = builder.AddDuckDB(
    "analytics",
    databasePath: Path.Combine(builder.AppHostDirectory, "data"),
    databaseFileName: "warehouse.duckdb")
    .WithReadOnly();
builder.AddProject<Projects.Api>("api")
    .WithReference(analytics);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The helper appends `;Access Mode=ReadOnly` to the connection string. It does not create a read-only database or change filesystem permissions. A missing file cannot be opened in read-only mode.

## Resource state and health behavior

The dashboard displays the resource with an initial `Running` state and the `DatabasePath` and `DatabaseFileName` properties. This state describes the file resource, not a successful database connection.

The hosting integration registers no health check. The [.NET client health check](/integrations/databases/duckdb/duckdb-connect/#client-integration-health-checks) opens a connection and executes `SELECT 1`.

## AppHost API surface

| C# API                                                          | TypeScript API                                        | Behavior                                                                                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `AddDuckDB(name, databasePath = null, databaseFileName = null)` | `addDuckDB(name, { databasePath, databaseFileName })` | Add a file resource. `name` is required; omitted directory and filename use a temporary path and random `.duckdb` filename. |
| `WithReadOnly()`                                                | `withReadOnly()`                                      | Set read-only access in the resource's connection string.                                                                   |

The public `DuckDBResource` constructor takes a name, directory, and filename. Its `ConnectionStringExpression` returns `DataSource={path}` or `DataSource={path};Access Mode=ReadOnly`. The path and read-only resource properties are internal, not exported TypeScript property getters.

## Connection properties

A reference supplies the full connection string and a `DataSource` property containing the file path. The property alone does not carry the read-only setting. See [DuckDB connection properties](/integrations/databases/duckdb/duckdb-connect/#connection-properties) for environment variable names and language examples.

## See also

- [Connect with the DuckDB integration](/integrations/databases/duckdb/duckdb-connect/)
- [DuckDB concurrency](https://duckdb.org/docs/stable/connect/concurrency)
- [DuckDB hosting source](https://github.com/CommunityToolkit/Aspire/tree/main/src/CommunityToolkit.Aspire.Hosting.DuckDB)
