---
title: SQLite Entity Framework Core integration
description: Register or enrich a SQLite EF Core DbContext in Aspire apps with connection configuration, database health checks, and EF Core tracing.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

{% image "/assets/images/icons/sqlite-icon.png", alt: "SQLite logo", width: 100, height: 100, fit: "contain", class: "float-inline-left icon", zoomable: false %}

The [Aspire Community Toolkit](https://github.com/CommunityToolkit/Aspire) SQLite Entity Framework Core integration registers a pooled `DbContext` against a SQLite database. It can also add health checks and EF Core tracing to a context that the app has already registered.

Use this package in the consuming .NET app. It does not create an AppHost resource or start a database server. For ADO.NET `SqliteConnection` registration instead of EF Core, see [Connect to SQLite](/integrations/databases/sqlite/sqlite-connect/).

## Installation

Install [📦 CommunityToolkit.Aspire.Microsoft.EntityFrameworkCore.Sqlite](https://nuget.org/packages/CommunityToolkit.Aspire.Microsoft.EntityFrameworkCore.Sqlite) in the project that uses the context:

{% install_dotnet_package "CommunityToolkit.Aspire.Microsoft.EntityFrameworkCore.Sqlite" %}

:::caution[Prerelease APIs]
This page documents the prerelease SQLite EF Core APIs. Install the package at version `13.6.2-beta.959`:

```bash title="Terminal"
package_version=13.6.2-beta.959
dotnet add package CommunityToolkit.Aspire.Microsoft.EntityFrameworkCore.Sqlite --version "$package_version"
```

Stable version `9.7.2` supports pooled context registration and health checks, but does not provide existing-context enrichment or the tracing settings shown here. The unversioned installation command can select that older stable version.
:::

Provide a `DbContext` implementation and either a referenced SQLite file resource or a configured SQLite connection string.

## Reference a SQLite resource

Install the [SQLite hosting integration](/integrations/databases/sqlite/sqlite-host/) in the AppHost. Add a file resource named `sqlite`, then reference it from an ASP.NET Core project named `Api`. Add a project reference in the C# AppHost to generate `Projects.Api`.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();
const sqlite = await builder.addSqlite('sqlite');
const api = await builder.addProject('api', '../Api/Api.csproj');
await api.withReference(sqlite);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var sqlite = builder.AddSqlite("sqlite");
builder.AddProject<Projects.Api>("api")
    .WithReference(sqlite);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The hosting resource's connection string is `Data Source={databaseFilePath};Cache=Shared;Mode=ReadWriteCreate`. Aspire injects it as `ConnectionStrings__sqlite`; .NET reads it from `ConnectionStrings:sqlite`. The reference also supplies `SQLITE_DATASOURCE`, containing only the file path.

The EF Core integration reads the named connection string, not `SQLITE_DATASOURCE`. Keep the connection name passed to registration identical to the resource name.

:::caution
SQLite runs in the consuming process. A resource reference passes a file path,
not database contents or a filesystem mount. The process must have access to
the path. Configure a stable path for persistence and explicit mounts for
containerized consumers.
:::

## Add SQLite DbContext

Call `AddSqliteDbContext<TContext>` to register a context through `AddDbContextPool`. The context is resolved as a scoped service and its instances are pooled.

This complete development example creates the schema and exposes a query endpoint:

```csharp title="Program.cs"
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;

var builder = WebApplication.CreateBuilder(args);
builder.AddSqliteDbContext<NotesContext>("sqlite");

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<NotesContext>();
    await context.Database.EnsureCreatedAsync();
}

app.MapGet("/notes", async (NotesContext context) =>
    await context.Notes.AsNoTracking().ToListAsync());
app.Run();

public sealed class NotesContext(DbContextOptions<NotesContext> options)
    : DbContext(options)
{
    public DbSet<Note> Notes => Set<Note>();
}

public sealed class Note
{
    public int Id { get; set; }
    public string Text { get; set; } = "";
}
```

Registration configures `UseSqlite` with the resolved connection string. It does not apply migrations, seed data, or create application tables. Do not register the same context separately before calling this API.

:::note
`EnsureCreatedAsync` is suitable for this local demonstration. Use [EF Core
migrations](https://learn.microsoft.com/ef/core/managing-schemas/migrations/)
for a database whose schema must evolve. Follow [context pooling
guidance](https://learn.microsoft.com/ef/core/performance/advanced-performance-topics#dbcontext-pooling)
before storing per-request state in a pooled context.
:::

## Enrich an existing context

Use `EnrichSqliteDatabaseDbContext<TDbContext>` when the application already owns its context registration. Register and configure the SQLite provider first:

```csharp title="Program.cs"
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;

var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("sqlite")
    ?? throw new InvalidOperationException("ConnectionStrings:sqlite is required");

builder.Services.AddDbContext<NotesContext>(options =>
    options.UseSqlite(connectionString));
builder.EnrichSqliteDatabaseDbContext<NotesContext>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<NotesContext>();
    await context.Database.EnsureCreatedAsync();
}

app.MapGet("/notes", async (NotesContext context) =>
    await context.Notes.AsNoTracking().ToListAsync());
app.Run();

public sealed class NotesContext(DbContextOptions<NotesContext> options)
    : DbContext(options)
{
    public DbSet<Note> Notes => Set<Note>();
}

public sealed class Note
{
    public int Id { get; set; }
    public string Text { get; set; } = "";
}
```

Enrichment checks that the context is registered and adds the integration's health checks and tracing. It does not register a context, select a connection name, replace the connection string, enable pooling, or configure retries.

The exported overload takes only an optional `Action<SqliteEntityFrameworkCoreSettings>` after the builder. To disable tracing, use `settings => settings.DisableTracing = true`; there is no connection-name or `enableOpenTelemetry` parameter on this method.

## Configuration

### Connection strings

For an app running without the AppHost, configure the same name used by `AddSqliteDbContext`:

```json title="appsettings.json"
{
  "ConnectionStrings": {
    "sqlite": "Data Source=C:\\Data\\notes.db"
  }
}
```

See [Microsoft.Data.Sqlite connection strings](https://learn.microsoft.com/dotnet/standard/data/sqlite/connection-strings) for supported provider options.

### Configuration providers

The settings section is `Aspire:Sqlite:EntityFrameworkCore:Sqlite`. Context-specific settings use the context's simple type name beneath that section:

```json title="appsettings.json"
{
  "Aspire": {
    "Sqlite": {
      "EntityFrameworkCore": {
        "Sqlite": {
          "ConnectionString": "Data Source=C:\\Data\\notes.db",
          "DisableHealthChecks": false,
          "DisableTracing": false,
          "NotesContext": {
            "DisableTracing": true
          }
        }
      }
    }
  }
}
```

For registration, the integration reads the base and context-specific settings, then replaces `ConnectionString` with the named `ConnectionStrings` value if present. The inline settings delegate runs last. Connection-string validation is delayed until the context is requested.

Enrichment binds settings for instrumentation but leaves the existing context's database options unchanged.

### Inline delegates and database options

The registration API accepts a settings delegate and a `DbContextOptionsBuilder` delegate. The options delegate runs after `UseSqlite`:

```csharp title="Program.cs"
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;

var builder = WebApplication.CreateBuilder(args);
builder.AddSqliteDbContext<NotesContext>(
    "sqlite",
    configureSettings: settings => settings.DisableTracing = true,
    configureDbContextOptions: options =>
        options.UseSqlite(sqlite => sqlite.CommandTimeout(30)));

var app = builder.Build();
app.MapGet("/database-ready", async (NotesContext context) =>
    await context.Database.CanConnectAsync());
app.Run();

public sealed class NotesContext(DbContextOptions<NotesContext> options)
    : DbContext(options)
{
}
```

This sets a provider command timeout of 30 seconds. `SqliteEntityFrameworkCoreSettings` exports `ConnectionString`, `DisableHealthChecks`, `DisableTracing`, and `DefaultTimeout`. Both disable flags default to `false`.

:::note
The exported `DefaultTimeout` setting is not applied by the integration's
current implementation. Configure command timeout through EF Core provider
options, as above, rather than relying on that setting.
:::

There is no keyed-context registration API. Use distinct context types for independently configured databases.

## Client integration health checks

Unless disabled, the integration registers `AddDbContextCheck<TContext>` using the context's simple type name as the check name. The default EF Core check calls `Database.CanConnectAsync` to verify database connectivity. It does not prove that migrations or application tables exist.

Set `DisableHealthChecks=true` through configuration or either API's settings delegate to omit the check. Use [service defaults](/get-started/csharp-service-defaults/) to map the registered checks to HTTP endpoints.

## Observability and telemetry

Unless `DisableTracing` is `true`, the integration registers EF Core OpenTelemetry instrumentation. Configure exporters, for example through service defaults, to view EF Core traces in the dashboard.

The integration does not register a metrics meter, logging provider, or retry policy. EF Core uses normal .NET logging. Configure database logging through the application's logging settings.

This client package is .NET-specific. TypeScript AppHost support applies to the referenced SQLite hosting resource, not to EF Core context registration.

## See also

- [SQLite hosting integration](/integrations/databases/sqlite/sqlite-host/)
- [Connect to SQLite with ADO.NET or other languages](/integrations/databases/sqlite/sqlite-connect/)
- [EF Core SQLite provider](https://learn.microsoft.com/ef/core/providers/sqlite/)
- [SQLite EF Core integration source](https://github.com/CommunityToolkit/Aspire/tree/main/src/CommunityToolkit.Aspire.Microsoft.EntityFrameworkCore.Sqlite)
