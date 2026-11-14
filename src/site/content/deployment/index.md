---
title: Aspire deployment overview
prev:
  link: /dashboard/
  label: Dashboard
next:
  link: /reference/overview/
  label: Reference
description: Ship your Aspire applications to Azure, Docker, Kubernetes, and beyond — choose a target, publish artifacts, and deploy with the Aspire CLI from a single AppHost.
editUrl: false
tableOfContents: false
pageActions: false
props:
  topic_hero_floating_icons:
    - cloud-download
    - seti:docker
    - laptop
    - seti:config
    - setting
  topic_hero_primary_cta:
    label: Deploy your first app
    href: /get-started/deploy-first-app/
  topic_hero_secondary_cta:
    label: Deploy with Aspire
    href: /deployment/deploy-with-aspire/
  capability_grid_capabilities:
    - icon: cloud-download
      title: Azure
      description: Choose Azure Container Apps or Azure App Service. Aspire provisions Azure infrastructure, resolves parameters, and applies the deployment from your AppHost model.
      href: /deployment/azure/
    - icon: seti:docker
      title: Docker Compose
      description: Generate production-ready Docker Compose files with parameterized environment variables. Perfect for self-hosted and on-premises scenarios.
      href: /deployment/docker-compose/
    - icon: seti:config
      title: Kubernetes
      description: Publish Helm charts or deploy directly to any Kubernetes cluster — self-managed or AKS — with full publish and deploy support.
      href: /deployment/kubernetes/
    - icon: puzzle
      title: Custom integrations
      description: Build your own publish or deploy integrations. The system is fully extensible — any hosting integration can participate in the deployment model.
      href: /deployment/custom-deployments/
  feature_showcase_features:
    - icon: seti:json
      title: Parameter placeholders
      description: Published assets use placeholders for secrets and environment-specific values. Shape stays consistent, values are injected at deploy time.
      href: /deployment/deploy-with-aspire/
      label: Learn about parameters
      accent: blue
    - icon: bars
      title: State caching
      description: Speed up repeated deployments with state caching. Aspire tracks what has changed and only updates what it needs to.
      href: /deployment/deployment-state-caching/
      label: Explore caching
      accent: green
    - icon: warning
      title: Azure security
      description: Follow best practices for securing your Azure deployments — managed identities, key vaults, network isolation, and more.
      href: /deployment/azure/azure-security-best-practices/
      label: Security best practices
      accent: orange
  cta_banner_primary_cta:
    label: Deploy your first app
    href: /get-started/deploy-first-app/
  cta_banner_secondary_cta:
    label: Browse integrations
    href: /integrations/
  quick_start_journey_steps:
    - icon: "seti:powershell"
      title: "aspire publish"
      description: "Transforms your AppHost model into integration-specific artifacts — Docker Compose files, Kubernetes manifests, Bicep templates, and more. Secrets remain as parameterized placeholders."
      href: "/reference/cli/commands/aspire-publish/"
      label: "View publish reference"
    - icon: "rocket"
      title: "aspire deploy"
      description: "Resolves parameters, applies configuration, and executes the deployment to your target environment. Works with Azure Container Apps, Kubernetes, and more."
      href: "/reference/cli/commands/aspire-deploy/"
      label: "View deploy reference"
    - icon: "setting"
      title: "Customize your pipeline"
      description: "Build custom deployment pipelines that plug into the same model. Use CI/CD variable injection, scripts, or your own toolchain to resolve parameters and apply changes."
      href: "/deployment/custom-deployments/"
      label: "Custom pipelines"
---

{% topic_hero icon: "rocket", title: "From dev to production,", highlight: "seamlessly.", subtitle: "Use `aspire publish` to emit deployment artifacts as a one-way handoff, or use `aspire deploy` to generate, resolve, and apply changes directly. Both workflows run the AppHost as part of the deployment pipeline to produce target-specific output.", accent: "orange", floating_icons: props.topic_hero_floating_icons, primary_cta: props.topic_hero_primary_cta, secondary_cta: props.topic_hero_secondary_cta %}

## How deployment works

Aspire's deployment model is built on two complementary commands that keep your workflow clean, secure, and extensible.

{% quick_start_journey steps: props.quick_start_journey_steps %}

## Deploy anywhere

Aspire is not locked to a single cloud. Your local dev topology translates directly to production infrastructure through hosting integrations.

{% capability_grid columns: 2, capabilities: props.capability_grid_capabilities %}

## Key concepts

{% feature_showcase features: props.feature_showcase_features %}

{% cta_banner title: "Ship with confidence", description: "Your AppHost model drives deployment output for each target platform. No configuration drift, no surprises — just consistent, repeatable deployments.", primary_cta: props.cta_banner_primary_cta, secondary_cta: props.cta_banner_secondary_cta %}
