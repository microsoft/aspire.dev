---
title: C# file-based apps
seoTitle: "Aspire C# file-based apps in the AppHost"
description: Learn how to use the Aspire C# file-based apps hosting integration to run single .cs files without a project file alongside your other AppHost resources.
---

:::danger[Experimental]
The {% api "Aspire.Hosting.ProjectResourceBuilderExtensions.AddCSharpApp" %} API is experimental and may change or be removed in future
releases. You must suppress the
[ASPIRECSHARPAPPS001](/diagnostics/aspirecsharpapps001/) diagnostic to use it.
:::

{% image "/assets/images/icons/csharp.svg", alt: "C# logo", width: 100, height: 100, class: "float-inline-left icon", zoomable: false %}

This article is the reference for the Aspire C# file-based apps hosting integration. It enumerates the AppHost APIs — with examples for both `AppHost.cs` and `apphost.mts` — that you use to model C# file-based app resources in your [`AppHost`](/get-started/app-host/) project.

C# file-based applications let you run single `.cs` files without a `.csproj` project file. This feature, built on .NET 10 SDK's file-based app support, integrates directly with Aspire's orchestration. Use `AddCSharpApp` (or `addCSharpApp` in TypeScript) to add these lightweight apps to your AppHost alongside traditional projects, containers, and executables.

## When to use file-based apps

Use file-based apps when you need to:

- Prototype a service quickly without project scaffolding.
- Run simple worker processes or background tasks.
- Create lightweight APIs with minimal ceremony.
- Experiment with Aspire integrations in a single file.

For production workloads or apps with multiple source files, use {% api "Aspire.Hosting.ProjectResourceBuilderExtensions.AddProject" %} with a standard `.csproj` project instead.

## Add C# app resource

Call `AddCSharpApp` with a resource name and the relative path to a `.cs` file. The path is resolved relative to the AppHost directory:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

await builder.addCSharpApp("worker", "../worker/Program.cs");

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
#pragma warning disable ASPIRECSHARPAPPS001

var builder = DistributedApplication.CreateBuilder(args);

builder.AddCSharpApp("worker", "../worker/Program.cs");

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

You can also point to a `.csproj` file or a directory that contains one:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

// Point to a .csproj file
await builder.addCSharpApp("api", "../api/Api.csproj");

// Point to a directory containing a .csproj file
await builder.addCSharpApp("frontend", "../frontend/");

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
#pragma warning disable ASPIRECSHARPAPPS001

var builder = DistributedApplication.CreateBuilder(args);

// Point to a .csproj file
builder.AddCSharpApp("api", "../api/Api.csproj");

// Point to a directory containing a .csproj file
builder.AddCSharpApp("frontend", "../frontend/");

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

:::tip
When pointing to a `.csproj` file or directory, `AddCSharpApp` behaves similarly to `AddProject<T>` but doesn't require a `ProjectReference` from the AppHost to the target project.
:::

{% learnmore %}
For more information about `AddProject`, project references, and generated `Projects` types, see [Project resources](/integrations/dotnet/project-resources/).
{% endlearnmore %}

## Add resource dependencies

File-based apps integrate fully with Aspire's resource model. You can reference other resources and configure service discovery just like any other project resource:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const cache = await builder.addRedis("cache");
const pg = await builder.addPostgres("pg");
const db = await pg.addDatabase("mydb");

await builder.addCSharpApp("worker", "../worker/Program.cs")
    .withReference(cache)
    .withReference(db)
    .withExternalHttpEndpoints();

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
#pragma warning disable ASPIRECSHARPAPPS001

var builder = DistributedApplication.CreateBuilder(args);

var cache = builder.AddRedis("cache");
var db = builder.AddPostgres("pg").AddDatabase("mydb");

builder.AddCSharpApp("worker", "../worker/Program.cs")
    .WithReference(cache)
    .WithReference(db)
    .WithExternalHttpEndpoints();

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The file-based app receives connection strings and service discovery information through environment variables, exactly like projects added with `AddProject<T>` (or `addProject`).

## Configure options

The C# `AddCSharpApp` method accepts an optional `Action<ProjectResourceOptions>` callback to configure launch settings:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
:::note
The TypeScript `addCSharpApp` API accepts a `ProjectResourceOptions` object via the `options` field, but creating and configuring that object from TypeScript is not yet directly supported. Launch profile customization for C# file-based apps is currently a C#-only feature.
:::
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
#pragma warning disable ASPIRECSHARPAPPS001

var builder = DistributedApplication.CreateBuilder(args);

builder.AddCSharpApp("api", "../api/Api.cs", options =>
{
    options.LaunchProfileName = "https";
    options.ExcludeLaunchProfile = false;
    options.ExcludeKestrelEndpoints = false;
});

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The available options are the same as those used with `AddProject<T>`:

| Option                    | Description                                                       |
| ------------------------- | ----------------------------------------------------------------- |
| `LaunchProfileName`       | The name of the launch profile to use from _launchSettings.json_. |
| `ExcludeLaunchProfile`    | When `true`, ignores launch profile settings.                     |
| `ExcludeKestrelEndpoints` | When `true`, doesn't automatically add Kestrel endpoints.         |

## File-based AppHost

You can also write the AppHost itself as a file-based C# app using the `#:sdk` directive:

```csharp title="apphost.cs"
#:sdk Aspire.AppHost.Sdk@%ASPIRE_VERSION%
#:package Aspire.Hosting.Redis@%ASPIRE_VERSION%

#pragma warning disable ASPIRECSHARPAPPS001

var builder = DistributedApplication.CreateBuilder(args);

var cache = builder.AddRedis("cache");

builder.AddCSharpApp("worker", "../worker/Program.cs")
    .WithReference(cache);

builder.Build().Run();
```

Use `#:package` directives to add NuGet package references directly in the source file instead of a `.csproj`.

:::note
A TypeScript AppHost (`apphost.mts`) is already a file-based script with no project file required. The `#:sdk` and `#:package` directives are specific to the C# file-based AppHost feature and have no TypeScript equivalent.
:::

{% learnmore %}
Learn more about the [Aspire SDK](/get-started/aspire-sdk/).
{% endlearnmore %}

## IDE debugging behavior

Visual Studio can only launch programs that are loaded as projects in the solution. A file-based `.cs` resource added with `AddCSharpApp` isn't a loaded project, so when the AppHost runs under a Visual Studio debug session, Aspire runs the file-based app as a plain process (`dotnet run --file`) instead of handing it to the IDE. The resource still starts and joins the AppHost's resource graph &mdash; it just doesn't get IDE-managed debugging in that scenario.

The Visual Studio Code extension explicitly advertises support for launching file-based apps, so file-based resources debug normally when the AppHost runs under VS Code.

{% learnmore %}
See [IDE hot reload and debugging](/app-host/hot-reload-and-watch/#ide-hot-reload-and-debugging).
{% endlearnmore %}

## Limitations

Since this feature is experimental, be aware of the following limitations:

- **Experimental status** &mdash; the API is marked with `[Experimental("ASPIRECSHARPAPPS001")]` and may change in future releases.
- **Single-file only** &mdash; file-based apps are limited to a single `.cs` file per resource.
- **.NET 10 SDK required** &mdash; file-based app execution requires the .NET 10 SDK or later.
- **No deployment support** &mdash; file-based apps are designed for local development scenarios.

## Suppress the diagnostic

To use `AddCSharpApp` in a C# AppHost, suppress the `ASPIRECSHARPAPPS001` diagnostic using one of these methods:

**In code** with a pragma directive:

```csharp title="AppHost.cs"
#pragma warning disable ASPIRECSHARPAPPS001
builder.AddCSharpApp("worker", "../worker/Program.cs");
#pragma warning restore ASPIRECSHARPAPPS001
```

**In your project file** with `NoWarn`:

```xml title="C# project file"
<PropertyGroup>
    <NoWarn>$(NoWarn);ASPIRECSHARPAPPS001</NoWarn>
</PropertyGroup>
```

**In an _.editorconfig_ file**:

```ini title=".editorconfig"
[*.{cs,vb}]
dotnet_diagnostic.ASPIRECSHARPAPPS001.severity = none
```

:::note
`ASPIRECSHARPAPPS001` is a C# compiler diagnostic. TypeScript AppHosts call `addCSharpApp` without any diagnostic suppression needed.
:::

{% learnmore %}
Learn more about [ASPIRECSHARPAPPS001](/diagnostics/aspirecsharpapps001/).
{% endlearnmore %}

## See also

- [What is the AppHost?](/get-started/app-host/)
- [Compiler Error ASPIRECSHARPAPPS001](/diagnostics/aspirecsharpapps001/)
- [Project resources](/integrations/dotnet/project-resources/)
- [Aspire SDK](/get-started/aspire-sdk/)
- [Executable resources](/app-host/executable-resources/)
- [What's new in Aspire 13.0](/whats-new/aspire-13/)
