---
title: Service defaults
termType: Pattern
description: Shared .NET application setup for telemetry, health checks, service discovery, and HTTP resilience that you explicitly opt into.
aliases: [ServiceDefaults, AddServiceDefaults]
topics: [foundations, dashboard]
context: Reference your solution's ServiceDefaults project and call AddServiceDefaults in each participating .NET service; map health endpoints separately.
related: [opentelemetry, health-check, service-discovery]
resources:
  - title: Configure service defaults for your .NET services
    href: /get-started/csharp-service-defaults/
legacyAnchors: [service-defaults]
legacyGroup: core-concepts
---
The service defaults project is shared source code created by Aspire's .NET templates, not settings automatically applied to every project in an AppHost.

Each participating .NET application references that project and calls `AddServiceDefaults` during startup. The template configures OpenTelemetry, health checks, service discovery, and HTTP client resilience. Applications call `MapDefaultEndpoints` separately to map health endpoints; the template limits that mapping to development by default.

Review and customize these defaults for your application and deployment environment. Services in JavaScript, Python, and other runtimes configure equivalent telemetry and health behavior through their own libraries; a TypeScript AppHost does not automatically instrument its workloads.
