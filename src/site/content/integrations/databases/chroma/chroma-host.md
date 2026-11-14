---
title: Chroma hosting integration
description: Configure a Chroma container in the Aspire AppHost with data persistence, HTTP heartbeat health checks, and consuming-app references.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

:::caution[Package availability]
`CommunityToolkit.Aspire.Hosting.Chroma` is present in the Toolkit source but is not currently published on nuget.org. The installation commands below apply once it is published. To evaluate these verified APIs now, build the integration from the [Toolkit source](https://github.com/CommunityToolkit/Aspire/tree/main/src/CommunityToolkit.Aspire.Hosting.Chroma) and use its local package output.
:::

The Chroma hosting integration adds a `ChromaResource` to the AppHost. Start with [Get started with the Chroma integration](/integrations/databases/chroma/chroma-get-started/) for the architecture, or see [Connect with the Chroma integration](/integrations/databases/chroma/chroma-connect/) for consuming-app setup.

## Installation

Install [📦 CommunityToolkit.Aspire.Hosting.Chroma](https://nuget.org/packages/CommunityToolkit.Aspire.Hosting.Chroma) in the AppHost:

{% install_package "CommunityToolkit.Aspire.Hosting.Chroma" %}

For a TypeScript AppHost, include the package in `aspire.config.json` to generate its bindings:

```json title="aspire.config.json"
{
  "packages": {
    "CommunityToolkit.Aspire.Hosting.Chroma": "*"
  }
}
```

## Add Chroma resource

Add a resource named `chroma` and reference it from an ASP.NET Core project named `Api`. The C# AppHost must reference that project so the `Projects.Api` type is generated.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();
const chroma = await builder.addChroma('chroma');
const api = await builder.addProject('api', '../Api/Api.csproj');
await api.withReference(chroma);
await api.waitFor(chroma);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var chroma = builder.AddChroma("chroma");
builder.AddProject<Projects.Api>("api")
    .WithReference(chroma)
    .WaitFor(chroma);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The default container image is `docker.io/chromadb/chroma:1.5.9`. The `http` endpoint targets port `8000` inside the container. Aspire allocates the host port unless one is supplied.

`WithReference` supplies connection information; `WaitFor` delays the consuming app until the Chroma resource is healthy.

## Configure port and persistence

Use a named volume to retain collections when the container is replaced. Set the optional host port only when another local tool needs a predictable address.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();
const chroma = await builder.addChroma('chroma', { port: 8000 });
await chroma.withDataVolume({ name: 'chroma-data' });

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

builder.AddChroma("chroma", port: 8000)
    .WithDataVolume("chroma-data");

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The volume mounts at `/data`. Omitting the volume name generates one based on the application and resource names. The helper also sets `PERSIST_DIRECTORY=/data` for compatible Chroma 0.x images; Chroma 1.x uses `/data` as its configured persistence path.

### Use a bind mount

Choose a bind mount when host tools need direct access to the data directory. Create a directory accessible to the container runtime and pass its path:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createBuilder } from './.aspire/modules/aspire.mjs';

const dataDirectory = fileURLToPath(new URL('./chroma-data/', import.meta.url));
await mkdir(dataDirectory, { recursive: true });

const builder = await createBuilder();
const chroma = await builder.addChroma('chroma');
await chroma.withDataBindMount(dataDirectory);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);
var dataDirectory = Path.Combine(builder.AppHostDirectory, "chroma-data");
Directory.CreateDirectory(dataDirectory);

builder.AddChroma("chroma")
    .WithDataBindMount(dataDirectory);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The bind mount also targets `/data` and sets `PERSIST_DIRECTORY=/data`. Use either the data volume or the bind mount for that target, not both.

## Hosting integration health checks

The integration registers an HTTP health check for `/api/v2/heartbeat`. It verifies that the server answers its v2 heartbeat endpoint, not that a particular collection exists.

:::caution
Select a Chroma image that supports the v2 heartbeat endpoint. Versions older
than Chroma 0.5.16 return `404` for that path and do not become healthy. In
Docker Compose publishing, `WaitFor(chroma)` waits for container startup; the
HTTP check is not translated into a Compose `healthcheck`.
:::

## Logs and telemetry

In run mode, the resource sets `CHROMA_STDOUT_TRACING=true` so Chroma writes served requests to its console log. The dashboard displays these logs. Published applications do not receive this variable automatically.

To disable request logs, override the variable:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();
const chroma = await builder.addChroma('chroma');
await chroma.withEnvironment('CHROMA_STDOUT_TRACING', 'false');

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

builder.AddChroma("chroma")
    .WithEnvironment("CHROMA_STDOUT_TRACING", "false");

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The hosting integration does not forward Chroma server OTLP telemetry to the dashboard. The [.NET client integration](/integrations/databases/chroma/chroma-connect/#observability-and-telemetry) configures client-side tracing and metrics separately.

## AppHost API surface

| C# API                         | TypeScript API              | Behavior                                                                                                    |
| ------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `AddChroma(name, port = null)` | `addChroma(name, { port })` | Add a container. `name` is required and becomes the connection name; `port` optionally fixes the host port. |
| `WithDataVolume(name = null)`  | `withDataVolume({ name })`  | Mount a named volume at `/data`; generate its name when omitted.                                            |
| `WithDataBindMount(source)`    | `withDataBindMount(source)` | Mount the required host directory at `/data`.                                                               |

`ChromaResource` exposes `PrimaryEndpoint`, `Host`, `Port`, `ConnectionStringExpression`, and `UriExpression`. TypeScript exposes the corresponding getters as `primaryEndpoint()`, `host()`, `port()`, `connectionStringExpression()`, and `uriExpression()`. These return endpoint references or expressions for use in AppHost configuration, not a client connection.

## Connection properties

The connection string is `Endpoint=http://{host}:{port}`. A reference also exposes `Host`, `Port`, and `Uri`. See [Chroma connection properties](/integrations/databases/chroma/chroma-connect/#connection-properties) for exact environment variable names and consuming-app examples.

## See also

- [Connect with the Chroma integration](/integrations/databases/chroma/chroma-connect/)
- [Chroma hosting package source](https://github.com/CommunityToolkit/Aspire/tree/main/src/CommunityToolkit.Aspire.Hosting.Chroma)
- [Docker volumes](https://docs.docker.com/engine/storage/volumes/)
