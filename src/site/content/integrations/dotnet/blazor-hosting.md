---
title: Set up Blazor hosting in the AppHost
seoTitle: 'Set up Blazor hosting in the Aspire AppHost'
description: Learn how to use the Aspire Blazor hosting integration APIs to model Blazor WebAssembly projects and a Blazor Gateway in your AppHost.
props:
  api_parameter_types:
    - Aspire.Hosting.ApplicationModel.IResourceBuilder<Aspire.Hosting.ApplicationModel.ProjectResource>
    - Aspire.Hosting.ApplicationModel.IResourceBuilder<Aspire.Hosting.BlazorWasmAppResource>
    - string
    - string
    - bool
---

{% image "/assets/images/icons/blazor-icon.svg", alt: "Blazor logo", width: 100, height: 100, class: "float-inline-left icon", zoomable: false %}

This article is the reference for the Aspire Blazor hosting integration. It lists the AppHost APIs — with examples for both `AppHost.cs` and `apphost.mts` — that you use to model Blazor WebAssembly projects and a Blazor Gateway in your [`AppHost`](/get-started/app-host/) project.

If you're new to this integration, start with [Get started with Blazor hosting](/integrations/dotnet/blazor-get-started/). For how apps connect through the gateway and service discovery properties, see [Connect Blazor apps and APIs](../blazor-connect/).

## Installation

To start building an Aspire app that uses Blazor hosting, install the [📦 Aspire.Hosting.Blazor](https://www.nuget.org/packages/Aspire.Hosting.Blazor) NuGet package:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```bash title="Terminal"
aspire add Aspire.Hosting.Blazor
```

{% learnmore %}
Learn more about [`aspire add`](/reference/cli/commands/aspire-add/) in the
command reference.
{% endlearnmore %}

This updates your `aspire.config.json` with the Blazor hosting package:

```json title="aspire.config.json" ins={3}
{
  "packages": {
    "Aspire.Hosting.Blazor": "%ASPIRE_VERSION%"
  }
}
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```bash title="Terminal"
aspire add Aspire.Hosting.Blazor
```

{% learnmore %}
Learn more about [`aspire add`](/reference/cli/commands/aspire-add/) in the
command reference.
{% endlearnmore %}

Or, choose a manual installation approach:

```csharp title="AppHost.cs"
#:package Aspire.Hosting.Blazor@*
```

```xml title="AppHost.csproj"
<PackageReference Include="Aspire.Hosting.Blazor" Version="*" />
```
{% endtab %}
{% endtabs %}

## Add Blazor WebAssembly project

Use {% api "Aspire.Hosting.BlazorGatewayExtensions.AddBlazorWasmProject" %} to add a Blazor WebAssembly project to the AppHost model.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const api = await builder.addProject('api', '../MyApi/MyApi.csproj');

const blazorApp = await builder
  .addBlazorWasmProject('app', '../MyBlazorApp/MyBlazorApp.csproj')
  .withReference(await api.getEndpoint('http'));

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var api = builder.AddProject<Projects.MyApi>("api");

var blazorApp = builder.AddBlazorWasmProject("app", "../MyBlazorApp/MyBlazorApp.csproj");
blazorApp.WithReference(api);

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

## Add Blazor Gateway

Use {% api "Aspire.Hosting.BlazorGatewayExtensions.AddBlazorGateway" %} to add the Blazor Gateway resource. The gateway is the browser-facing endpoint for your hosted Blazor app.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const gateway = await builder
  .addBlazorGateway('gateway')
  .withExternalHttpEndpoints();

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var gateway = builder.AddBlazorGateway("gateway")
    .WithExternalHttpEndpoints();

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

:::note
{% api "Aspire.Hosting.ResourceBuilderExtensions.WithExternalHttpEndpoints" %} marks the gateway endpoint as externally accessible so browser traffic can reach your app.
:::

## Associate a client app with the gateway

Use {% api "Aspire.Hosting.BlazorGatewayExtensions.WithBlazorClientApp", parameter_types: props.api_parameter_types %} to bind the WebAssembly project resource to the Blazor Gateway:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const weatherApi = await builder.addProject(
  'weatherapi',
  '../WeatherApi/WeatherApi.csproj'
);

const blazorApp = await builder
  .addBlazorWasmProject('app', '../MyBlazorApp/MyBlazorApp.csproj')
  .withReference(await weatherApi.getEndpoint('http'));

await builder
  .addBlazorGateway('gateway')
  .withExternalHttpEndpoints()
  .withBlazorClientApp(blazorApp);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var weatherApi = builder.AddProject<Projects.WeatherApi>("weatherapi");

var blazorApp = builder.AddBlazorWasmProject("app", "../MyBlazorApp/MyBlazorApp.csproj");
blazorApp.WithReference(weatherApi);

var gateway = builder.AddBlazorGateway("gateway")
    .WithExternalHttpEndpoints();

gateway.WithBlazorClientApp(blazorApp);

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

:::note
When you reference API endpoints from a Blazor app resource, Aspire publishes
service discovery connection properties to the consuming app. For details and
examples, see [Connect Blazor apps and APIs](../blazor-connect/).
:::

## Add a Blazor Gateway for a C# project resource

[`AddDotnetProjectBlazorGateway`](/reference/api/csharp/aspire.hosting.blazor/blazorgatewayextensions/methods/#adddotnetprojectblazorgateway) adds a Blazor Gateway that hosts a [`DotnetProjectResource`](/integrations/frameworks/dotnet/dotnet-host/) (a C# project or file-based app added with {% api "Aspire.Hosting.DotnetProjectHostingExtensions.AddDotnetProject" %}) instead of the standard `ProjectResource`-based gateway. Use the distinct [`WithBlazorClientApp`](/reference/api/csharp/aspire.hosting.blazor/blazorgatewayextensions/methods/#withblazorclientapp-iresourcebuilder-dotnetprojectresource-iresourcebuilder-blazorwasmappresource-string-string-bool) overload on this resource to attach a Blazor WebAssembly client app:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts" twoslash
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const client = await builder.addBlazorWasmProject(
  'client',
  '../Client/Client.csproj'
);
const gateway = await builder.addDotnetProjectBlazorGateway('gateway');

await gateway.withExternalHttpEndpoints();
await gateway.withBlazorClientApp(client);

await builder.build().run();
```
{% endtab %}

{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

#pragma warning disable ASPIREBLAZOR001

var client = builder.AddBlazorWasmProject<Projects.Client>("client");

builder.AddDotnetProjectBlazorGateway("gateway")
    .WithExternalHttpEndpoints()
    .WithBlazorClientApp(client);

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

:::note
`Aspire.Hosting.Blazor` is a prerelease package. Its APIs remain unstable and may change in future releases.

Starting with Aspire 13.6, {% api "Aspire.Hosting.BlazorGatewayExtensions.AddDotnetProjectBlazorGateway" %} and its `WithBlazorClientApp` overload no longer emit [`ASPIREDOTNETPROJECT001`](/diagnostics/aspiredotnetproject001/). You can remove existing suppressions for this diagnostic after upgrading.

The separate [`ASPIREBLAZOR001`](/diagnostics/aspireblazor001/) diagnostic still applies to experimental Blazor hosting types, such as `BlazorWasmAppResource`. Keep the `ASPIREBLAZOR001` suppression in the example.
:::

The gateway forwards the client's service references and supports publishing through the shared Blazor client attachment and publish-companion pipeline. Browser-debugger resources are created only for local runs.

## See also

- [Get started with Blazor hosting](/integrations/dotnet/blazor-get-started/)
- [Connect Blazor apps and APIs](/integrations/dotnet/blazor-connect/)
- [Set up .NET / C# apps in the AppHost](/integrations/frameworks/dotnet/dotnet-host/)
- [ASPIREDOTNETPROJECT001](/diagnostics/aspiredotnetproject001/)
- [Aspire integrations overview](/integrations/overview/)
