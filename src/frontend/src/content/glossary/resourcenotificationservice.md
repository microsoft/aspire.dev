---
title: ResourceNotificationService
termType: API type
description: An AppHost service that publishes resource state snapshots for observers such as the dashboard and orchestration.
aliases: [resource notifications, state snapshots]
topics: [reference, dashboard]
context: A custom resource integration publishes a new status snapshot when its provisioning operation changes state.
related: [lifecycle-events, aspire-dashboard, resource]
resources:
  - title: Report resource status to the dashboard
    href: /architecture/resource-model/#status-reporting
legacyAnchors: [resourcenotificationservice]
legacyGroup: api-reference-terms
---
`ResourceNotificationService` lets resource implementations publish updated snapshots of resource state. Observers use these updates to track status and present it in the dashboard.

State snapshots describe the latest known state. They are distinct from lifecycle events, which signal a particular action or transition, and from console logs, which record human-readable diagnostic messages.
