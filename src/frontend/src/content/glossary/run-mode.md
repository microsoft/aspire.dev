---
title: Run mode
description: The AppHost execution mode used to orchestrate an application's resources during local development.
aliases: [local development mode]
topics: [foundations]
context: Run aspire run to start your AppHost, launch local workloads, and inspect their status in the dashboard.
related: [publish-mode, apphost, aspire-dashboard]
resources:
  - title: Run your Aspire application
    href: /reference/cli/commands/aspire-run/
legacyAnchors: [run-mode]
legacyGroup: execution-modes
---
Run mode orchestrates development resources such as application processes and containers, and makes their state available in the dashboard. Start it with `aspire run` or your IDE's AppHost debugging workflow.

Resources may also represent existing or provisioned cloud services; run mode does not mean every dependency runs locally. Container resources require a supported container runtime.

Connection addresses depend on where the consumer runs. A host process and a container may receive different addresses for the same dependency, rather than every endpoint using localhost.
