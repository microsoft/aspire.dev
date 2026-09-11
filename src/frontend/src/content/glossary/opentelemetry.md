---
title: OpenTelemetry
termType: Standard
description: A standard and ecosystem for collecting and exporting logs, traces, and metrics from instrumented applications.
aliases: [OTEL, OTel]
topics: [dashboard]
context: Instrument your API and export its telemetry to the Aspire dashboard to connect request traces with structured logs and performance metrics.
related: [otlp, aspire-dashboard, service-defaults, distributed-application]
resources:
  - title: Collect telemetry from your application
    href: /fundamentals/telemetry/
legacyAnchors: [opentelemetry]
legacyGroup: dashboard-and-observability
---
Telemetry is the data an application emits about its behavior. OpenTelemetry is a standard and ecosystem for collecting and exporting that data, not another name for telemetry itself.

OpenTelemetry provides APIs, SDKs, instrumentation, and protocols for observability:

- **Logs** record events and their context.
- **Traces** follow work across operations and service calls.
- **Metrics** measure behavior such as request rates, latency, and resource usage.

Aspire's dashboard can receive OpenTelemetry data. Participating .NET applications can configure it through service defaults; applications in other runtimes use their own OpenTelemetry libraries.

Instrumentation and exporters must be configured. Adding a service to an AppHost alone does not instrument all of its code.
