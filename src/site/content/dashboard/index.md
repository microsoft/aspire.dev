---
title: Aspire dashboard for distributed apps
prev:
  link: /integrations/
  label: Integrations
next:
  link: /deployment/
  label: Deployment
description: Monitor, debug, and manage your distributed applications with the Aspire dashboard — real-time telemetry, resource graphs, console logs, and OpenTelemetry support.
editUrl: false
tableOfContents: false
pageActions: false
props:
  topic_hero_floating_icons:
    - magnifier
    - document
    - setting
    - open-book
    - random
  topic_hero_primary_cta:
    label: Explore features
    href: /dashboard/explore/
  topic_hero_secondary_cta:
    label: Read dashboard overview
    href: /dashboard/overview/
  image_showcase_cta:
    label: Explore the resources page
    href: /dashboard/explore/
  image_showcase_cta_2:
    label: Learn about tracing
    href: /dashboard/explore/#traces-page
  image_showcase_cta_3:
    label: View log features
    href: /dashboard/explore/#structured-logs-page
  image_showcase_cta_4:
    label: Use AI coding agents
    href: /dashboard/ai-coding-agents/
  capability_grid_capabilities:
    - icon: seti:happenings
      title: Resource management
      description: Start, stop, and restart any resource in your application. View endpoints, environment variables, and health status.
      href: /dashboard/explore/
    - icon: magnifier
      title: Distributed tracing
      description: Follow requests across service boundaries with span-level detail. Identify bottlenecks and errors instantly.
      href: /dashboard/explore/#traces-page
    - icon: document
      title: Structured & console logs
      description: View structured and console logs from every resource with powerful filtering, search, and error highlighting.
      href: /dashboard/explore/#structured-logs-page
    - icon: bars
      title: Metrics & monitoring
      description: Track request counts, error rates, and custom metrics with interactive charts and exemplar linking.
      href: /dashboard/explore/#metrics-page
    - icon: open-book
      title: OpenTelemetry native
      description: Built on OTLP — the open standard for telemetry. Works with any language or framework that supports OpenTelemetry.
      href: /dashboard/standalone/
    - icon: laptop
      title: Standalone mode
      description: Use the dashboard independently to monitor any application that sends OpenTelemetry data.
      href: /dashboard/standalone/
  feature_showcase_features:
    - icon: puzzle
      title: AI coding agents
      description: Use the Aspire CLI and MCP server to give agents dashboard data for diagnosing and verifying app changes.
      href: /dashboard/ai-coding-agents/
      label: Use agents
      accent: purple
    - icon: setting
      title: Configuration
      description: Customize OTLP endpoints, authentication, telemetry limits, and more. The dashboard adapts to your workflow.
      href: /dashboard/configuration/
      label: View options
      accent: blue
    - icon: warning
      title: Security
      description: Understand security considerations for exposing dashboard data and configure authentication for production scenarios.
      href: /dashboard/security-considerations/
      label: Security guide
      accent: orange
    - icon: random
      title: Browser telemetry
      description: Enable browser-based telemetry collection to capture frontend performance data alongside backend traces.
      href: /dashboard/enable-browser-telemetry/
      label: Enable telemetry
      accent: green
  cta_banner_primary_cta:
    label: Get started with Aspire
    href: /get-started/first-app/
  cta_banner_secondary_cta:
    label: Explore all features
    href: /dashboard/explore/
---

{% topic_hero icon: "seti:happenings", title: "Your app, at a glance.", highlight: "Fully observable.", subtitle: "Real-time visibility into every resource, log, trace, and metric in your distributed app — right from your dev environment.", accent: "blue", floating_icons: props.topic_hero_floating_icons, primary_cta: props.topic_hero_primary_cta, secondary_cta: props.topic_hero_secondary_cta %}

## Built on OpenTelemetry

The Aspire Dashboard is your command center during development. Powered by [OpenTelemetry](https://opentelemetry.io/) — the industry-standard observability framework — it automatically collects traces, metrics, and structured logs from every resource in your AppHost using <abbr title="OpenTelemetry Protocol" data-tooltip-placement="top">OTLP</abbr> (OpenTelemetry Protocol) and surfaces them through a rich, interactive UI. No vendor lock-in, no proprietary agents — just open standards.

{% image_showcase title: "Resources at your fingertips", description: "See the health, endpoints, and state of every service, container, and project in your application at a glance. Start, stop, and restart resources directly from the dashboard.", dark_image: "/assets/images/dashboard/explore/resources-filtered-containers.png", light_image: "/assets/images/dashboard/explore/resources-filtered-containers-light.png", image_alt: "Aspire Dashboard resources page showing filtered container resources with health status, endpoints, and state.", cta: props.image_showcase_cta %}

{% image_showcase title: "Distributed traces, demystified", description: "Follow requests across service boundaries with detailed span-level traces. Quickly identify bottlenecks, errors, and latency issues in your distributed application.", dark_image: "/assets/images/dashboard/explore/trace-span-details.png", light_image: "/assets/images/dashboard/explore/trace-span-details-light.png", image_alt: "Aspire Dashboard trace detail view showing a distributed request waterfall with span-level timing and attributes.", image_position: "left", cta: props.image_showcase_cta_2 %}

{% image_showcase title: "Structured logs with context", description: "Structured logs are automatically collected and enriched with resource context. Filter by severity, resource, or trace to find exactly what you need.", dark_image: "/assets/images/dashboard/explore/structured-logs-errors-view.png", light_image: "/assets/images/dashboard/explore/structured-logs-errors-view-light.png", image_alt: "Aspire Dashboard structured logs error detail view showing log entries with severity, context, and error information.", cta: props.image_showcase_cta_3 %}

## Run the dashboard standalone

The dashboard starts automatically with your Aspire app, but it can also run standalone to monitor any application that sends OpenTelemetry data.

Install the [Aspire CLI](/get-started/install-cli/), then start the dashboard:

```bash title="Aspire CLI"
aspire dashboard run
```

Or run the same standalone dashboard from its container image:

{% os_tabs sync: "terminal" %}
{% tab "Bash", icon: "seti:shell" %}
```bash
docker run --rm -it -p 18888:18888 -p 4317:18889 -p 4318:18890 -d --name aspire-dashboard \
    mcr.microsoft.com/aspire/dashboard:latest
```
{% endtab %}
{% tab "PowerShell", icon: "seti:powershell" %}
```powershell
docker run --rm -it -p 18888:18888 -p 4317:18889 -p 4318:18890 -d --name aspire-dashboard `
    mcr.microsoft.com/aspire/dashboard:latest
```
{% endtab %}
{% endos_tabs %}

Open the dashboard URL, then point your apps' OTLP exporter to `http://localhost:4317`. For prerequisites, login details, and additional options, see the [standalone dashboard guide](/dashboard/standalone/).

## AI-powered debugging

{% image_showcase title: "AI agents with dashboard context", description: "Give AI coding agents deep observability into resource state, health checks, logs, traces, and relationships so they can diagnose issues and verify fixes with confidence.", light_image: "/assets/images/dashboard/ai-coding-agents/ai-agents-dialog-light.png", dark_image: "/assets/images/dashboard/ai-coding-agents/ai-agents-dialog-dark.png", image_alt: "Aspire Dashboard AI agents dialog explaining telemetry data available to coding agents.", image_position: "left", cta: props.image_showcase_cta_4 %}

## Key capabilities

{% capability_grid capabilities: props.capability_grid_capabilities %}

## Beyond development

{% feature_showcase features: props.feature_showcase_features %}

{% cta_banner title: "Ready to see your app in action?", description: "The Aspire Dashboard is included in every Aspire project. Start building and it lights up automatically.", primary_cta: props.cta_banner_primary_cta, secondary_cta: props.cta_banner_secondary_cta %}
