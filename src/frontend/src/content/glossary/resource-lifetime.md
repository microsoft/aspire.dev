---
title: Resource lifetime
description: The policy that determines when Aspire starts, retains, or disposes of a container, executable, or project resource.
aliases: [lifetime]
topics: [foundations]
context: Keep a database resource running while you restart the AppHost, and configure a data volume separately to preserve its data if it is recreated.
related: [resource, apphost, lifecycle-events, run-mode]
resources:
  - title: Configure resource lifetimes
    href: /app-host/resource-lifetimes/
  - title: Persist container data
    href: /fundamentals/persist-data-volumes/
legacyAnchors: []
---
Resource lifetime controls how a resource's existence relates to an AppHost run or another owner.

- **Session lifetime** ties the resource to the AppHost session.
- **Persistent lifetime** keeps the resource after the AppHost exits and allows reuse on subsequent runs.
- **Parent-process lifetime** scopes cleanup to a specified parent process.
- **Resource-scoped lifetime** follows another resource's effective lifetime.

Persistent lifetime does **not** guarantee durable data. Aspire can recreate a persistent resource when its configuration changes. Use storage such as a volume when data must survive recreation.

Available lifetime APIs and their stability vary by Aspire version and resource type.
