---
title: Set up Azure Table Storage in the AppHost
description: Learn how to use the Aspire Azure Table Storage hosting integration to orchestrate and configure Azure Table Storage in an Aspire solution.
---

{% image "/assets/images/icons/azure-table-icon.png", alt: "Azure Table Storage logo", width: 100, height: 100, class: "float-inline-left icon", zoomable: false %}

This article is the reference for the Aspire Azure Table Storage hosting integration. It enumerates the AppHost APIs — with examples for both `AppHost.cs` and `apphost.mts` — that you use to model Azure Storage accounts and table resources in your [`AppHost`](/get-started/app-host/) project.

If you're new to the Azure Table Storage integration, start with the [Get started with Azure Table Storage integrations](/integrations/cloud/azure/azure-storage-tables/azure-storage-tables-get-started/) guide. For how consuming apps read the connection information this page exposes, see [Connect to Azure Table Storage](../azure-storage-tables-connect/).

## Installation

To start building an Aspire app that uses Azure Table Storage, install the [📦 Aspire.Hosting.Azure.Storage](https://www.nuget.org/packages/Aspire.Hosting.Azure.Storage) NuGet package:

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

## Add Azure Table Storage resource

Once you've installed the hosting integration in your AppHost project, you can add an Azure Storage resource and then add a table resource to it:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const tables = await builder.addAzureStorage("storage")
    .addTables("tables");

await builder.addProject("apiservice", "../ExampleProject/ExampleProject.csproj")
    .withReference(tables)
    .waitFor(tables);

// After adding all resources, run the app...
await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var tables = builder.AddAzureStorage("storage")
    .AddTables("tables");

builder.AddProject<Projects.ExampleProject>("apiservice")
    .WithReference(tables)
    .WaitFor(tables);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

{% steps %}
1. An Azure Storage resource named `storage` is added to the AppHost.

1. A table storage resource named `tables` is added to the storage resource by chaining a call to {% api "Aspire.Hosting.AzureStorageExtensions.AddTables" %}.

1. The table storage resource is referenced from the consuming project with {% api "Aspire.Hosting.ResourceBuilderExtensions.WithReference" %}, which injects connection properties as environment variables.

1. {% api "Aspire.Hosting.ResourceBuilderExtensions.WaitFor" %} ensures the consuming project waits until the table storage resource is ready before starting.
{% endsteps %}

:::caution
When you call {% api "Aspire.Hosting.AzureStorageExtensions.AddAzureStorage" %}, it implicitly calls {% api "Aspire.Hosting.AzureProvisionerExtensions.AddAzureProvisioning" %} — which adds support for generating Azure resources dynamically during app startup. The app must configure the appropriate subscription and location. For more information, see [Local provisioning: Configuration](/integrations/cloud/azure/local-provisioning/#configuration).
:::

:::note
When you reference an Azure Table Storage resource from the AppHost, Aspire injects connection properties into the consuming app. For a complete list of these properties and per-language connection examples, see [Connect to Azure Table Storage](../azure-storage-tables-connect/).
:::

## Run as emulator (Azurite)

For local development, configure the storage resource to use the [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) emulator instead of a real Azure Storage account. Call {% api "Aspire.Hosting.AzureStorageExtensions.RunAsEmulator" %} on the storage resource:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const storage = await builder.addAzureStorage("storage")
    .runAsEmulator();

const tables = await storage.addTables("tables");

await builder.addProject("apiservice", "../ExampleProject/ExampleProject.csproj")
    .withReference(tables)
    .waitFor(tables);

// After adding all resources, run the app...
await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var storage = builder.AddAzureStorage("storage")
    .RunAsEmulator();

var tables = storage.AddTables("tables");

builder.AddProject<Projects.ExampleProject>("apiservice")
    .WithReference(tables)
    .WaitFor(tables);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

When `RunAsEmulator` (or `runAsEmulator`) is called, the Aspire AppHost starts an Azurite container and routes all Azure Storage API calls to it during local development. No Azure subscription or credentials are required.

{% container_images package: "Aspire.Hosting.Azure.Storage" %}

## Configure Azurite container ports

By default, when Aspire configures the Azurite container, it exposes the following endpoints:

| Endpoint | Container port | Host port |
|----------|----------------|-----------|
| `blob`   | 10000          | dynamic   |
| `queue`  | 10001          | dynamic   |
| `table`  | 10002          | dynamic   |

The host port is dynamic by default. When the container starts, the ports are mapped to random ports on the host machine. To fix the endpoint ports, configure them inside the `RunAsEmulator` (or `runAsEmulator`) callback:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const storage = await builder.addAzureStorage("storage")
    .runAsEmulator({
        configureContainer: async (azurite) => {
            await azurite
                .withBlobPort(27000)
                .withQueuePort(27001)
                .withTablePort(27002);
        }
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

The preceding code configures the Azurite container ports as follows:

| Endpoint | Port mapping (`container:host`) |
|---------:|--------------------------------:|
| `blob`   | `10000:27000`                   |
| `queue`  | `10001:27001`                   |
| `table`  | `10002:27002`                   |

## Configure Azurite container with persistent lifetime

To configure the Azurite container with a persistent lifetime so it survives app restarts, call {% api "Aspire.Hosting.ContainerResourceBuilderExtensions.WithLifetime" %} with `ContainerLifetime.Persistent`:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder, ContainerLifetime } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const storage = await builder.addAzureStorage("storage")
    .runAsEmulator({
        configureContainer: async (azurite) => {
            await azurite.withLifetime(ContainerLifetime.Persistent);
        }
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

To persist Azurite data across container restarts with a data volume, call {% api "Aspire.Hosting.AzureStorageExtensions.WithDataVolume" %} on the emulator resource:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const storage = await builder.addAzureStorage("storage")
    .runAsEmulator({
        configureContainer: async (azurite) => {
            await azurite.withDataVolume();
        }
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

The data volume is mounted at the `/data` path in the Azurite container and when a `name` parameter isn't provided, the name is formatted as `.azurite/{resource name}`. For more information on data volumes and details on why they're preferred over [bind mounts](#configure-azurite-container-with-data-bind-mount), see [Docker docs: Volumes](https://docs.docker.com/engine/storage/volumes).

## Configure Azurite container with data bind mount

To add a data bind mount to the Azurite container instead of a named volume, call {% api "Aspire.Hosting.AzureStorageExtensions.WithDataBindMount" %}:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const storage = await builder.addAzureStorage("storage")
    .runAsEmulator({
        configureContainer: async (azurite) => {
            await azurite.withDataBindMount({ path: '../azurite/data' });
        }
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

:::caution
Data [bind mounts](https://docs.docker.com/engine/storage/bind-mounts/) have limited functionality compared to [volumes](https://docs.docker.com/engine/storage/volumes/), which offer better performance, portability, and security, making them more suitable for production environments. However, bind mounts allow direct access and modification of files on the host system, ideal for development and testing where real-time changes are needed.
:::

Data bind mounts rely on the host machine's filesystem to persist Azurite data across container restarts. The bind mount path `../azurite/data` is relative to the AppHost directory. For more information, see [Docker docs: Bind mounts](https://docs.docker.com/engine/storage/bind-mounts).

## Connect to storage resources

When the Aspire AppHost runs, storage resources can be accessed by external tools such as the [Azure Storage Explorer](https://azure.microsoft.com/features/storage-explorer/). If your storage resource is running locally using Azurite, it's automatically discovered by the Azure Storage Explorer.

:::note
The Azure Storage Explorer discovers Azurite storage resources assuming the default ports are used. If you've [configured the Azurite container to use different ports](#configure-azurite-container-ports), you need to configure the Azure Storage Explorer to connect to the correct ports.
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

## Connect to an existing Azure Storage account

If you have an existing Azure Storage account, you can connect to it using the {% api "Aspire.Hosting.ExistingAzureResourceExtensions.AsExisting" %} method instead of provisioning a new one:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const existingStorageName = await builder.addParameter("existingStorageName");
const existingStorageResourceGroup = await builder.addParameter("existingStorageResourceGroup");

const storageAccount = await builder.addAzureStorage("storage")
    .asExisting(existingStorageName, { resourceGroup: existingStorageResourceGroup });

const tables = await storageAccount.addTables("tables");

await builder.addProject("apiservice", "../ExampleProject/ExampleProject.csproj")
    .withReference(tables);

// After adding all resources, run the app...
await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var existingStorageName = builder.AddParameter("existingStorageName");
var existingStorageResourceGroup = builder.AddParameter("existingStorageResourceGroup");

var storageAccount = builder.AddAzureStorage("storage")
    .AsExisting(existingStorageName, existingStorageResourceGroup);

var tables = storageAccount.AddTables("tables");

builder.AddProject<Projects.ExampleProject>("apiservice")
    .WithReference(tables);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

:::important
When you call {% api "Aspire.Hosting.ExistingAzureResourceExtensions.RunAsExisting" %}, {% api "Aspire.Hosting.ExistingAzureResourceExtensions.PublishAsExisting" %}, or `AsExisting` methods to work with resources that are already present in your Azure subscription, you must add certain configuration values to your AppHost to ensure that Aspire can locate them. The necessary configuration values include **SubscriptionId**, **AllowResourceGroupCreation**, **ResourceGroup**, and **Location**. If you don't set them, "Missing configuration" errors appear in the Aspire dashboard. For more information, see [Use existing Azure resources](/integrations/cloud/azure/overview/#use-existing-azure-resources).
:::

## Connection properties

When you reference an Azure Table Storage resource using `WithReference` (or `withReference`), Aspire injects the following connection properties into the consuming app:

| Property Name      | Environment variable       | Description |
|--------------------|----------------------------|-------------|
| `ConnectionString` | `{RESOURCE}_CONNECTIONSTRING` | The full Azure Storage connection string. Available in emulator mode and when configured for key-based access. |
| `TableEndpoint`    | `{RESOURCE}_TABLEENDPOINT`    | The URI of the Table Storage service endpoint, with the format `https://{accountname}.table.core.windows.net/`. Available when using Azure Managed Identity or token-based access. |

For example, for a resource named `tables`, the environment variables are `TABLES_CONNECTIONSTRING` and `TABLES_TABLEENDPOINT`.

{% learnmore %}
For per-language connection examples and client library setup, see [Connect to Azure Table Storage](../azure-storage-tables-connect/).
{% endlearnmore %}
