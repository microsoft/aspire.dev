---
title: SeaweedFS integration in the AppHost
description: Enable SeaweedFS Master, Filer, or S3 APIs and configure credentials, endpoints, persistence, and cluster readiness.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

The SeaweedFS hosting package runs the SeaweedFS container and exposes its APIs when enabled. For an overview, see [Get started with the SeaweedFS integration](/integrations/databases/seaweedfs/seaweedfs-get-started/).

## Installation

Install the package in the AppHost:

{% install_package "CommunityToolkit.Aspire.Hosting.SeaweedFS", short_name: "seaweedfs" %}

## Add a SeaweedFS resource

`AddSeaweedFS` starts the Master and Volume APIs. Call `WithFiler` to enable the native Filer API. Call `WithS3` to enable the S3 gateway; this also enables Filer because the gateway depends on it.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts" twoslash
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const seaweedfs = await builder.addSeaweedFS('seaweedfs');
await seaweedfs.withS3();

const api = await builder.addProject('api', '../Api/Api.csproj');
await api.withReference(seaweedfs);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var seaweedfs = builder.AddSeaweedFS("seaweedfs")
    .WithS3();

builder.AddProject<Projects.Api>("api")
    .WithReference(seaweedfs);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The resource starts with Master port `9333` and Volume port `8080`. `WithFiler` adds Filer port `8888`; `WithS3` adds S3 port `8333`. Aspire assigns host ports automatically unless a method receives a fixed port.

## Select APIs and host ports

Use the native Filer endpoint without starting S3. The example also sets a host port for the Master API and Filer API:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts" twoslash
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const seaweedfs = await builder.addSeaweedFS('seaweedfs');
await seaweedfs.withFiler(8888);
await seaweedfs.withHostPort(9333);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var seaweedfs = builder.AddSeaweedFS("seaweedfs")
    .WithFiler(filerPort: 8888)
    .WithHostPort(9333);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

`WithHostPort` sets the host port for the Master API. The optional port parameters on `WithFiler` and `WithS3` set the host ports for those endpoints.

## Configure S3 credentials

`AddSeaweedFS` creates an `admin` access-key parameter and a generated secret-key parameter. Provide your own parameters when the S3 identity should use other credentials:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts" twoslash
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const accessKey = await builder.addParameter('seaweedfs-access-key', {
  secret: true,
});
const secretKey = await builder.addParameter('seaweedfs-secret-key', {
  secret: true,
});
const seaweedfs = await builder.addSeaweedFS('seaweedfs');
await seaweedfs.withAccessKey(accessKey);
await seaweedfs.withSecretKey(secretKey);
await seaweedfs.withS3();

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var accessKey = builder.AddParameter("seaweedfs-access-key", secret: true);
var secretKey = builder.AddParameter("seaweedfs-secret-key", secret: true);

var seaweedfs = builder.AddSeaweedFS("seaweedfs")
    .WithAccessKey(accessKey)
    .WithSecretKey(secretKey)
    .WithS3();

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The integration writes the selected credentials into the S3 identity configuration it generates for the container. Store secrets in a secret provider rather than source control.

## Persist SeaweedFS data

Use `WithDataVolume` to persist `/data` outside the container lifecycle. Aspire generates a volume name unless you provide one:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts" twoslash
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const seaweedfs = await builder.addSeaweedFS('seaweedfs');
await seaweedfs.withS3();
await seaweedfs.withDataVolume('seaweedfs-data');

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var seaweedfs = builder.AddSeaweedFS("seaweedfs")
    .WithS3()
    .WithDataVolume("seaweedfs-data");

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

Use `WithDataBindMount` to access a specific host directory directly:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts" twoslash
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const seaweedfs = await builder.addSeaweedFS('seaweedfs');
await seaweedfs.withFiler();
await seaweedfs.withDataBindMount('./data/seaweedfs');

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var seaweedfs = builder.AddSeaweedFS("seaweedfs")
    .WithFiler()
    .WithDataBindMount("./data/seaweedfs");

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

Named volumes persist data without depending on a host path. Bind mounts are useful during development when you need to inspect or edit host files directly.

## Use a custom S3 configuration file

Call `WithS3ConfigFile` after enabling S3 to mount a custom configuration file read-only at `/etc/seaweedfs/s3-custom.json`. The method throws if `WithS3` has not been called:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts" twoslash
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const seaweedfs = await builder.addSeaweedFS('seaweedfs');
await seaweedfs.withS3();
await seaweedfs.withS3ConfigFile('./seaweedfs/s3.json');

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var seaweedfs = builder.AddSeaweedFS("seaweedfs")
    .WithS3()
    .WithS3ConfigFile("./seaweedfs/s3.json");

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The custom file replaces the generated S3 identity configuration. Define the desired identities and credentials in that file. The AppHost still exposes its credential parameters in the connection string; set `WithAccessKey` and `WithSecretKey` to credentials matching an identity in the file.

:::note
The file is mounted read-only. When you use it, manage the S3 identities in
that file instead of expecting the integration to generate them.
:::

## Hosting integration health checks

The integration adds a SeaweedFS health check that queries the Master API at `/dir/status` with `Accept: application/json`. It requires a successful response containing a non-zero `Topology.Max` value, which indicates that the Volume Server has registered storage capacity. A running Master alone is not considered ready. This probe does not separately check the S3 or Filer APIs.

## Connection properties

With both S3 and Filer enabled, referencing the resource creates a connection string with this shape:

```text
Endpoint=http://{s3-host}:{s3-port};AccessKey={key};SecretKey={secret};FilerEndpoint=http://{filer-host}:{filer-port}
```

`Endpoint` points to the S3 API when enabled, or the Master API otherwise. The connection properties include `Host`, `Port`, and `MasterUrl`; `S3Url`, `AccessKey`, and `SecretKey` are available when S3 is enabled; `FilerUrl` is available when Filer is enabled. See [Connect to SeaweedFS](/integrations/databases/seaweedfs/seaweedfs-connect/) for client configuration.

## Exported AppHost API

- `AddSeaweedFS(name)` creates the base Master and Volume resource.
- `WithS3(s3Port)` enables the S3 gateway and implicitly enables Filer.
- `WithFiler(filerPort)` enables the native Filer API.
- `WithHostPort(port)` selects the Master API host port.
- `WithAccessKey(parameter)` and `WithSecretKey(parameter)` select custom S3 credential parameters.
- `WithS3ConfigFile(configFilePath)` mounts a custom S3 configuration file. Call it after enabling S3.
- `WithDataBindMount(source, isReadOnly)` mounts a host directory at `/data`.
- `WithDataVolume(name, isReadOnly)` mounts a named volume at `/data`.

All listed APIs are exported to TypeScript AppHosts with their corresponding camel-case names.

## See also

- [Get started with the SeaweedFS integration](/integrations/databases/seaweedfs/seaweedfs-get-started/)
- [Connect to SeaweedFS](/integrations/databases/seaweedfs/seaweedfs-connect/)
- [📦 CommunityToolkit.Aspire.Hosting.SeaweedFS](https://www.nuget.org/packages/CommunityToolkit.Aspire.Hosting.SeaweedFS)
