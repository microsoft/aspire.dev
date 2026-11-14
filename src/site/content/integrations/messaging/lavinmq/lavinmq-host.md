---
title: Set up LavinMQ in the Aspire AppHost
description: Install the Community Toolkit LavinMQ hosting integration, configure broker ports, persist data, and open the management endpoint.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

{% image "/assets/images/icons/lavinmq-icon.png", alt: "LavinMQ logo", width: 100, height: 100, fit: "contain", class: "float-inline-left icon", zoomable: false %}

This article is the AppHost API reference for the [📦 CommunityToolkit.Aspire.Hosting.LavinMQ](https://www.nuget.org/packages/CommunityToolkit.Aspire.Hosting.LavinMQ) package. Start with [Get started with LavinMQ and Aspire](../lavinmq-get-started/) for the integration workflow, or see [Connect Aspire apps to LavinMQ](../lavinmq-connect/) for client examples.

## Installation

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```bash title="Terminal"
aspire add CommunityToolkit.Aspire.Hosting.LavinMQ
```

This adds the package to `aspire.config.json`. After `aspire restore`, `.aspire/modules/aspire.mjs` includes {% api "Aspire.Hosting.LavinMQHostingExtension.AddLavinMQ" %}, the persistence APIs, and the exported endpoint properties.
{% endtab %}
{% tab "C#", id: "csharp" %}
```bash title="Terminal"
aspire add CommunityToolkit.Aspire.Hosting.LavinMQ
```

Or add the package manually:

```csharp title="AppHost.cs"
#:package CommunityToolkit.Aspire.Hosting.LavinMQ@*
```

```xml title="AppHost.csproj"
<PackageReference Include="CommunityToolkit.Aspire.Hosting.LavinMQ" Version="*" />
```
{% endtab %}
{% endtabs %}

{% learnmore %}
Learn more about [`aspire add`](/reference/cli/commands/aspire-add/) and
[`aspire restore`](/reference/cli/commands/aspire-restore/).
{% endlearnmore %}

## Add a LavinMQ resource

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts" twoslash
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const lavinmq = await builder.addLavinMQ('lavinmq');

await builder
  .addNodeApp('worker', './worker', 'index.js')
  .withReference(lavinmq);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var lavinmq = builder.AddLavinMQ("lavinmq");

builder.AddProject<Projects.Worker>("worker")
    .WithReference(lavinmq);

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The integration runs `docker.io/cloudamqp/lavinmq:2.1.0`. The AMQP endpoint uses container port `5672`, and the management endpoint uses `15672`. The default username and password are both `guest`.

:::caution
The default `guest` credentials are intended for local development. Don't
expose the broker to untrusted networks with these credentials.
:::

## Configure host ports

Pass fixed host ports when another process needs stable endpoints:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts" twoslash
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const lavinmq = await builder.addLavinMQ('lavinmq', {
  amqpPort: 5672,
  managementPort: 15672,
});

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var lavinmq = builder.AddLavinMQ(
    "lavinmq",
    amqpPort: 5672,
    managementPort: 15672);

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

When you omit these parameters, the integration binds host ports `5672` and
`15672`. Pass alternative values when either port is already occupied.

## Persist data in a volume

{% api "Aspire.Hosting.LavinMQHostingExtension.WithDataVolume" %} requires a volume name and mounts it at `/var/lib/lavinmq`:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts" twoslash
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const lavinmq = await builder.addLavinMQ('lavinmq');
await lavinmq.withDataVolume('lavinmq-data');

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var lavinmq = builder.AddLavinMQ("lavinmq")
    .WithDataVolume("lavinmq-data");

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

## Persist data in a bind mount

Use a bind mount when you need direct access to broker files on the host:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts" twoslash
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const lavinmq = await builder.addLavinMQ('lavinmq');
await lavinmq.withDataBindMount('./lavinmq-data');

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var lavinmq = builder.AddLavinMQ("lavinmq")
    .WithDataBindMount(@"C:\LavinMQ\Data");

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

Both persistence methods accept an optional `isReadOnly` value. A read-only mount isn't suitable for a broker that needs to write data.

## Use endpoint properties

The resource exports its AMQP endpoint and connection expressions for use in custom AppHost expressions:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const lavinmq = await builder.addLavinMQ('lavinmq');
const primaryEndpoint = await lavinmq.primaryEndpoint();
const host = await lavinmq.host();
const port = await lavinmq.port();
const uri = await lavinmq.uriExpression();
const connectionString = await lavinmq.connectionStringExpression();

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var lavinmq = builder.AddLavinMQ("lavinmq");
var primaryEndpoint = lavinmq.Resource.PrimaryEndpoint;
var host = lavinmq.Resource.Host;
var port = lavinmq.Resource.Port;
var uri = lavinmq.Resource.UriExpression;
var connectionString = lavinmq.Resource.ConnectionStringExpression;

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

## Management UI

The management endpoint is added automatically. Open the `management` HTTP endpoint from the Aspire dashboard, then sign in with the broker credentials.

## Hosting integration health checks

The hosting integration registers a RabbitMQ-compatible health check against the AMQP endpoint. The dashboard reports the resource healthy after a client connection succeeds.

## See also

- [Connect Aspire apps to LavinMQ](../lavinmq-connect/)
- [LavinMQ documentation](https://lavinmq.com/documentation)
- [Persist data using volumes](/fundamentals/persist-data-volumes/)
- [📦 CommunityToolkit.Aspire.Hosting.LavinMQ](https://www.nuget.org/packages/CommunityToolkit.Aspire.Hosting.LavinMQ)
