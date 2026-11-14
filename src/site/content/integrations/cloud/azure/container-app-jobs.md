---
title: Azure Container App Jobs
description: Learn how to use the Aspire Azure Container App Jobs hosting integration to deploy worker services as scheduled and event-driven jobs in Azure Container Apps.
---

{% image "/assets/images/icons/azure-container-apps-environments.svg", alt: "Azure Container Apps logo", height: 80, width: 80, class: "float-inline-left icon", zoomable: false %}

[Azure Container Apps jobs](https://learn.microsoft.com/azure/container-apps/jobs) let you run containerized tasks that execute for a finite duration and exit. Unlike continuously-running Container Apps, jobs are purpose-built for batch processing, scheduled tasks, and event-driven workloads. The Aspire Azure Container App Jobs hosting integration exposes {% api "Aspire.Hosting.ContainerAppExtensions.PublishAsAzureContainerAppJob" %} and {% api "Aspire.Hosting.ContainerAppExtensions.PublishAsScheduledAzureContainerAppJob" %} extension methods so you can declare any `ProjectResource`, `ContainerResource`, or `ExecutableResource` as an Azure Container App Job directly from your [`AppHost`](/get-started/app-host/).

## Supported resource types

The following resource types can be published as Azure Container App Jobs:

| Resource type | Description |
|---|---|
| `ProjectResource` | A .NET project added via {% api "Aspire.Hosting.ProjectResourceBuilderExtensions.AddProject" %}. |
| `ContainerResource` | A container image added via {% api "Aspire.Hosting.ContainerResourceBuilderExtensions.AddContainer" %}. |
| `ExecutableResource` | An executable process added via {% api "Aspire.Hosting.ExecutableResourceBuilderExtensions.AddExecutable" %}. |

## Publish a project as a Container App Job

Use `PublishAsAzureContainerAppJob` to deploy a project, container, or executable as an Azure Container App Job. Use `PublishAsScheduledAzureContainerAppJob` as a convenience wrapper that sets the cron schedule in one call.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const dataProcessor = await builder.addProject("data-processor", "../DataProcessor/DataProcessor.csproj");
await dataProcessor.publishAsScheduledAzureContainerAppJob("0 0 * * *"); // Every day at midnight
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

builder.AddProject<Projects.DataProcessor>("data-processor")
    .PublishAsScheduledAzureContainerAppJob("0 0 * * *"); // Every day at midnight
```
{% endtab %}
{% endtabs %}

## Job trigger types

Azure Container App Jobs support three trigger types: **manual**, **schedule**, and **event**.

### Manual trigger

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
:::note
The Azure Container App Jobs API is not yet available in the TypeScript AppHost.
:::
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

builder.AddProject<Projects.ManualTask>("manual-task")
    .PublishAsAzureContainerAppJob((_, job) =>
    {
        job.Configuration.TriggerType = ContainerAppJobTriggerType.Manual;
    });
```
{% endtab %}
{% endtabs %}

### Schedule trigger

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
:::note
The Azure Container App Jobs API is not yet available in the TypeScript AppHost.
:::
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

builder.AddProject<Projects.ScheduledTask>("scheduled-task")
    .PublishAsAzureContainerAppJob((_, job) =>
    {
        job.Configuration.TriggerType = ContainerAppJobTriggerType.Schedule;
        job.Configuration.ScheduleTriggerConfig.CronExpression = "0 */6 * * *"; // Every 6 hours
        job.Configuration.ScheduleTriggerConfig.Parallelism = 1;
        job.Configuration.ScheduleTriggerConfig.ReplicaCompletionCount = 1;
    });
```
{% endtab %}
{% endtabs %}

### Event trigger

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
:::note
The Azure Container App Jobs API is not yet available in the TypeScript AppHost.
:::
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

builder.AddProject<Projects.EventDrivenTask>("event-task")
    .PublishAsAzureContainerAppJob((_, job) =>
    {
        job.Configuration.TriggerType = ContainerAppJobTriggerType.Event;
        job.Configuration.EventTriggerConfig.Scale.MinExecutions = 1;
        job.Configuration.EventTriggerConfig.Scale.MaxExecutions = 10;
        job.Configuration.EventTriggerConfig.Parallelism = 1;
        job.Configuration.EventTriggerConfig.ReplicaCompletionCount = 1;
    });
```
{% endtab %}
{% endtabs %}

## Advanced configuration

### Set resource requirements

Configure CPU and memory for your job:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
:::note
The Azure Container App Jobs API is not yet available in the TypeScript AppHost.
:::
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

builder.AddProject<Projects.ResourceIntensiveTask>("intensive-task")
    .PublishAsAzureContainerAppJob((_, job) =>
    {
        job.Configuration.TriggerType = ContainerAppJobTriggerType.Manual;
        job.Template.Containers[0].Value!.Resources.Cpu = 1.0;
        job.Template.Containers[0].Value!.Resources.Memory = "2Gi";
    });
```
{% endtab %}
{% endtabs %}

### Add environment variables

Pass environment variables — including provisioning parameters — into the job container:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
:::note
The Azure Container App Jobs API is not yet available in the TypeScript AppHost.
:::
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var connectionString = builder.AddParameter("connectionString");

builder.AddProject<Projects.DatabaseTask>("db-task")
    .PublishAsAzureContainerAppJob((infra, job) =>
    {
        job.Configuration.TriggerType = ContainerAppJobTriggerType.Manual;
        job.Template.Containers[0].Value!.Env.Add(new ContainerAppEnvironmentVariable
        {
            Name = "ConnectionString",
            Value = connectionString.AsProvisioningParameter(infra)
        });
    });
```
{% endtab %}
{% endtabs %}

### Configure timeout and retry policy

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
:::note
The Azure Container App Jobs API is not yet available in the TypeScript AppHost.
:::
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

builder.AddProject<Projects.RetryableTask>("retryable-task")
    .PublishAsAzureContainerAppJob((_, job) =>
    {
        job.Configuration.TriggerType = ContainerAppJobTriggerType.Manual;
        job.Configuration.ReplicaTimeout = 1800; // 30 minutes
        job.Configuration.ReplicaRetryLimit = 3;
    });
```
{% endtab %}
{% endtabs %}

## Publish a container resource as a job

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
:::note
The Azure Container App Jobs API is not yet available in the TypeScript AppHost.
:::
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

builder.AddContainer("batch-processor", "myregistry.azurecr.io/batch-processor:latest")
    .PublishAsAzureContainerAppJob((_, job) =>
    {
        job.Configuration.TriggerType = ContainerAppJobTriggerType.Schedule;
        job.Configuration.ScheduleTriggerConfig.CronExpression = "0 2 * * 0"; // Weekly on Sunday at 2 AM
    });
```
{% endtab %}
{% endtabs %}

## Publish an executable resource as a job

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
:::note
The Azure Container App Jobs API is not yet available in the TypeScript AppHost.
:::
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

builder.AddExecutable("data-script", "python", ".", "process_data.py")
    .PublishAsAzureContainerAppJob((_, job) =>
    {
        job.Configuration.TriggerType = ContainerAppJobTriggerType.Manual;
    });
```
{% endtab %}
{% endtabs %}

## See also

- [Azure Container Apps jobs overview](https://learn.microsoft.com/azure/container-apps/jobs) — Microsoft Learn reference for the underlying Azure resource.
- [Configure Azure Container Apps](/integrations/cloud/azure/configure-container-apps/) — Customize Container Apps environments and resources in your AppHost.
- [Azure integrations overview](/integrations/cloud/azure/overview/) — Overview of all Aspire Azure hosting integrations.
