---
title: Set up ActiveMQ with the Aspire integration
description: Configure ActiveMQ Classic or Artemis resources in an Aspire AppHost, including credentials, connection schemes, web consoles, and persistent storage.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

{% image "/assets/images/icons/activemq-icon.png", alt: "ActiveMQ logo", width: 100, height: 100, fit: "contain", style: "float: left; margin-right: 1rem;", zoomable: false %}

Use the ActiveMQ hosting integration to add ActiveMQ Classic or ActiveMQ Artemis to your Aspire application model. For an introduction, see [Get started with ActiveMQ integration](../activemq-get-started/).

## Installation

{% install_package "CommunityToolkit.Aspire.Hosting.ActiveMQ" %}

## Add an ActiveMQ resource

Pass Aspire parameters for the broker username and password. Aspire marks the password parameter as secret so its value is not displayed in plain text in the dashboard.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();
const username = await builder.addParameter('activemq-user', {
  value: 'admin',
  publishValueAsDefault: true,
});
const password = await builder.addParameter('activemq-password', {
  value: 'admin',
  secret: true,
});

const broker = await builder.addActiveMQ('activemq', {
  userName: username,
  password,
});
const api = await builder.addProject('api', '../Api/Api.csproj');
await api.withReference(broker);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);
var username = builder.AddParameter("activemq-user", "admin");
var password = builder.AddParameter("activemq-password", secret: true);

var broker = builder.AddActiveMQ("activemq", username, password);
builder.AddProject<Projects.Api>("api")
    .WithReference(broker);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The integration also provides `AddActiveMQArtemis` and `addActiveMQArtemis`. Both resource types accept optional host ports for the broker and web console.

## Configure the broker

The `scheme` argument controls the scheme in the broker connection URI. It defaults to `tcp`; use `activemq` when a client such as MassTransit expects that scheme.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
const broker = await builder.addActiveMQ('activemq', {
  userName: username,
  password,
  scheme: 'activemq',
  webPort: 8161,
});
await broker.withDataVolume();
await broker.withConfVolume();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var broker = builder.AddActiveMQ(
    "activemq",
    username,
    password,
    scheme: "activemq",
    webPort: 8161)
    .WithDataVolume()
    .WithConfVolume();
```
{% endtab %}
{% endtabs %}

Use the optional `port` argument to pin the broker's host port. Use `webPort` to pin the web console port. The data volume persists broker data outside the container lifecycle. The configuration volume lets you provide broker configuration files. Bind-mount alternatives are available through `WithDataBindMount` and `WithConfBindMount`.

## AppHost API

The package exports these hosting methods:

| Method                                      | Purpose                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `AddActiveMQ` / `addActiveMQ`               | Add an ActiveMQ Classic container with optional username, password, broker port, connection scheme, and web console port. |
| `AddActiveMQArtemis` / `addActiveMQArtemis` | Add an ActiveMQ Artemis container with the same options.                                                                  |
| `WithDataVolume` / `withDataVolume`         | Persist broker data in a named container volume.                                                                          |
| `WithDataBindMount` / `withDataBindMount`   | Store broker data in a host directory.                                                                                    |
| `WithConfVolume` / `withConfVolume`         | Mount configuration from a container volume.                                                                              |
| `WithConfBindMount` / `withConfBindMount`   | Mount configuration from a host directory.                                                                                |

## See also

- [Get started with ActiveMQ integration](../activemq-get-started/)
- [ActiveMQ Community Toolkit source and tests](https://github.com/CommunityToolkit/Aspire/tree/main/src/CommunityToolkit.Aspire.Hosting.ActiveMQ)
- [ActiveMQ Classic documentation](https://activemq.apache.org/components/classic/)
- [ActiveMQ Artemis documentation](https://activemq.apache.org/components/artemis/)
