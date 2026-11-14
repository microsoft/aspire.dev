---
title: Set up Azure Queue Storage in the AppHost
description: Learn how to use the Aspire Azure Queue Storage Hosting integration to orchestrate and configure an Azure Queue Storage resource in an Aspire solution.
---

{% image "/assets/images/icons/azure-storagequeue-icon.png", alt: "Azure Queue Storage logo", width: 100, height: 100, class: "float-inline-left icon", zoomable: false %}

This article is the reference for the Aspire Azure Queue Storage Hosting integration. It enumerates the AppHost APIs — with examples for both `AppHost.cs` and `apphost.mts` — that you use to model an Azure Storage account and its queue resources in your [`AppHost`](/get-started/app-host/) project.

If you're new to the Azure Queue Storage integration, start with the [Get started with Azure Queue Storage integrations](/integrations/cloud/azure/azure-storage-queues/azure-storage-queues-get-started/) guide. For how consuming apps read the connection information this page exposes, see [Connect to Azure Queue Storage](../azure-storage-queues-connect/).

## Installation

To start building an Aspire app that uses Azure Queue Storage, install the [📦 Aspire.Hosting.Azure.Storage](https://www.nuget.org/packages/Aspire.Hosting.Azure.Storage) NuGet package:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```bash title="Terminal"
aspire add azure-storage
```

{% learnmore %}
Learn more about [`aspire add`](/reference/cli/commands/aspire-add/) in the command reference.
{% endlearnmore %}

This updates your `aspire.config.json` with the Azure Storage hosting integration package:

```json title="aspire.config.json" ins={3}
{
  "packages": {
    "Aspire.Hosting.Azure.Storage": "%ASPIRE_VERSION%"
  }
}
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```bash title="Terminal"
aspire add azure-storage
```

{% learnmore %}
Learn more about [`aspire add`](/reference/cli/commands/aspire-add/) in the command reference.
{% endlearnmore %}

Or, choose a manual installation approach:

```csharp title="AppHost.cs"
#:package Aspire.Hosting.Azure.Storage@*
```

```xml title="AppHost.csproj"
<PackageReference Include="Aspire.Hosting.Azure.Storage" Version="*" />
```
{% endtab %}
{% endtabs %}

## Add Azure Queue Storage resource

Once you've installed the hosting integration in your AppHost project, you can add an Azure Storage resource and attach a queue resource to it:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const queues = await builder.addAzureStorage("storage")
    .addQueues("queues");

await builder.addNodeApp("apiservice", "./api", "index.js")
    .withReference(queues)
    .waitFor(queues);

// After adding all resources, run the app...
await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var queues = builder.AddAzureStorage("storage")
    .AddQueues("queues");

builder.AddProject<Projects.ExampleProject>("apiservice")
    .WithReference(queues)
    .WaitFor(queues);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The preceding code adds an Azure Storage resource named `storage`, attaches a queue storage resource named `queues` to it, and passes the queue's connection information to the consuming project.

:::caution
When you call {% api "Aspire.Hosting.AzureStorageExtensions.AddAzureStorage" %}, it implicitly calls {% api "Aspire.Hosting.AzureProvisionerExtensions.AddAzureProvisioning" %}—which adds support for generating Azure resources dynamically during app startup. The app must configure the appropriate subscription and location. For more information, see [Local provisioning: Configuration](/integrations/cloud/azure/local-provisioning/#configuration).
:::

:::note
When you reference the queue resource from the AppHost, Aspire makes several connection properties available to the consuming project, such as the service URI and connection string. For a complete list of these properties and per-language connection examples, see [Connect to Azure Queue Storage](../azure-storage-queues-connect/).
:::

## Run as Azurite emulator

For local development, Aspire can run the [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) emulator in a container to avoid requiring an Azure subscription. Call {% api "Aspire.Hosting.AzureStorageExtensions.RunAsEmulator" %} on the storage resource:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const storage = await builder.addAzureStorage("storage")
    .runAsEmulator();
const queues = await storage.addQueues("queues");

await builder.addNodeApp("apiservice", "./api", "index.js")
    .withReference(queues)
    .waitFor(queues);

// After adding all resources, run the app...
await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var queues = builder.AddAzureStorage("storage")
    .RunAsEmulator()
    .AddQueues("queues");

builder.AddProject<Projects.ExampleProject>("apiservice")
    .WithReference(queues)
    .WaitFor(queues);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

When running as an emulator, Aspire pulls the `mcr.microsoft.com/azure-storage/azurite` container image and starts a local Azurite instance.

{% container_images package: "Aspire.Hosting.Azure.Storage" %}

## Configure Azurite container ports

By default, the Azurite container exposes the following endpoints:

| Endpoint | Container port | Host port |
|----------|----------------|-----------|
| `blob`   | 10000          | dynamic   |
| `queue`  | 10001          | dynamic   |
| `table`  | 10002          | dynamic   |

The host port is dynamic by default. To fix the ports, pass a configuration callback to `RunAsEmulator` (C#) or `runAsEmulator` (TypeScript):

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const storage = await builder.addAzureStorage("storage")
    .runAsEmulator({
        configureContainer: async (azurite) => {
            await azurite.withBlobPort(27000);
            await azurite.withQueuePort(27001);
            await azurite.withTablePort(27002);
        },
    });

// After adding all resources, run the app...
await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var storage = builder.AddAzureStorage("storage")
    .RunAsEmulator(azurite =>
    {
        azurite.WithBlobPort(27000)
               .WithQueuePort(27001)
               .WithTablePort(27002);
    });

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The resulting port mappings (`container:host`) are:

| Endpoint | Port mapping |
|----------|--------------|
| `blob`   | `10000:27000` |
| `queue`  | `10001:27001` |
| `table`  | `10002:27002` |

## Configure Azurite container with persistent lifetime

To keep the Azurite container alive across AppHost restarts, call {% api "Aspire.Hosting.ContainerResourceBuilderExtensions.WithLifetime" %} with `ContainerLifetime.Persistent`:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder, ContainerLifetime } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const storage = await builder.addAzureStorage("storage")
    .runAsEmulator({
        configureContainer: async (azurite) => {
            await azurite.withLifetime(ContainerLifetime.Persistent);
        },
    });

// After adding all resources, run the app...
await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var storage = builder.AddAzureStorage("storage")
    .RunAsEmulator(azurite =>
    {
        azurite.WithLifetime(ContainerLifetime.Persistent);
    });

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

## Configure Azurite container with data volume

To persist Azurite data outside the container lifecycle, add a data volume:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const storage = await builder.addAzureStorage("storage")
    .runAsEmulator({
        configureContainer: async (azurite) => {
            await azurite.withDataVolume();
        },
    });

// After adding all resources, run the app...
await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var storage = builder.AddAzureStorage("storage")
    .RunAsEmulator(azurite =>
    {
        azurite.WithDataVolume();
    });

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The data volume is mounted at the `/data` path in the Azurite container. When a `name` parameter isn't provided, the name is formatted as `.azurite/{resource name}`. For more information on data volumes and details on why they're preferred over [bind mounts](#configure-azurite-container-with-data-bind-mount), see [Docker docs: Volumes](https://docs.docker.com/engine/storage/volumes).

## Configure Azurite container with data bind mount

To use a bind mount instead of a volume, call {% api "Aspire.Hosting.AzureStorageExtensions.WithDataBindMount" %}:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const storage = await builder.addAzureStorage("storage")
    .runAsEmulator({
        configureContainer: async (azurite) => {
            await azurite.withDataBindMount({ path: "../azurite/data" });
        },
    });

// After adding all resources, run the app...
await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var storage = builder.AddAzureStorage("storage")
    .RunAsEmulator(azurite =>
    {
        azurite.WithDataBindMount("../azurite/data");
    });

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

:::note
Data [bind mounts](https://docs.docker.com/engine/storage/bind-mounts/) have limited functionality compared to [volumes](https://docs.docker.com/engine/storage/volumes/), which offer better performance, portability, and security, making them more suitable for production environments. However, bind mounts allow direct access and modification of files on the host system, ideal for development and testing where real-time changes are needed.
:::

Data bind mounts rely on the host machine's filesystem to persist Azurite data across container restarts. The data bind mount is mounted at the `../azurite/data` path on the host machine relative to the AppHost directory. For more information on data bind mounts, see [Docker docs: Bind mounts](https://docs.docker.com/engine/storage/bind-mounts).

## Connect to an existing Azure Storage account

You might have an existing Azure Storage account that you want to connect to. Call {% api "Aspire.Hosting.ExistingAzureResourceExtensions.AsExisting" %} to annotate the resource as already provisioned:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const existingStorageName = await builder.addParameter("existingStorageName");

const queues = await builder.addAzureStorage("storage")
    .asExisting(existingStorageName)
    .addQueues("queues");

await builder.addNodeApp("apiservice", "./api", "index.js")
    .withReference(queues);

// After adding all resources, run the app...
await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var existingStorageName = builder.AddParameter("existingStorageName");
var existingStorageResourceGroup = builder.AddParameter("existingStorageResourceGroup");

var queues = builder.AddAzureStorage("storage")
    .AsExisting(existingStorageName, existingStorageResourceGroup)
    .AddQueues("queues");

builder.AddProject<Projects.ExampleProject>("apiservice")
    .WithReference(queues);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

:::caution
When you call {% api "Aspire.Hosting.ExistingAzureResourceExtensions.RunAsExisting" %}, {% api "Aspire.Hosting.ExistingAzureResourceExtensions.PublishAsExisting" %}, or `AsExisting` to work with resources that are already present in your Azure subscription, you must add certain configuration values to your AppHost so that Aspire can locate them. The necessary configuration values include **SubscriptionId**, **AllowResourceGroupCreation**, **ResourceGroup**, and **Location**. If you don't set them, "Missing configuration" errors appear in the Aspire dashboard. For more information about how to set them, see [Use existing Azure resources](/integrations/cloud/azure/overview/#use-existing-azure-resources).
:::

## Connect to storage resources from Azure Storage Explorer

When the Aspire AppHost runs, the storage resources can be accessed by external tools such as the [Azure Storage Explorer](https://azure.microsoft.com/features/storage-explorer/). If your storage resource is running locally using Azurite, it will automatically be picked up by the Azure Storage Explorer.

:::note
The Azure Storage Explorer discovers Azurite storage resources assuming the default ports are used. If you've [configured the Azurite container to use different ports](#configure-azurite-container-ports), you'll need to configure the Azure Storage Explorer to connect to the correct ports.
:::

To connect to the storage resource from Azure Storage Explorer, follow these steps:

{% steps %}
1. Run the Aspire AppHost.
1. Open the Azure Storage Explorer.
1. View the **Explorer** pane.
1. Select the **Refresh all** link to refresh the list of storage accounts.
1. Expand the **Emulator & Attached** node.
1. Expand the **Storage Accounts** node.
1. You should see a storage account with your resource's name as a prefix:

    {% image "/assets/images/integrations/cloud/azure/storage/azure-storage-explorer.png", alt: "Azure Storage Explorer: Azurite storage resource discovered." %}
{% endsteps %}

For more information on using the Azure Storage Explorer, see [Get started with Storage Explorer](https://learn.microsoft.com/azure/storage/storage-explorer/vs-azure-tools-storage-manage-with-storage-explorer).

## Connection properties

For the full reference of Azure Queue Storage connection properties — and how consuming apps in C#, TypeScript, Python, and Go read them — see [Connect to Azure Queue Storage](../azure-storage-queues-connect/).

## Hosting integration health checks

The Azure Queue Storage hosting integration automatically adds a health check for the queue resource. The health check verifies that the queue service is running and that a connection can be established to it.
