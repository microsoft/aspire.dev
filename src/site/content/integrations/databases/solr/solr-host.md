---
title: Solr hosting integration
description: Configure Apache Solr in the Aspire AppHost with a search core, custom configsets, persistent data mounts, and core ping health checks.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

The Solr hosting integration adds a `SolrResource` representing a container and its selected core. See [Get started with the Solr integration](/integrations/databases/solr/solr-get-started/) for the architecture and [Connect with the Solr integration](/integrations/databases/solr/solr-connect/) for consuming-app examples.

## Installation

Install [📦 CommunityToolkit.Aspire.Hosting.Solr](https://nuget.org/packages/CommunityToolkit.Aspire.Hosting.Solr) in the AppHost:

{% install_package "CommunityToolkit.Aspire.Hosting.Solr" %}

The package has stable releases. Use version `13.6.1` when you need to pin it.

For a TypeScript AppHost, add the package to the configuration to generate its bindings:

```json title="aspire.config.json"
{
  "packages": {
    "CommunityToolkit.Aspire.Hosting.Solr": "13.6.1"
  }
}
```

## Add Solr resource

Add a resource named `solr` with a core named `documents`. Reference it from an ASP.NET Core project named `Api`. Add a project reference in the C# AppHost to generate `Projects.Api`.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();
const solr = await builder.addSolr('solr', { coreName: 'documents' });
const api = await builder.addProject('api', '../Api/Api.csproj');
await api.withReference(solr);
await api.waitFor(solr);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var solr = builder.AddSolr("solr", coreName: "documents");
builder.AddProject<Projects.Api>("api")
    .WithReference(solr)
    .WaitFor(solr);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The default image is `docker.io/library/solr:10.0.0`. The `http` endpoint targets container port `8983`; the host port is dynamically allocated. The default core name is `solr`, independent of the resource name.

Without a custom configset, the container runs `solr-precreate {coreName}`. The connection string includes the selected core's path.

## Configure a fixed port and data volume

Use a named volume to retain indexes and configuration outside the container lifecycle. Optionally specify a host port for local tools:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();
const solr = await builder.addSolr('solr', {
  port: 8983,
  coreName: 'documents',
});
await solr.withDataVolume({ name: 'solr-data' });

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

builder.AddSolr("solr", port: 8983, coreName: "documents")
    .WithDataVolume("solr-data");

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The volume mounts at `/var/solr`. Omitting `name` generates a volume name based on the application and resource names. The optional `isReadOnly` argument defaults to `false`.

### Use a data bind mount

Prepare a host directory writable by the Solr container process, which uses UID `8983`. Prefer setting directory ownership or granting appropriate access over making the directory world-writable.

The following examples assume that `solr-data` already exists beside the AppHost and has suitable permissions:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { fileURLToPath } from 'node:url';
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();
const dataDirectory = fileURLToPath(new URL('./solr-data/', import.meta.url));
const solr = await builder.addSolr('solr', { coreName: 'documents' });
await solr.withDataBindMount(dataDirectory);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);
var dataDirectory = Path.Combine(builder.AppHostDirectory, "solr-data");

builder.AddSolr("solr", coreName: "documents")
    .WithDataBindMount(dataDirectory);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The bind mount targets `/var/solr` and also accepts `isReadOnly`, defaulting to `false`. Do not mount both a data volume and a bind mount at that target.

:::caution
Solr normally needs write access to `/var/solr` for core creation and index
updates. A read-only mount does not configure a read-only search service and
can prevent startup.
:::

## Use a custom configset

Prepare a valid configset directory, including its `conf` directory, at `configsets/documents` beside the AppHost. Add it to the resource:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { fileURLToPath } from 'node:url';
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();
const configSetPath = fileURLToPath(
  new URL('./configsets/documents/', import.meta.url)
);
const solr = await builder.addSolr('solr', { coreName: 'documents' });
await solr.withConfigset('documents-config', configSetPath);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);
var configSetPath = Path.Combine(
    builder.AppHostDirectory, "configsets", "documents");

builder.AddSolr("solr", coreName: "documents")
    .WithConfigset("documents-config", configSetPath);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

Required arguments:

- `configSetName`: The name inside `/opt/solr/server/solr/configsets`.
- `configSetPath`: The host path of the configset directory. Use an absolute path to avoid working-directory ambiguity.

The helper adds a `SolrConfigSetAnnotation` and a bind mount at `/opt/solr/server/solr/configsets/{configSetName}`. Startup uses `solr-create -c {coreName} -d {configSetName}` instead of `solr-precreate`. If multiple configset annotations are added, startup selects the last one.

## Hosting integration health checks

The integration registers `{resourceName}_check`. It requests `/solr/{coreName}/admin/ping` and expects HTTP `200`. The check verifies that the selected core responds to ping. Configure its ping handler when supplying a custom configset.

Use `WaitFor` on dependent apps to wait for this health check during local orchestration. A resource reference alone does not delay app startup.

## AppHost API surface

| C# API                                            | TypeScript API                                | Behavior                                                                                          |
| ------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `AddSolr(name, port = null, coreName = null)`     | `addSolr(name, { port, coreName })`           | Add a container. `name` is required; host port is allocated and core name is `solr` when omitted. |
| `WithConfigset(configSetName, configSetPath)`     | `withConfigset(configSetName, configSetPath)` | Mount the required configset directory and select it for core creation.                           |
| `WithDataVolume(name = null, isReadOnly = false)` | `withDataVolume({ name, isReadOnly })`        | Mount a named volume at `/var/solr`.                                                              |
| `WithDataBindMount(source, isReadOnly = false)`   | `withDataBindMount(source, { isReadOnly })`   | Mount the required host data directory at `/var/solr`.                                            |

`SolrResource` exposes `PrimaryEndpoint`, `Host`, `Port`, `CoreName`, `ConnectionStringExpression`, and `UriExpression`. TypeScript exposes endpoint and expression getters as `primaryEndpoint()`, `host()`, `port()`, `connectionStringExpression()`, and `uriExpression()`. The exported mutable core property uses `coreName.get()` and `coreName.set(value)`.

Set the core name when adding the resource rather than mutating the property afterward. Startup arguments and the health-check path capture the original name, while the connection expression reads `CoreName`.

## Connection properties

The connection string and `Uri` property are `http://{host}:{port}/solr/{coreName}`. A reference also supplies `Host`, `Port`, and `CoreName`. See [Solr connection properties](/integrations/databases/solr/solr-connect/#connection-properties) for exact variable names.

## See also

- [Connect with the Solr integration](/integrations/databases/solr/solr-connect/)
- [Solr configsets](https://solr.apache.org/guide/solr/latest/configuration-guide/config-sets.html)
- [Solr hosting source](https://github.com/CommunityToolkit/Aspire/tree/main/src/CommunityToolkit.Aspire.Hosting.Solr)
