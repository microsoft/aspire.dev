---
title: Deploy to Kubernetes
seoTitle: 'Aspire on Kubernetes overview: target a real cluster'
description: Deploy Aspire applications to Kubernetes — whether you manage your own cluster or use Azure Kubernetes Service, Helm-based publishing, and CI/CD integrations.
---

Use `aspire publish` or `aspire deploy` to take your Aspire application to Kubernetes. Aspire uses the Kubernetes-targeted environments in your AppHost to determine how each compute resource maps to Kubernetes objects, then generates Helm charts or provisions infrastructure depending on the target you choose.

{% learnmore %}
To understand how Aspire deployment works across all targets, see the [Deployment overview](/deployment/deploy-with-aspire/).
{% endlearnmore %}

## Choose your target

Aspire supports two Kubernetes deployment targets:

{% card_grid %}
{% link_card title: "Kubernetes", description: "Deploy to any existing Kubernetes cluster using Helm charts generated from your AppHost model.", href: "/deployment/kubernetes/clusters/" %}

{% link_card title: "Azure Kubernetes Service (AKS)", description: "Deploy to AKS with full provisioning — Aspire creates the cluster, container registry, and Azure resources for you.", href: "/deployment/kubernetes/aks/" %}
{% endcard_grid %}

## Shared prerequisites

- [Aspire prerequisites](/get-started/prerequisites/)
- [Aspire CLI](/get-started/install-cli/) installed
- [kubectl](https://kubernetes.io/docs/tasks/tools/) installed and available on your `PATH`
- [Helm](https://helm.sh/docs/intro/install/) **v4.2.0 or later** installed and available on your `PATH`

## How Aspire maps resources to Kubernetes

When you publish or deploy, Aspire translates your application model into Kubernetes-native resources:

| Aspire resource       | Kubernetes resource                          |
| --------------------- | -------------------------------------------- |
| Project resources     | Deployments or StatefulSets                  |
| Container resources   | Deployments or StatefulSets                  |
| Connection strings    | ConfigMaps and Secrets                       |
| Environment variables | ConfigMaps and Secrets                       |
| Endpoints             | Services                                     |
| Volumes               | PersistentVolumes and PersistentVolumeClaims |

For durable storage that you model as first-class resources and bind to workloads, see [Persistent volumes on Kubernetes](/deployment/kubernetes/persistent-volumes/).

For per-container scheduling reservations and runtime caps on either Kubernetes target, see [Configure CPU and memory requests and limits](/integrations/compute/kubernetes/#configure-cpu-and-memory-requests-and-limits). The sample uses the C# AppHost workload customization API.

## Publish vs deploy

Both Kubernetes targets support `aspire publish`. The key difference is whether the target also supports `aspire deploy`:

| Target     | `aspire publish`                                   | `aspire deploy`                                                    |
| ---------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| Kubernetes | Generates Helm charts you apply with `helm` or CI  | Deploys to the current `kubectl` context using `helm install`      |
| AKS        | Generates Helm charts and Bicep infrastructure     | Provisions Azure resources and deploys in a single command         |

{% learnmore %}
For more on the pipeline model and how publish and deploy relate, see [Pipelines and app topology](/deployment/pipelines/).
{% endlearnmore %}

## Continue learning

{% card_grid %}
{% link_card title: "Deploy to Kubernetes", description: "Step-by-step guide for deploying to an existing Kubernetes cluster.", href: "/deployment/kubernetes/clusters/" %}

{% link_card title: "Deploy to AKS", description: "Step-by-step guide for deploying to Azure Kubernetes Service.", href: "/deployment/kubernetes/aks/" %}

{% link_card title: "Kubernetes integration", description: "Hosting integration reference for Aspire.Hosting.Kubernetes.", href: "/integrations/compute/kubernetes/" %}

{% link_card title: "AKS integration", description: "Hosting integration reference for Aspire.Hosting.Azure.Kubernetes.", href: "/integrations/cloud/azure/aks/" %}

{% link_card title: "External Helm charts", description: "Install pre-existing Helm charts alongside your application using AddHelmChart.", href: "/deployment/kubernetes/helm-charts/" %}

{% link_card title: "Persistent volumes", description: "Model durable storage as first-class resources and bind them to workloads.", href: "/deployment/kubernetes/persistent-volumes/" %}
{% endcard_grid %}
