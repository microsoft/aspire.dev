---
title: Aspire Integrations
seoTitle: Aspire integrations for databases, messaging, cloud
prev:
  link: /docs/
  label: Foundations
next:
  link: /dashboard/
  label: Dashboard
description: Connect your distributed applications to 150+ services — databases, caches, messaging, cloud platforms, and more — with a single line in your AppHost.
editUrl: false
tableOfContents: false
pageActions: false
props:
  topic_hero_floating_icons:
    - seti:db
    - approve-check-circle
    - random
    - cloud-download
    - setting
  topic_hero_primary_cta:
    label: Browse integrations
    href: /integrations/gallery/
  topic_hero_secondary_cta:
    label: What are integrations?
    href: /integrations/overview/
  capability_grid_capabilities:
    - icon: seti:db
      title: Databases
      description: PostgreSQL, SQL Server, MySQL, MongoDB, Oracle, Cosmos DB, and more — with full connection string management.
      href: /integrations/gallery/?search=database
    - icon: rocket
      title: Caching
      description: Redis, Valkey, Garnet, and hybrid caching solutions for high-performance data access patterns.
      href: /integrations/gallery/?search=caching
    - icon: comment-alt
      title: Messaging
      description: RabbitMQ, Azure Service Bus, Kafka, NATS, and other message brokers for event-driven architectures.
      href: /integrations/gallery/?search=messaging
    - icon: cloud-download
      title: Cloud services
      description: Azure, AWS, and GCP services including storage, AI, search, and identity — with local emulator support.
      href: /integrations/gallery/?search=cloud
    - icon: magnifier
      title: Observability
      description: OpenTelemetry, Seq, Grafana, and other platforms for logging, tracing, and metrics collection.
      href: /integrations/gallery/?search=observability
    - icon: random
      title: Frameworks & more
      description: Node.js, Python, Go, Java, reverse proxies, and developer tooling — Aspire is multi-language by design.
      href: /integrations/gallery/?search=framework
  cta_banner_primary_cta:
    label: Browse the gallery
    href: /integrations/gallery/
  cta_banner_secondary_cta:
    label: Read the overview
    href: /integrations/overview/
---

{% topic_hero icon: "puzzle", title: "Plug in anything.", highlight: "Ship faster.", subtitle: "Snap databases, caches, messaging, and cloud services into your AppHost with one line — Aspire handles the resource model and connection details.", accent: "green", floating_icons: props.topic_hero_floating_icons, primary_cta: props.topic_hero_primary_cta, secondary_cta: props.topic_hero_secondary_cta %}

## What you can connect

{% capability_grid columns: 3, capabilities: props.capability_grid_capabilities %}

{% cta_banner title: "Find the right integration", description: "Search and filter 150+ integrations by name, tag, or category. The gallery has everything you need to connect your app to the world.", primary_cta: props.cta_banner_primary_cta, secondary_cta: props.cta_banner_secondary_cta %}
