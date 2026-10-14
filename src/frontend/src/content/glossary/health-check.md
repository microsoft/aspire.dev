---
title: Health check
description: A probe that reports whether a service or dependency is functioning, with separate roles for orchestration and application endpoints.
aliases: [readiness, liveness, health probe]
topics: [foundations, dashboard]
context: Configure an AppHost check to gate API startup, and expose application readiness and liveness endpoints for your deployment platform.
related: [waitfor, waitforstart, service-defaults]
resources:
  - title: Add health checks to your application
    href: /fundamentals/health-checks/
legacyAnchors: [health-check]
legacyGroup: key-terms
---
Aspire uses health checks in two distinct places:

- **AppHost resource checks** report resource health to orchestration and the dashboard. They influence readiness waits.
- **Application endpoint checks** expose health over HTTP for monitoring and deployment platforms.

The .NET service defaults template includes `/health` for readiness and `/alive` for liveness when default endpoints are mapped. Readiness includes all registered checks; liveness uses checks tagged `live`. Applications in other runtimes implement their own endpoints.

An HTTP health endpoint does not automatically become an AppHost resource check. Configure the AppHost to probe it when that is the readiness signal you need.
