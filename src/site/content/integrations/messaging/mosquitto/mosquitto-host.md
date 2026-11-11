---
title: Set up Mosquitto with the Aspire integration
description: Configure the Mosquitto MQTT endpoint, protocol health check, persistent data, and broker configuration files in an Aspire AppHost.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

Use the Mosquitto hosting integration to run Eclipse Mosquitto as an Aspire container resource. For a short introduction, see [Get started with the Mosquitto integration](../mosquitto-get-started/).

## Installation

{% install_package "CommunityToolkit.Aspire.Hosting.Mosquitto" %}

## Add a Mosquitto resource

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();
const mqtt = await builder.addMosquitto('mqtt');

const api = await builder.addProject('api', '../Api/Api.csproj');
await api.withReference(mqtt);
await api.waitFor(mqtt);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);
var mqtt = builder.AddMosquitto("mqtt");

builder.AddProject<Projects.Api>("api")
    .WithReference(mqtt)
    .WaitFor(mqtt);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The resource exposes the MQTT protocol endpoint on container port `1883`. Aspire assigns a host port unless you specify `port`. The generated connection string uses `mqtt://host:port`. The integration's health check attempts an MQTT connection and reports healthy only after the broker accepts it.

## Persist broker data

The container stores state under `/mosquitto/data`. A volume preserves it independently of the container. A bind mount makes the files accessible from the host.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
const mqtt = await builder.addMosquitto('mqtt');
await mqtt.withDataVolume();
// Or use a host directory:
// await mqtt.withDataBindMount('./mosquitto-data');
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var mqtt = builder.AddMosquitto("mqtt")
    .WithDataVolume();
// Or use a host directory:
// var mqtt = builder.AddMosquitto("mqtt")
//     .WithDataBindMount("./mosquitto-data");
```
{% endtab %}
{% endtabs %}

## Customize broker configuration

The default `mosquitto.conf` listens on port `1883`, permits anonymous connections, and persists state under `/mosquitto/data`. Replace it with a configuration appropriate to your environment by copying a local configuration directory into the container:

```csharp title="AppHost.cs"
var mqtt = builder.AddMosquitto("mqtt")
    .WithContainerFiles("/mosquitto/config", "./mosquitto-config");
```

Keep authentication and listener settings aligned with the applications that connect to the broker. The default anonymous configuration is intended for local development, not an exposed production broker.

## AppHost API

| Method                                    | Purpose                                               |
| ----------------------------------------- | ----------------------------------------------------- |
| `AddMosquitto` / `addMosquitto`           | Add an MQTT broker, optionally pinning the host port. |
| `WithDataVolume` / `withDataVolume`       | Persist Mosquitto data in a named volume.             |
| `WithDataBindMount` / `withDataBindMount` | Persist Mosquitto data in a host directory.           |

## See also

- [Get started with the Mosquitto integration](../mosquitto-get-started/)
- [Mosquitto configuration documentation](https://mosquitto.org/man/mosquitto-conf-5.html)
- [CommunityToolkit.Aspire.Hosting.Mosquitto source and tests](https://github.com/CommunityToolkit/Aspire/tree/main/src/CommunityToolkit.Aspire.Hosting.Mosquitto)
