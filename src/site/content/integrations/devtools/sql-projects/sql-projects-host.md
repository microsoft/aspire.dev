---
title: Configure SQL Database Projects in AppHost
seoTitle: Configure SQL Database Projects in the Aspire AppHost
description: Reference the SQL Database Projects AppHost APIs for deploying DACPAC files, project outputs, and package schemas to SQL Server.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

{% image "/assets/images/icons/sql-database-projects-icon.png", alt: "SQL Database Projects icon", width: 100, height: 100, fit: "contain", class: "float-inline-left icon", zoomable: false %}

This reference covers the Community Toolkit SQL Database Projects hosting integration. If you are new to it, start with [Get started with SQL Database Projects](/integrations/devtools/sql-projects/sql-projects-get-started/).

## Installation

Add [📦 CommunityToolkit.Aspire.Hosting.SqlDatabaseProjects](https://www.nuget.org/packages/CommunityToolkit.Aspire.Hosting.SqlDatabaseProjects) to your AppHost:

{% install_package "CommunityToolkit.Aspire.Hosting.SqlDatabaseProjects" %}

Or add it manually:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```json title="aspire.config.json"
{
  "packages": {
    "CommunityToolkit.Aspire.Hosting.SqlDatabaseProjects": "*"
  }
}
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
#:package CommunityToolkit.Aspire.Hosting.SqlDatabaseProjects@*
```
{% endtab %}
{% endtabs %}

Run `aspire restore` after changing a TypeScript AppHost package configuration to regenerate `.aspire/modules/`.

## Add a project or DACPAC resource

{% api "Aspire.Hosting.SqlProjectBuilderExtensions.AddSqlProject" %} creates a `SqlProject` dashboard resource in the waiting state. It is a deployment resource, so it has no endpoint, environment variables, connection string, or health check. It implements standard wait support, which lets other resources use {% api "Aspire.Hosting.ResourceBuilderExtensions.WaitForCompletion" %}.

In a C# AppHost, use `AddSqlProject<TProject>` when the AppHost references an MSBuild SQL project. The generic project metadata overload resolves the project's `SqlTargetPath` or `TargetPath` output. Use the non-generic overload with `WithDacpac` when you already have a DACPAC.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const sql = await builder.addSqlServer('sql');
const database = await sql.addDatabase('catalog');
const databaseProject = await builder.addSqlProject('catalog-schema');

await databaseProject.withDacpac('../artifacts/catalog-schema.dacpac');
await databaseProject.withReference(database);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var database = builder.AddSqlServer("sql")
    .AddDatabase("catalog");

builder.AddSqlProject<Projects.Database>("catalog-schema")
    .WithReference(database);

builder.AddSqlProject("imported-schema")
    .WithDacpac("../artifacts/imported-schema.dacpac")
    .WithReference(database);

builder.Build().Run();
```

Add the SQL project as an AppHost project reference before using `Projects.Database`:

```xml title="AppHost.csproj"
<ProjectReference Include="..\Database\Database.sqlproj" />
```

:::note
Adding a SQL project reference currently produces warning `ASPIRE004` because the SQL project is not executable. The warning does not prevent the integration from resolving the DACPAC.
:::
{% endtab %}
{% endtabs %}

{% api "Aspire.Hosting.SqlProjectBuilderExtensions.WithDacpac" %} accepts a path to a `.dacpac` file. At deployment time, a relative DACPAC path is resolved against the AppHost content root. The integration does not set a working directory.

:::note
The generic `AddSqlProject<TProject>` overload is C# only. It requires `IProjectMetadata`, so TypeScript uses `addSqlProject(name)` and `withDacpac(path)` instead.
:::

## Deploy a DACPAC from a NuGet package

In C#, `AddSqlPackage<TPackage>` models a DACPAC contained in a NuGet package. Mark the package reference with `IsAspirePackageResource` so the generated `Packages.*` metadata type is available:

```xml title="AppHost.csproj"
<PackageReference Include="ErikEJ.Dacpac.Chinook" Version="1.0.0">
  <IsAspirePackageResource>true</IsAspirePackageResource>
</PackageReference>
```

```csharp title="AppHost.cs"
var packageSchema = builder.AddSqlPackage<Packages.ErikEJ_Dacpac_Chinook>("chinook")
    .WithDacpac("tools/ErikEJ.Dacpac.Chinook.dacpac")
    .WithReference(database);
```

The package resource uses `tools/<package-id>.dacpac` by default; `WithDacpac` selects a different path relative to the package. It also supports `WithDacDeployOptions`, `WithConfigureDacDeployOptions`, `WithSkipWhenDeployed`, and both `WithReference` target overloads. `AddSqlPackage<TPackage>` and these package APIs aren't exported to TypeScript because they require `IPackageMetadata`.

## Configure deployment

Use a DACFx publish profile with {% api "Aspire.Hosting.SqlProjectBuilderExtensions.WithDacDeployOptions" %}, or configure `DacDeployOptions` directly in a C# AppHost. A publish-profile path is loaded as supplied, so use a path that is valid for the AppHost process.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
const databaseProject = await builder.addSqlProject('catalog-schema');

await databaseProject.withDacpac('../artifacts/catalog-schema.dacpac');
await databaseProject.withDacDeployOptions('../Database/Database.publish.xml');
await databaseProject.withReference(database);
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var databaseProject = builder.AddSqlProject("catalog-schema")
    .WithDacpac("../artifacts/catalog-schema.dacpac")
    .WithConfigureDacDeployOptions(options =>
    {
        options.BlockOnPossibleDataLoss = false;
        options.DropObjectsNotInSource = true;
    })
    .WithReference(database);

var profileProject = builder.AddSqlProject("profile-schema")
    .WithDacpac("../artifacts/profile-schema.dacpac")
    .WithDacDeployOptions("../Database/Database.publish.xml")
    .WithReference(database);
```
{% endtab %}
{% endtabs %}

`WithConfigureDacDeployOptions(Action<DacDeployOptions>)` is C# only because callback options aren't exported to TypeScript. `WithDacDeployOptions(path)` is available in both AppHost languages.

## Avoid unchanged deployments

{% api "Aspire.Hosting.SqlProjectBuilderExtensions.WithSkipWhenDeployed" %} records a DACPAC checksum in the target database. On later deployments, the integration skips the DACPAC if the checksum is unchanged. It sets `DropExtendedPropertiesNotInSource` to `false` while this option is active.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
const databaseProject = await builder.addSqlProject('catalog-schema');

await databaseProject.withDacpac('../artifacts/catalog-schema.dacpac');
await databaseProject.withSkipWhenDeployed();
await databaseProject.withReference(database);

const dacpacPath = await databaseProject.dacpacPath();
const optionsPath = await databaseProject.dacDeployOptionsPath();
const skipWhenDeployed = await databaseProject.skipWhenDeployed();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var databaseProject = builder.AddSqlProject("catalog-schema")
    .WithDacpac("../artifacts/catalog-schema.dacpac")
    .WithSkipWhenDeployed()
    .WithReference(database);

var dacpacPath = databaseProject.Resource.DacpacPath;
var optionsPath = databaseProject.Resource.DacDeployOptionsPath;
var skipWhenDeployed = databaseProject.Resource.SkipWhenDeployed;
```
{% endtab %}
{% endtabs %}

Use this with a persistent database when avoiding an unchanged schema deployment improves AppHost startup time.

## Target a database

{% api "Aspire.Hosting.SqlProjectBuilderExtensions.WithReference" %} establishes a parent relationship to the target, waits for that target to be ready, and then deploys the DACPAC. A SQL Server database target supplies the database name automatically. You can instead target any connection-string resource; its connection string must contain `Database` or `Initial Catalog` so DACFx can infer the target database.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
const connection = await builder.addConnectionString('catalog');
const databaseProject = await builder.addSqlProject('catalog-schema');

await databaseProject.withDacpac('../artifacts/catalog-schema.dacpac');
await databaseProject.withConnectionReference(connection);
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var connection = builder.AddConnectionString("catalog");

builder.AddSqlProject("catalog-schema")
    .WithDacpac("../artifacts/catalog-schema.dacpac")
    .WithReference(connection);
```
{% endtab %}
{% endtabs %}

The SQL Server database overload is `withReference` in TypeScript. The connection-string overload is separately exported as `withConnectionReference`.

## Dashboard behavior and resource properties

When a referenced target becomes ready, the integration publishes the DACPAC and reports the deployment resource as `Running`, then `Finished` with exit code `0`; failures are reported in the resource logs and state. Use standard {% api "Aspire.Hosting.ResourceBuilderExtensions.WithExplicitStart" %} on a project or package resource to prevent that automatic deployment, then invoke its highlighted **Deploy** dashboard command. The command also deploys a schema again manually and is disabled while the resource is starting or running.

The preceding synchronized examples also show the `SqlProjectResource` properties exported to TypeScript AppHosts:

- `dacpacPath()` returns the path configured by `withDacpac`, or `null`.
- `dacDeployOptionsPath()` returns the publish-profile path configured by `withDacDeployOptions`, or `null`.
- `skipWhenDeployed()` returns whether `withSkipWhenDeployed` was applied.

`AddSqlProject(name)`, `withDacpac`, `withDacDeployOptions`, `withSkipWhenDeployed`, `withReference` for SQL Server databases, and `withConnectionReference` are marked for Aspire export and are available in the generated TypeScript module. The C# generic project/package APIs and the callback configuration API are explicitly excluded from Aspire export.

SQL project and package deployment resources are excluded from the Aspire manifest. Publishing/exporting the AppHost therefore doesn't emit a runnable SQL-project resource or deployment command; arrange schema deployment separately in the target environment.

{% learnmore %}
Learn how to configure the target SQL Server database in the [SQL Server
hosting integration](/integrations/databases/sql-server/sql-server-host/).
{% endlearnmore %}

## See also

- [MSBuild.Sdk.SqlProj](https://github.com/rr-wfm/MSBuild.Sdk.SqlProj)
- [Microsoft.Build.Sql](https://www.nuget.org/packages/Microsoft.Build.Sql)
- [Aspire Community Toolkit](https://github.com/CommunityToolkit/Aspire)
