---
title: Azure Kubernetes Service (AKS) integration
description: Learn how to add Azure Kubernetes Service deployment support to your Aspire application using the Aspire.Hosting.Azure.Kubernetes hosting integration.
---

{% image "/assets/images/icons/kubernetes.svg", alt: "Kubernetes logo", width: 100, height: 100, class: "float-inline-left icon", zoomable: false %}

This article is the reference for the Aspire Azure Kubernetes Service (AKS) hosting integration. It enumerates the AppHost APIs — with examples for both `AppHost.cs` and `apphost.mts` — that you use to model an AKS environment and its node pools in your [`AppHost`](/get-started/app-host/) project.

The Aspire AKS hosting integration enables you to deploy your Aspire application to Azure Kubernetes Service (AKS) with full provisioning. Aspire creates the AKS cluster, Azure Container Registry (ACR), managed identity, and any Azure resources your app depends on — all from your AppHost definition.

## Hosting integration

To get started with the Aspire AKS hosting integration, install the [📦 Aspire.Hosting.Azure.Kubernetes](https://www.nuget.org/packages/Aspire.Hosting.Azure.Kubernetes) NuGet package in the AppHost project:

{% install_package "Aspire.Hosting.Azure.Kubernetes" %}

## Add AKS environment

After installing the package, add an AKS environment to your AppHost using {% api "Aspire.Hosting.AzureKubernetesEnvironmentExtensions.AddAzureKubernetesEnvironment" %}:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const aks = await builder.addAzureKubernetesEnvironment('aks');

const api = await builder
    .addNodeApp('api', './api', 'src/index.ts')
    .withHttpEndpoint({ env: 'PORT' })
    .withExternalHttpEndpoints();

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var aks = builder.AddAzureKubernetesEnvironment("aks");

var api = builder.AddProject<Projects.MyApi>("api");

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

When an AKS environment is present, all compute resources are automatically deployed to AKS — no additional opt-in is required.

## Configure the system node pool

Customize the system node pool VM size and scaling using {% api "Aspire.Hosting.AzureKubernetesEnvironmentExtensions.WithSystemNodePool" %}:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
const aks = await builder.addAzureKubernetesEnvironment('aks');
await aks.withSystemNodePool('Standard_D4s_v5', 1, 5);
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
builder.AddAzureKubernetesEnvironment("aks")
    .WithSystemNodePool("Standard_D4s_v5", minCount: 1, maxCount: 5);
```
{% endtab %}
{% endtabs %}

## Add node pools

Add additional node pools for workload isolation, GPU workloads, or specialized hardware requirements using {% api "Aspire.Hosting.AzureKubernetesEnvironmentExtensions.AddNodePool" %}:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
const aks = await builder.addAzureKubernetesEnvironment('aks');
const gpuPool = await aks.addNodePool('gpupool', 'Standard_NC6s_v3', 0, 5);

const worker = await builder.addContainer('ml-worker', 'my-ml-image');
await worker.withNodePool(gpuPool);
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var aks = builder.AddAzureKubernetesEnvironment("aks");
var gpuPool = aks.AddNodePool("gpupool", "Standard_NC6s_v3", minCount: 0, maxCount: 5);

builder.AddContainer("ml-worker", "my-ml-image")
    .WithNodePool(gpuPool);
```
{% endtab %}
{% endtabs %}

## Add a persistent volume

:::note
Persistent volume APIs are experimental. In C#, suppress the `ASPIRECOMPUTE002` diagnostic to use them.
:::

Call {% api "Aspire.Hosting.AzureKubernetesPersistentVolumeExtensions.AddPersistentVolume" %} directly on the AKS environment to model durable storage without reaching through to the underlying Kubernetes integration. The call forwards to the AKS environment's Kubernetes publisher, so the same configuration methods and workload-binding APIs described in [Persistent volumes on Kubernetes](/deployment/kubernetes/persistent-volumes/) apply:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
const aks = await builder.addAzureKubernetesEnvironment("aks");

const data = await aks.addPersistentVolume("data");
await data.withCapacity("20Gi");

const api = await builder
    .addNodeApp('api', './api', 'src/index.ts')
    .withHttpEndpoint({ env: 'PORT' })
    .withExternalHttpEndpoints()
    .withKubernetesPersistentVolumeMount(data, "/data");
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var aks = builder.AddAzureKubernetesEnvironment("aks");

var data = aks.AddPersistentVolume("data")
    .WithCapacity("20Gi");

builder.AddProject<Projects.Api>("api")
    .WithPersistentVolume(data, "/data");
```
{% endtab %}
{% endtabs %}

When you don't set a storage class, the generated claim omits `spec.storageClassName` so the cluster's default storage class provisions the disk. A standard AKS cluster dynamically provisions an Azure managed disk for such claims. To request Premium SSD storage explicitly, call `WithStorageClass("managed-csi-premium")` in C# or `withStorageClass('managed-csi-premium')` in TypeScript.

:::note
The APIs that are specific to Azure Files are intentionally deferred until managed-identity mounting can be modeled securely.
:::

{% learnmore %}
For the full set of configuration methods (storage class, capacity, access modes, annotations) and how to bind volumes to workloads, see [Persistent volumes on Kubernetes](/deployment/kubernetes/persistent-volumes/).
{% endlearnmore %}

## Configure CPU and memory requests and limits

AKS uses the Kubernetes publishing path for application workloads. In a C# AppHost, use `PublishAsKubernetesService` to configure the generated pod container's scheduling requests and runtime limits. See [Configure CPU and memory requests and limits](/integrations/compute/kubernetes/#configure-cpu-and-memory-requests-and-limits) for the sample and Kubernetes quantity syntax.

## Publishing and deployment

The AKS integration supports both [`aspire publish`](/reference/cli/commands/aspire-publish/) (generate Helm chart and Bicep artifacts) and [`aspire deploy`](/reference/cli/commands/aspire-deploy/) (provision Azure infrastructure and deploy in a single command).

For a complete end-to-end walkthrough, see [Deploy to AKS](/deployment/kubernetes/aks/).

## See also

- [Deploy to AKS](/deployment/kubernetes/aks/)
- [Deploy to Kubernetes](/deployment/kubernetes/)
- [Kubernetes integration](/integrations/compute/kubernetes/)
- [Persistent volumes on Kubernetes](/deployment/kubernetes/persistent-volumes/)
- [Azure Container Apps integration](/integrations/cloud/azure/configure-container-apps/)
- [Deploy to Azure](/deployment/azure/)
- [Azure compute integrations overview](/integrations/cloud/azure/overview/)
- [Azure Kubernetes Service documentation](https://learn.microsoft.com/azure/aks/)
