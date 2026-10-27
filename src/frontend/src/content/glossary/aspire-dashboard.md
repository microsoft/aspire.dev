---
title: Aspire dashboard
termType: Tool
description: A web interface for exploring resource status, console output, structured logs, distributed traces, and metrics.
aliases: [dashboard]
topics: [dashboard]
context: Follow a failing frontend request into an API trace, then inspect the API's logs and database resource health.
related: [opentelemetry, health-check, resourcenotificationservice]
resources:
  - title: Explore your app in the dashboard
    href: /dashboard/overview/
legacyAnchors: [aspire-dashboard]
legacyGroup: dashboard-and-observability
---
The dashboard runs with the AppHost during local development and can also run standalone to receive telemetry. Use the URL printed by your AppHost or CLI instead of assuming a fixed port.

With an AppHost, it displays resources and their states, health information, and console output. Instrumented applications can send structured logs, traces, and metrics using OpenTelemetry.

Seeing a resource in the dashboard does not mean its application is already sending distributed traces or metrics. Configure telemetry in each workload and connect it to the appropriate receiver.
