---
title: OpenTelemetry Protocol
termType: Protocol
pronunciation: O-T-L-P (OTLP)
description: The protocol used to transmit telemetry such as logs, traces, and metrics from instrumented apps to a receiver.
aliases: [OTLP]
topics: [dashboard]
context: Configure your API's OpenTelemetry exporter with the dashboard's OTLP endpoint to send its logs, traces, and metrics to Aspire.
related: [opentelemetry, aspire-dashboard, endpoint, service-defaults]
resources:
  - title: Export telemetry with OTLP
    href: /fundamentals/telemetry/#export-opentelemetry-data-for-monitoring
  - title: Configure the dashboard OTLP receiver
    href: /dashboard/configuration/#otlp
legacyAnchors: []
---
OpenTelemetry Protocol (OTLP) defines how telemetry is encoded and transmitted between applications, collectors, and receivers. It supports gRPC and HTTP transports.

The Aspire dashboard provides an OTLP receiver. An instrumented application uses an exporter configured with a compatible endpoint and transport to send data to it.

OTLP is the transport protocol, not the instrumentation library or the entire OpenTelemetry ecosystem. Configuring an OTLP endpoint does not by itself instrument application code.
