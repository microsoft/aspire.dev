---
title: WaitFor
termType: API method
description: Delays a resource's startup until a dependency is running and its configured health checks pass.
aliases: [waitFor, readiness dependency]
topics: [foundations, reference]
context: Wait for PostgreSQL before starting an API so its initial database connection is not attempted before the configured readiness checks succeed.
related: [withreference, health-check, waitforstart, waitforcompletion]
resources:
  - title: Configure health checks for your resources
    href: /fundamentals/health-checks/
  - title: Resource readiness
    href: /architecture/resource-model/#resource-health
legacyAnchors: [waitfor]
legacyGroup: apis-and-patterns
---
`WaitFor` in C# and `waitFor` in TypeScript express a startup dependency. For a running resource with health checks, Aspire waits for those checks to report healthy. Without health checks, reaching the running state is sufficient.

Use a reference as well when the consuming resource needs connection information. Waiting alone does not supply a connection string or endpoint.

Readiness is only as meaningful as the checks you configure. Startup coordination does not replace retry policies or recovery from failures after startup.
