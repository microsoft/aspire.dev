---
title: Connect Blazor apps and APIs
description: Learn which service discovery connection properties Aspire exposes for Blazor resources and how to wire Blazor apps to APIs through your AppHost.
---

{% image "/assets/images/icons/blazor-icon.svg", alt: "Blazor logo", width: 100, height: 100, class: "float-inline-left icon", zoomable: false %}

This page describes how to connect Blazor app resources and APIs after you've already modeled them in your AppHost. For the full hosting API surface, see [Set up Blazor hosting in the AppHost](../blazor-hosting/).

## Connection properties

When you use {% api "Aspire.Hosting.ResourceBuilderExtensions.WithReference" %}, Aspire publishes service discovery endpoint values as environment variables. The key format is:

- `services__{resource-name}__{endpoint-name}__{index}`

For example, if you reference an API resource named `weatherapi` with an `http` endpoint, Aspire exposes:

- `services__weatherapi__http__0`

Common properties used in Blazor-hosted app models are:

| Property                              | Description                                            |
| ------------------------------------- | ------------------------------------------------------ |
| `services__{resource}__http__0`       | The first HTTP endpoint URL for a referenced resource  |
| `services__{resource}__https__0`      | The first HTTPS endpoint URL for a referenced resource |
| `services__{resource}__{endpoint}__0` | A named endpoint URL when the endpoint name is custom  |

:::note
For a broader service discovery reference, including multi-language examples,
see [Service discovery](/fundamentals/service-discovery/).
:::

## Connect from your AppHost

Use the AppHost to connect APIs to a Blazor WebAssembly project resource, then associate the client app with a Blazor Gateway.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const weatherApi = await builder
  .addProject('weatherapi', '../WeatherApi/WeatherApi.csproj')
  .withHttpEndpoint({ name: 'http' });

const blazorApp = await builder
  .addBlazorWasmProject('app', '../Client/Client.csproj')
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

var weatherApi = builder.AddProject<Projects.WeatherApi>("weatherapi")
    .WithHttpEndpoint(name: "http");

var blazorApp = builder.AddBlazorWasmProject("app", "../Client/Client.csproj")
    .WithReference(weatherApi.GetEndpoint("http"));

builder.AddBlazorGateway("gateway")
    .WithExternalHttpEndpoints()
    .WithBlazorClientApp(blazorApp);

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

## Connect from consuming apps

Any app resource that references the same APIs can consume the `services__...` values directly.

{% tabs sync: "blazor-consuming-lang" %}
{% tab "C#" %}
```csharp title="Program.cs"
var weatherApiUrl = Environment.GetEnvironmentVariable("services__weatherapi__http__0");
```
{% endtab %}
{% tab "TypeScript" %}
```typescript title="index.ts"
const weatherApiUrl = process.env.services__weatherapi__http__0;
```
{% endtab %}
{% tab "Python" %}
```python title="app.py"
import os

weather_api_url = os.getenv("services__weatherapi__http__0")
```
{% endtab %}
{% endtabs %}

## See also

- [Set up Blazor hosting in the AppHost](/integrations/dotnet/blazor-hosting/)
- [Get started with Blazor hosting](/integrations/dotnet/blazor-get-started/)
- [Service discovery](/fundamentals/service-discovery/)
