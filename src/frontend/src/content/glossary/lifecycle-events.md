---
title: Lifecycle events
description: Signals emitted at application or resource lifecycle stages so handlers can participate in orchestration.
aliases: [resource lifecycle, eventing]
topics: [reference]
context: An integration responds when endpoints have been allocated or just before a resource starts to perform stage-specific setup.
related: [resourcenotificationservice, resource, waitfor]
resources:
  - title: Handle AppHost lifecycle events
    href: /app-host/eventing/
legacyAnchors: [lifecycle-events]
legacyGroup: api-reference-terms
---
Lifecycle events signal stages such as resource initialization, endpoint allocation, startup, and readiness. Handlers can use these stages to coordinate work that cannot happen while the model is initially declared.

Events are not periodic timers or a replacement for resource state snapshots. Use the documented event for the operation you need, and avoid slow or unnecessary work in handlers that participate in orchestration.

Aspire manages standard resource readiness based on running state and configured health checks. Do not manufacture a readiness signal merely to bypass an unresolved dependency.
