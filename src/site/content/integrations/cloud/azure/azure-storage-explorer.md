---
title: Azure Storage Explorer integration
description: Add a browser-based Azure Storage Explorer container to official Aspire Azure Storage resources with the Aspire Community Toolkit extensions.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

{% image "/assets/images/icons/azure-storagecontainer-icon.png", alt: "Azure Storage logo", width: 100, height: 100, fit: "contain", class: "float-inline-left icon", zoomable: false %}

The [Aspire Community Toolkit](https://github.com/CommunityToolkit/Aspire) Azure extensions add a browser-based storage explorer to the official Aspire Azure Storage hosting integration. Attach an explorer container to a blob, queue, or table service resource to inspect its data during development.

The add-on uses [sebagomez/azurestorageexplorer](https://github.com/sebagomez/azurestorageexplorer), a containerized web application. Aspire supplies the attached service's connection string and configures emulator mode when the parent storage account runs as Azurite.

:::note
This integration runs the community web application, not the [Microsoft Azure
Storage Explorer desktop
application](https://azure.microsoft.com/products/storage/storage-explorer/).
No desktop installation is required.
:::

## Prerequisites

- Set up an [Aspire AppHost](/get-started/app-host/) and the [container runtime prerequisites](/get-started/prerequisites/).
- Use the official Azure Storage hosting integration to define the storage account and service resources. For an introduction, see [Get started with Azure Blob Storage integrations](/integrations/cloud/azure/azure-storage-blobs/azure-storage-blobs-get-started/).
- For the local examples below, run the storage account as an Azurite emulator. If the account uses Azure instead, follow the official hosting integration's [local provisioning configuration](/integrations/cloud/azure/local-provisioning/#configuration).

## Installation

Install the official base package, [📦 Aspire.Hosting.Azure.Storage](https://nuget.org/packages/Aspire.Hosting.Azure.Storage), in the AppHost:

{% install_package "Aspire.Hosting.Azure.Storage", short_name: "azure-storage" %}

Then install the add-on, [📦 CommunityToolkit.Aspire.Hosting.Azure.Extensions](https://nuget.org/packages/CommunityToolkit.Aspire.Hosting.Azure.Extensions):

{% install_package "CommunityToolkit.Aspire.Hosting.Azure.Extensions", short_name: "CommunityToolkit.Aspire.Hosting.Azure.Extensions" %}

The Toolkit package exports TypeScript AppHost bindings for the storage decorators and explorer host-port configuration. After adding the package to a TypeScript AppHost, use the generated `./.aspire/modules/aspire.mjs` module.

## Attach an explorer to Azure Storage

Add an official storage account resource, run it as an emulator, and attach an explorer to each service that needs a browser UI:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const storage = await builder.addAzureStorage('storage').runAsEmulator({
  configureContainer: async (azurite) => {
    await azurite
      .withArgs(['--disableProductStyleUrl'])
      .withBlobPort(27000)
      .withQueuePort(27001)
      .withTablePort(27002);
  },
});

const blobs = await storage.addBlobs('blobs').withAzureStorageExplorer();
const queues = await storage.addQueues('queues').withAzureStorageExplorer();
const tables = await storage.addTables('tables').withAzureStorageExplorer();

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
using Aspire.Hosting;

var builder = DistributedApplication.CreateBuilder(args);

var storage = builder.AddAzureStorage("storage")
    .RunAsEmulator(azurite =>
    {
        azurite
            .WithArgs("--disableProductStyleUrl")
            .WithBlobPort(27000)
            .WithQueuePort(27001)
            .WithTablePort(27002);
    });

var blobs = storage.AddBlobs("blobs").WithAzureStorageExplorer();
var queues = storage.AddQueues("queues").WithAzureStorageExplorer();
var tables = storage.AddTables("tables").WithAzureStorageExplorer();

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

This creates `blobs-explorer`, `queues-explorer`, and `tables-explorer` as child resources of their respective storage services. Each call creates its own container. Attach only the explorers that you need.

The `--disableProductStyleUrl` argument follows the Toolkit's TypeScript example. It makes Azurite use path-style account addressing when the connection uses a container-network hostname. The fixed ports in the example belong to Azurite, not the explorer web UI.

Run the AppHost and open the explorer's `http` endpoint from the Aspire dashboard. By default, Aspire assigns the explorer a random host port and forwards requests to container port `8080`.

:::tip
The decorator returns the original storage service builder. Continue to
reference `blobs`, `queues`, or `tables` from consuming applications with
`WithReference` or `withReference`. The explorer is a development UI and does
not replace the service resource or its client integration.
:::

## Configure the explorer container

Use the optional `configureContainer` callback to configure the explorer itself. Set a predictable UI port with `WithHostPort` or `withHostPort`, and use standard container APIs such as `WithImageTag` or `withImageTag` inside the callback:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const storage = await builder.addAzureStorage('storage').runAsEmulator({
  configureContainer: async (azurite) => {
    await azurite.withArgs(['--disableProductStyleUrl']);
  },
});

const blobs = await storage.addBlobs('blobs').withAzureStorageExplorer({
  configureContainer: async (explorer) => {
    await explorer.withHostPort(8068).withImageTag('4.0.0');
  },
  name: 'storage-browser',
});

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
using Aspire.Hosting;

var builder = DistributedApplication.CreateBuilder(args);

var storage = builder.AddAzureStorage("storage")
    .RunAsEmulator(azurite =>
    {
        azurite.WithArgs("--disableProductStyleUrl");
    });

var blobs = storage.AddBlobs("blobs")
    .WithAzureStorageExplorer(
        configureContainer: explorer =>
        {
            explorer
                .WithHostPort(8068)
                .WithImageTag("4.0.0");
        },
        name: "storage-browser");

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

This example names the explorer `storage-browser`, exposes its HTTP endpoint on host port `8068`, and explicitly selects the default image tag. Choose an available host port. To restore random allocation, pass `null` to the host-port method.

The default image is `docker.io/sebagomez/azurestorageexplorer:4.0.0`. To select another published tag, change the tag inside the callback. Configure the explorer inside that callback because the value returned by the decorator is the storage service builder.

### Exported AppHost APIs

The package adds the following public extension methods:

| C# API                                                           | TypeScript API                                           | Target and behavior                                                                                                                                                                                   |
| ---------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WithAzureStorageExplorer(configureContainer: null, name: null)` | `withAzureStorageExplorer({ configureContainer, name })` | Available on `AzureBlobStorageResource`, `AzureQueueStorageResource`, and `AzureTableStorageResource` builders. Adds an explorer and returns the original service builder. Both options are optional. |
| `WithHostPort(port)`                                             | `withHostPort(port)`                                     | Available on the explorer builder passed to the callback. Sets its `http` endpoint's host port. Accepts `null` for random allocation.                                                                 |

The decorator options are:

- `configureContainer`: A callback receiving the `AzureStorageExplorerResource` builder. Use an asynchronous callback in TypeScript.
- `name`: An optional AppHost resource name for the explorer. The default is the attached service's name followed by `-explorer`. Give each explorer a unique name.

The exported `AzureStorageExplorerResource` derives from `ContainerResource` and exposes endpoint references:

| C# property       | TypeScript accessor | Value                                           |
| ----------------- | ------------------- | ----------------------------------------------- |
| `PrimaryEndpoint` | `primaryEndpoint()` | The explorer's `http` endpoint reference.       |
| `Host`            | `host()`            | An expression referencing that endpoint's host. |
| `Port`            | `port()`            | An expression referencing that endpoint's port. |

These references describe the explorer UI, not the Azure Storage service endpoints. There is no public `AddAzureStorageExplorer` AppHost method in this package. Attach the UI through a service decorator.

## Connection wiring and startup behavior

The decorator wires the container to its attached service automatically:

- Sets `AZURE_STORAGE_CONNECTIONSTRING` to a required connection-string reference to that service. A blob explorer receives the blob service's connection string, rather than a separately constructed account-wide string.
- Adds a wait dependency on the attached service.
- Sets `AZURITE=true` when the parent storage account is configured as an emulator.
- Adds a parent relationship to the attached service for the application model.

Do not hard-code storage credentials or emulator addresses into the explorer configuration. The connection-string reference resolves the service's connection information for the container.

The add-on registers no explorer-specific health check or HTTP probe. The upstream C# integration test waits for the explorer resource to become healthy, then verifies that an HTTP request to `/` returns `200 OK`. That test does not establish a separate health check for storage access.

:::note
The explorer container is excluded from the publish manifest with
`ExcludeFromManifest`. Use it as a local development tool. Configure storage
deployment through the official Azure Storage hosting integration.
:::

## See also

- [Azure Blob Storage hosting integration](/integrations/cloud/azure/azure-storage-blobs/azure-storage-blobs-host/)
- [Azure Queue Storage hosting integration](/integrations/cloud/azure/azure-storage-queues/azure-storage-queues-host/)
- [Azure Table Storage hosting integration](/integrations/cloud/azure/azure-storage-tables/azure-storage-tables-host/)
- [Connect to Azure Blob Storage](/integrations/cloud/azure/azure-storage-blobs/azure-storage-blobs-connect/)
- [Azure Storage Explorer web application](https://github.com/sebagomez/azurestorageexplorer)
- [Toolkit Azure extensions README and source](https://github.com/CommunityToolkit/Aspire/tree/main/src/CommunityToolkit.Aspire.Hosting.Azure.Extensions)
- [Toolkit Azure extensions tests](https://github.com/CommunityToolkit/Aspire/tree/main/tests/CommunityToolkit.Aspire.Hosting.Azure.Extensions.Tests)
