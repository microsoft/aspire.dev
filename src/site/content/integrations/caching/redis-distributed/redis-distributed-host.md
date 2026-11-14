---
title: Set up Redis distributed caching in the AppHost
description: Learn how to add a Redis resource to your AppHost for use with the Redis distributed caching client integration.
props:
  api_parameter_types:
    - Aspire.Hosting.ApplicationModel.IResourceBuilder<Aspire.Hosting.ApplicationModel.RedisResource>
    - string?
    - bool
  api_parameter_types_2:
    - Aspire.Hosting.ApplicationModel.IResourceBuilder<Aspire.Hosting.ApplicationModel.RedisResource>
    - string
    - bool
---

{% image "/assets/images/icons/redis-icon.png", alt: "Redis logo", width: 100, height: 100, class: "float-inline-left icon", zoomable: false %}

This article covers the minimum AppHost configuration required to use the Redis distributed caching client integration. The underlying hosting integration is the same `Aspire.Hosting.Redis` package used by the regular Redis integration — there is no separate "distributed" hosting package. For the complete AppHost API surface — data volumes, data bind mounts, persistence, Redis Insight, Redis Commander, parameters, custom environment variables, existing instances, and hosting health checks — see the [Redis Hosting integration](/integrations/caching/redis/redis-host/) reference.

If you're new to Redis distributed caching with Aspire, start with [Get started with Redis distributed caching](/integrations/caching/redis-distributed/redis-distributed-get-started/). For how consuming C# apps register `IDistributedCache`, see [Connect to Redis distributed caching](../redis-distributed-connect/).

## Installation

Install the [📦 Aspire.Hosting.Redis](https://www.nuget.org/packages/Aspire.Hosting.Redis) NuGet package in your AppHost project:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```bash title="Terminal"
aspire add redis
```

{% learnmore %}
Learn more about [`aspire add`](/reference/cli/commands/aspire-add/) in the command reference.
{% endlearnmore %}

This updates your `aspire.config.json` with the Redis hosting integration package:

```json title="aspire.config.json" ins={3}
{
  "packages": {
    "Aspire.Hosting.Redis": "%ASPIRE_VERSION%"
  }
}
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```bash title="Terminal"
aspire add redis
```

{% learnmore %}
Learn more about [`aspire add`](/reference/cli/commands/aspire-add/) in the command reference.
{% endlearnmore %}

Or, choose a manual installation approach:

```csharp title="AppHost.cs"
#:package Aspire.Hosting.Redis@*
```

```xml title="AppHost.csproj"
<PackageReference Include="Aspire.Hosting.Redis" Version="*" />
```
{% endtab %}
{% endtabs %}

## Add Redis resource

Once the hosting integration is installed, add a Redis resource in your AppHost and reference it from the apps that need distributed caching:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const cache = await builder.addRedis("cache");

await builder.addNodeApp("api", "./api", "index.js")
    .withReference(cache);

// After adding all resources, run the app...
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var cache = builder.AddRedis("cache");

var exampleProject = builder.AddProject<Projects.ExampleProject>("apiservice")
    .WithReference(cache);

// After adding all resources, run the app...
```
{% endtab %}
{% endtabs %}

{% steps %}
1. When Aspire adds a container image to the AppHost, as shown in the preceding example with the `docker.io/library/redis` image, it creates a new Redis instance on your local machine.

1. The AppHost reference call configures a connection in the consuming project named after the referenced Redis resource, such as `cache` in the preceding example.

1. The consuming C# project calls `AddRedisDistributedCache("cache")` in _Program.cs_ to register `IDistributedCache` using that connection. See [Connect to Redis distributed caching](../redis-distributed-connect/) for details.
{% endsteps %}

:::note
When you reference a Redis resource from the AppHost, Aspire makes the connection URI, hostname, port, and password available to the consuming project as environment variables. For a complete list of these properties, see [Connect to Redis distributed caching](../redis-distributed-connect/#connection-properties).
:::

## Full AppHost API reference

The Redis distributed caching integration shares the Redis hosting integration with the rest of the Redis ecosystem. For all available AppHost APIs, see the [Redis Hosting integration](/integrations/caching/redis/redis-host/) reference, which covers:

- {% api "Aspire.Hosting.RedisBuilderExtensions.WithDataVolume", parameter_types: props.api_parameter_types %} — persist Redis data outside the container lifecycle.
- {% api "Aspire.Hosting.RedisBuilderExtensions.WithDataBindMount", parameter_types: props.api_parameter_types_2 %} — bind-mount a host directory into the container.
- {% api "Aspire.Hosting.RedisBuilderExtensions.WithPersistence" %} — configure snapshotting interval and key-change threshold.
- {% api "Aspire.Hosting.RedisBuilderExtensions.WithRedisInsight" %} / {% api "Aspire.Hosting.RedisBuilderExtensions.WithRedisCommander" %} — attach management UIs.
- {% api "Aspire.Hosting.ParameterResourceBuilderExtensions.AddParameter" %} for explicit port and password — override auto-generated values.
- Custom environment variables — map connection properties to app-specific variable names.
- `AsExisting` — connect to an externally managed Redis instance instead of starting a container.
- Hosting health checks — automatically verify the Redis container is reachable.

:::tip[Registered trademark]{icon="information"}

<span id="registered-trademark"></span>
Redis is a registered trademark of Redis Ltd. Any rights therein are reserved to
Redis Ltd. Any use by Microsoft is for referential purposes only and does not
indicate any sponsorship, endorsement or affiliation between Redis and
Microsoft.

:::
