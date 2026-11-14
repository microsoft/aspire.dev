---
title: Aspire documentation home
prev: false
next:
  link: /integrations/
  label: Integrations
description: 'Browse the official Aspire documentation: get started with C# and TypeScript AppHosts, model distributed apps, deploy to Azure and Kubernetes, and observe in the dashboard.'
banner:
  content: |
    <strong>✨ Aspire 13.6 is available!</strong> — <a href="/whats-new/aspire-13-6/">Explore the latest features and improvements</a>
bannerAutoDismissAfterDays: 14
editUrl: false
tableOfContents: false
pageActions: false
# Data of the components (Liquid has no array literals in tag arguments). hero_section.floating_icons is what
# HeroSection.astro computed from the title (buildFloatingIconLayout, seeded by the title, rightRange 55).
hero_section:
  title: Choose your Aspire path
  highlight: for your stack.
  subtitle: Aspire is a code-first orchestration and observability layer for distributed applications. Start with the path that matches your repo, runtime, or workflow.
  logo: /assets/images/aspire-logo-256.svg
  primary_cta: { label: "Build your first app", href: /get-started/first-app/ }
  secondary_cta: { label: "What is Aspire?", href: /get-started/what-is-aspire/ }
  floating_icons:
    - { icon: "open-book", top: "79%", right: "18%", size: "1.88rem", delay: "1.2s", duration: "14.1s" }
    - { icon: "puzzle", top: "64%", right: "46%", size: "1.89rem", delay: "3.3s", duration: "10.0s" }
    - { icon: "rocket", top: "31%", right: "46%", size: "1.84rem", delay: "3.5s", duration: "14.5s" }
    - { icon: "setting", top: "46%", right: "28%", size: "2.11rem", delay: "5.4s", duration: "12.4s" }
    - { icon: "seti:config", top: "34%", right: "8%", size: "1.70rem", delay: "5.0s", duration: "14.5s" }
journey_steps:
  - icon: seti:json
    title: Build your first app
    description: Start with the guided quickstart for a new multi-service Aspire application.
    href: /get-started/first-app/
    label: Start building
  - icon: puzzle
    title: Add Aspire to an existing app
    description: Model the services, frontends, containers, and shared infrastructure you already run today.
    href: /get-started/add-aspire-existing-app/
    label: Add Aspire
  - icon: magnifier
    title: Use the dashboard standalone
    description: Run the Aspire Dashboard against any OpenTelemetry-enabled app, even without a full AppHost.
    href: /dashboard/standalone/
    label: Use the dashboard
  - icon: star
    title: Use AI coding agents
    description: Give coding agents access to the same app model, resources, logs, and traces that you use.
    href: /get-started/ai-coding-agents/
    label: Work with agents
showcase_features:
  - icon: open-book
    title: What is Aspire?
    description: Discover why Aspire is the fastest way to build production-ready cloud applications — unified tooling that eliminates complexity.
    href: /get-started/what-is-aspire/
    label: Aspire explained
    accent: purple
  - icon: seti:config
    title: The AppHost
    description: Define your entire app architecture in code — C#, TypeScript, and more. No YAML, no configuration drift — just code that describes services and dependencies.
    href: /get-started/app-host/
    label: See how it works
    accent: blue
  - icon: puzzle
    title: Understanding resources
    description: Understand the resources, relationships, and wiring that make the AppHost the center of your distributed application model.
    href: /get-started/resources/
    label: Learn resource modeling
    accent: green
  - icon: rocket
    title: Deployment & topology
    description: Deploy anywhere with confidence. Your local dev setup automatically translates to Docker, Kubernetes, Azure, or any cloud provider.
    href: /deployment/pipelines/
    label: Deploy all the things
    accent: orange
cta_primary: { label: "Deploy your first app", href: /get-started/deploy-first-app/ }
cta_secondary: { label: "Add Aspire to an existing app", href: /get-started/add-aspire-existing-app/ }
---

{% include "partials/home/hero-section.liquid", hs: hero_section %}

## Choose your path

{% include "partials/home/quick-start-journey.liquid", journey_steps: journey_steps %}

## Explore key concepts

{% feature_showcase features: showcase_features %}

{% cta_banner title: "Take the next step with Aspire.", description: "Deploy the app you just built, or bring Aspire into an existing repo and model the stack you already run.", primary_cta: cta_primary, secondary_cta: cta_secondary %}
