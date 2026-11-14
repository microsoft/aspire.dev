---
title: Thank you
seoTitle: Open-source projects that power the Aspire ecosystem
description: Celebrate the open-source projects, libraries, and communities that make Aspire possible, from OpenTelemetry to the broader cloud-native ecosystem.
editUrl: false
giscus: false
tableOfContents: false
pageActions: false
crumbs: false
props:
  cta_banner_primary_cta:
    label: Start contributing
    href: /community/contributor-guide/
  cta_banner_secondary_cta:
    label: Join Discord
    href: https://aka.ms/aspire/discord
---

<div class="thanks-hero not-content">

<div class="thanks-hero-glow" aria-hidden="true"></div>

<div class="thanks-hero-noise" aria-hidden="true"></div>

<svg
    class="thanks-heart-bg"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
</svg>

<p class="thanks-eyebrow">Thank you, open source</p>

<div class="thanks-title" role="heading" aria-level="2">

<div>Standing on the</div>

<div>

shoulders of <span class="thanks-highlight">giants</span>

</div>

</div>

<div class="thanks-subtitle">

Aspire wouldn't exist without the incredible open-source projects and
communities that power the distributed apps ecosystem. This page is our
thank-you to every contributor, maintainer, and community member behind the
tools we depend on.

</div>

<div class="thanks-divider" aria-hidden="true"></div>

<p class="thanks-heartfelt">We 💜 open source</p>

</div>

## Observability & resilience

The eyes, ears, and safety nets of distributed systems.

<div class="thanks-grid not-content">
<div class="thanks-card" style="--card-accent: var(--sl-color-orange);">
<div class="thanks-card-header">

{% image "/assets/images/icons/opentelemetry-icon.svg", alt: "OpenTelemetry logo", width: 32, height: 32, zoomable: false %}

<strong>OpenTelemetry</strong>

{% license_badge title: "Apache-2.0: https://github.com/open-telemetry/opentelemetry-specification/blob/main/LICENSE" %}

</div>

<p>

The vendor-neutral observability standard that gives Aspire its
distributed traces, metrics, and logs.

</p>

<div class="thanks-card-links">
<a href="https://opentelemetry.io" class="thanks-link-project">

opentelemetry.io 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a href="/fundamentals/telemetry/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-orange);">
<div class="thanks-card-header">

{% image "/assets/images/icons/polly-icon.png", alt: "Polly logo", width: 32, height: 32, zoomable: false %}

<strong>Polly</strong>

{% license_badge title: "BSD-3-Clause: https://github.com/App-vNext/Polly/blob/main/LICENSE" %}

</div>

<p>

The resilience and transient-fault-handling library behind Aspire's
default retry and circuit-breaker policies.

</p>

<div class="thanks-card-links">
<a href="https://github.com/App-vNext/Polly" class="thanks-link-project">

github.com 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>
</div>

## Databases & storage

The data engines Aspire integrates with out of the box.

<div class="thanks-grid not-content">
<div class="thanks-card" style="--card-accent: var(--sl-color-blue);">

<div class="thanks-card-header">

{% image "/assets/images/icons/postgresql-icon.png", alt: "PostgreSQL logo", width: 32, height: 32, zoomable: false %}

<strong>PostgreSQL</strong>

{% license_badge title: "PostgreSQL License: https://www.postgresql.org/about/licence/" %}

</div>

<p>The world's most advanced open-source relational database.</p>

<div class="thanks-card-links">
<a href="https://www.postgresql.org" class="thanks-link-project">

postgresql.org 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a
        href="/integrations/databases/postgres/postgres-get-started/"
        class="thanks-link-docs"
      >

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>

</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-green);">

<div class="thanks-card-header">

{% image "/assets/images/icons/mongodb-icon.png", alt: "MongoDB logo", width: 32, height: 32, zoomable: false %}

<strong>MongoDB</strong>

{% license_badge title: "SSPL: https://github.com/mongodb/mongo/blob/master/LICENSE-Community.txt" %}

</div>

<p>The document database for modern application development.</p>

<div class="thanks-card-links">
<a href="https://www.mongodb.com" class="thanks-link-project">

mongodb.com 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a
        href="/integrations/databases/mongodb/mongodb-get-started/"
        class="thanks-link-docs"
      >

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>

</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-red);">
<div class="thanks-card-header">

{% image "/assets/images/icons/redis-icon.png", alt: "Redis logo", width: 32, height: 32, zoomable: false %}

<strong>Redis</strong>

{% license_badge title: "Source Available (RSAL): https://github.com/redis/redis/blob/unstable/LICENSE.txt" %}

</div>

<p>

The high-performance in-memory data store used for caching, messaging, and
more.

</p>

<div class="thanks-card-links">
<a href="https://redis.io" class="thanks-link-project">

redis.io {% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a
        href="/integrations/caching/redis/redis-get-started/"
        class="thanks-link-docs"
      >

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-blue);">

<div class="thanks-card-header">

{% image "/assets/images/icons/valkey-icon.png", alt: "Valkey logo", width: 32, height: 32, zoomable: false %}

<strong>Valkey</strong>

{% license_badge title: "BSD-3-Clause: https://github.com/valkey-io/valkey/blob/unstable/COPYING" %}

</div>

<p>The open-source, high-performance key/value store.</p>

<div class="thanks-card-links">
<a href="https://valkey.io" class="thanks-link-project">

valkey.io {% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a
        href="/integrations/caching/valkey/valkey-get-started/"
        class="thanks-link-docs"
      >

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>

</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-purple);">

<div class="thanks-card-header">

{% image "/assets/images/icons/garnet-icon.png", alt: "Garnet logo", width: 32, height: 32, zoomable: false %}

<strong>Garnet</strong>

{% license_badge title: "MIT: https://github.com/microsoft/garnet/blob/main/LICENSE" %}

</div>

<p>A high-performance cache-store from Microsoft Research.</p>

<div class="thanks-card-links">
<a href="https://github.com/microsoft/garnet" class="thanks-link-project">

github.com 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a
        href="/integrations/caching/garnet/garnet-get-started/"
        class="thanks-link-docs"
      >

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>

</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-blue);">

<div class="thanks-card-header">

{% image "/assets/images/icons/milvus-icon.png", alt: "Milvus logo", width: 32, height: 32, zoomable: false %}

<strong>Milvus</strong>

{% license_badge title: "Apache-2.0: https://github.com/milvus-io/milvus/blob/master/LICENSE" %}

</div>

<p>The open-source vector database for AI-powered similarity search.</p>

<div class="thanks-card-links">
<a href="https://milvus.io" class="thanks-link-project">

milvus.io {% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a
        href="/integrations/databases/milvus/milvus-get-started/"
        class="thanks-link-docs"
      >

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>

</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-red);">

<div class="thanks-card-header">

{% image "/assets/images/icons/qdrant-icon.svg", alt: "Qdrant logo", width: 32, height: 32, zoomable: false %}

<strong>Qdrant</strong>

{% license_badge title: "AGPL-3.0: https://github.com/qdrant/qdrant/blob/master/LICENSE" %}

</div>

<p>The vector search engine for next-generation AI applications.</p>

<div class="thanks-card-links">
<a href="https://qdrant.tech" class="thanks-link-project">

qdrant.tech 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a
        href="/integrations/databases/qdrant/qdrant-get-started/"
        class="thanks-link-docs"
      >

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>

</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-blue);">

<div class="thanks-card-header">

{% image "/assets/images/icons/sqlite-icon.png", alt: "SQLite logo", width: 32, height: 32, zoomable: false %}

<strong>SQLite</strong>

{% license_badge title: "Public Domain: https://www.sqlite.org/copyright.html" %}

</div>

<p>The most widely deployed database engine in the world.</p>

<div class="thanks-card-links">
<a
        href="/integrations/databases/sqlite/sqlite-host/"
        class="thanks-link-docs"
      >

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>

<a href="https://www.sqlite.org" class="thanks-link-project">

sqlite.org 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>

</div>
</div>

## Messaging & eventing

The plumbing that keeps distributed services talking to each other.

<div class="thanks-grid not-content">
<div class="thanks-card" style="--card-accent: var(--sl-color-orange);">

<div class="thanks-card-header">

{% image "/assets/images/icons/rabbitmq-icon.svg", alt: "RabbitMQ logo", width: 32, height: 32, zoomable: false %}

<strong>RabbitMQ</strong>

{% license_badge title: "MPL-2.0: https://github.com/rabbitmq/rabbitmq-server/blob/main/LICENSE-MPL-RabbitMQ" %}

</div>

<p>The most widely deployed open-source message broker.</p>

<div class="thanks-card-links">
<a href="https://www.rabbitmq.com" class="thanks-link-project">

rabbitmq.com 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a
        href="/integrations/messaging/rabbitmq/rabbitmq-get-started/"
        class="thanks-link-docs"
      >

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>

</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-green);">

<div class="thanks-card-header">

{% image "/assets/images/icons/nats-icon.png", alt: "NATS logo", width: 32, height: 32, zoomable: false %}

<strong>NATS</strong>

{% license_badge title: "Apache-2.0: https://github.com/nats-io/nats-server/blob/main/LICENSE" %}

</div>

<p>High-performance messaging for distributed apps and edge computing.</p>

<div class="thanks-card-links">
<a href="https://nats.io" class="thanks-link-project">

nats.io {% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a
        href="/integrations/messaging/nats/nats-get-started/"
        class="thanks-link-docs"
      >

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>

</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-blue);">
<div class="thanks-card-header">

{% image "/assets/images/icons/apache-kafka-icon.svg", alt: "Apache Kafka logo", width: 32, height: 32, zoomable: false %}

<strong>Apache Kafka</strong>

{% license_badge title: "Apache-2.0: https://github.com/apache/kafka/blob/trunk/LICENSE" %}

</div>

<p>

The distributed event streaming platform used by thousands of companies.

</p>

<div class="thanks-card-links">
<a href="https://kafka.apache.org" class="thanks-link-project">

kafka.apache.org 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a
        href="/integrations/messaging/apache-kafka/apache-kafka-get-started/"
        class="thanks-link-docs"
      >

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>
</div>
</div>

## Reverse proxy & networking

The traffic directors and protocol layers that connect services.

<div class="thanks-grid not-content">
<div class="thanks-card" style="--card-accent: var(--sl-color-blue);">
<div class="thanks-card-header">

{% image "/assets/images/icons/yarp-icon.svg", alt: "YARP logo", width: 32, height: 32, zoomable: false %}

<strong>YARP</strong>

{% license_badge title: "MIT: https://github.com/dotnet/yarp/blob/main/LICENSE.txt" %}

</div>

<p>

Yet Another Reverse Proxy — a highly customizable reverse proxy library
built on .NET.

</p>

<div class="thanks-card-links">
<a
        href="https://github.com/microsoft/reverse-proxy"
        class="thanks-link-project"
      >

github.com 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a href="/integrations/reverse-proxies/yarp/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-green);">

<div class="thanks-card-header">

{% image "/assets/images/icons/grpc-icon.svg", alt: "gRPC logo", width: 32, height: 32, zoomable: false %}

<strong>gRPC</strong>

{% license_badge title: "Apache-2.0: https://github.com/grpc/grpc/blob/master/LICENSE" %}

</div>

<p>The high-performance, open-source universal RPC framework.</p>

<div class="thanks-card-links">
<a href="https://grpc.io" class="thanks-link-project">

grpc.io {% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>

</div>
</div>

## Containers & orchestration

The engines that package, ship, and run distributed workloads.

<div class="thanks-grid not-content">
<div class="thanks-card" style="--card-accent: var(--sl-color-blue);">
<div class="thanks-card-header">

{% image "/assets/images/icons/docker.svg", alt: "Docker logo", width: 32, height: 32, zoomable: false %}

<strong>Docker</strong>

{% license_badge title: "Apache-2.0: https://github.com/docker/compose/blob/main/LICENSE" %}

</div>

<p>

The platform that popularized containers and makes local development with
Aspire seamless.

</p>

<div class="thanks-card-links">
<a href="https://www.docker.com" class="thanks-link-project">

docker.com 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a href="/integrations/compute/docker/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-purple);">
<div class="thanks-card-header">

{% image "/assets/images/icons/podman-icon.svg", alt: "Podman logo", width: 32, height: 32, zoomable: false %}

<strong>Podman</strong>

{% license_badge title: "Apache-2.0: https://github.com/containers/podman/blob/main/LICENSE" %}

</div>

<p>

The daemonless container engine for developing, managing, and running OCI
containers.

</p>

<div class="thanks-card-links">
<a href="https://podman.io" class="thanks-link-project">

podman.io {% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a
        href="/get-started/prerequisites/#install-an-oci-compliant-container-runtime"
        class="thanks-link-docs"
      >

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-blue);">
<div class="thanks-card-header">

{% image "/assets/images/icons/kubernetes.svg", alt: "Kubernetes logo", width: 32, height: 32, zoomable: false %}

<strong>Kubernetes</strong>

{% license_badge title: "Apache-2.0: https://github.com/kubernetes/kubernetes/blob/master/LICENSE" %}

</div>

<p>

The open-source system for automating deployment, scaling, and management
of containerized applications.

</p>

<div class="thanks-card-links">
<a href="https://kubernetes.io" class="thanks-link-project">

kubernetes.io 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a href="/integrations/compute/kubernetes/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>
</div>
</div>

## Email & developer services

Tools that simplify common dev-time workflows.

<div class="thanks-grid not-content">
<div class="thanks-card" style="--card-accent: var(--sl-color-green);">
<div class="thanks-card-header">

{% image dark: "/assets/images/icons/mailpit-icon.svg", light: "/assets/images/icons/mailpit-light-icon.svg", alt: "Mailpit logo", zoomable: false, width: 32, height: 32, class: "thanks-header-icon borderless" %}

<strong>Mailpit</strong>

{% license_badge title: "MIT: https://github.com/axllent/mailpit/blob/master/LICENSE" %}

</div>

<p>

An email and SMTP testing tool with a modern web UI, perfect for local
development.

</p>

<div class="thanks-card-links">
<a href="https://mailpit.axllent.org" class="thanks-link-project">

mailpit.axllent.org 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a href="/integrations/devtools/mailpit/mailpit-get-started/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>
</div>
</div>

## AI & machine learning

The open-source projects powering Aspire's AI integrations.

<div class="thanks-grid not-content">
<div class="thanks-card" style="--card-accent: var(--sl-color-purple);">
<div class="thanks-card-header">

{% image "/assets/images/icons/ollama-icon.png", alt: "Ollama logo", width: 32, height: 32, zoomable: false %}

<strong>Ollama</strong>

{% license_badge title: "MIT: https://github.com/ollama/ollama/blob/main/LICENSE" %}

</div>

<p>

Run large language models locally — the easiest way to bring AI into your
Aspire apps.

</p>

<div class="thanks-card-links">
<a href="https://ollama.com" class="thanks-link-project">

ollama.com 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a href="/integrations/ai/ollama/ollama-get-started/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>
</div>
</div>

## Multi-language ecosystem

Aspire speaks many languages — thanks to these communities.

<div class="thanks-grid not-content">
<div class="thanks-card" style="--card-accent: var(--sl-color-orange);">
<div class="thanks-card-header">

{% image "/assets/images/icons/bun-icon.png", alt: "Bun logo", width: 32, height: 32, zoomable: false %}

<strong>Bun</strong>

{% license_badge title: "MIT: https://github.com/oven-sh/bun/blob/main/LICENSE.md" %}

</div>

<p>

The all-in-one JavaScript runtime and toolkit built for speed. It also
installs dependencies and builds this site.

</p>

<div class="thanks-card-links">
<a href="/integrations/frameworks/bun-apps/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>

<a href="https://bun.sh" class="thanks-link-project">

bun.sh {% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-purple);">
<div class="thanks-card-header">

{% image "/assets/images/icons/csharp.svg", alt: "C# logo", width: 32, height: 32, zoomable: false %}

<strong>C#</strong>

{% license_badge title: "MIT: https://github.com/dotnet/roslyn/blob/main/License.txt" %}

</div>

<p>

The modern, type-safe language that makes Aspire's app model expressive
and powerful.

</p>

<div class="thanks-card-links">
<a
        href="https://learn.microsoft.com/dotnet/csharp/"
        class="thanks-link-project"
      >

learn.microsoft.com 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-blue);">
<div class="thanks-card-header">

{% image dark: "/assets/images/icons/deno-icon.png", light: "/assets/images/icons/deno-light-icon.png", alt: "Deno logo", zoomable: false, width: 32, height: 32, class: "thanks-header-icon borderless" %}

<strong>Deno</strong>

{% license_badge title: "MIT: https://github.com/denoland/deno/blob/main/LICENSE.md" %}

</div>

<p>

The secure runtime for JavaScript and TypeScript with built-in tooling and
web standards.

</p>

<div class="thanks-card-links">
<a href="/integrations/frameworks/deno/deno-get-started/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>

<a href="https://deno.com" class="thanks-link-project">

deno.com {% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-blue);">
<div class="thanks-card-header">

{% image dark: "/assets/images/icons/go-icon.png", light: "/assets/images/icons/go-light-icon.png", alt: "Go logo", zoomable: false, width: 32, height: 32, class: "thanks-header-icon borderless" %}

<strong>Go</strong>

{% license_badge title: "BSD-3-Clause: https://go.dev/copyright" %}

</div>

<p>

The simple, efficient language for building reliable distributed services
alongside Aspire.

</p>

<div class="thanks-card-links">
<a href="/integrations/frameworks/go/go-get-started/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>

<a href="https://go.dev" class="thanks-link-project">

go.dev {% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-red);">
<div class="thanks-card-header">

{% image "/assets/images/icons/java-icon.png", alt: "Java logo", width: 32, height: 32, zoomable: false %}

<strong>Java</strong>

{% license_badge title: "GPL-2.0 WITH Classpath-exception-2.0: https://openjdk.org/legal/gplv2+ce.html" %}

</div>

<p>

The enterprise workhorse that Aspire can orchestrate as part of multi-language
architectures.

</p>

<div class="thanks-card-links">
<a href="/integrations/frameworks/java/java-get-started/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>

<a href="https://www.java.com" class="thanks-link-project">

java.com {% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-purple);">
<div class="thanks-card-header">

{% image "/assets/images/icons/maui-icon.png", alt: ".NET MAUI logo", width: 32, height: 32, zoomable: false %}

<strong>.NET MAUI</strong>

{% license_badge title: "MIT: https://github.com/dotnet/maui/blob/main/LICENSE.txt" %}

</div>

<p>

The cross-platform framework for creating native mobile and desktop apps
with .NET.

</p>

<div class="thanks-card-links">
<a href="/integrations/dotnet/maui/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>

<a
        href="https://dotnet.microsoft.com/apps/maui"
        class="thanks-link-project"
      >

dotnet.microsoft.com 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-green);">
<div class="thanks-card-header">

{% image dark: "/assets/images/icons/nodejs-icon.png", light: "/assets/images/icons/nodejs-light-icon.png", alt: "Node.js logo", zoomable: false, width: 32, height: 32, class: "thanks-header-icon borderless" %}

<strong>Node.js</strong>

{% license_badge title: "MIT: https://github.com/nodejs/node/blob/main/LICENSE" %}

</div>

<p>

The JavaScript runtime that enables Aspire to orchestrate frontend and
full-stack JS apps.

</p>

<div class="thanks-card-links">
<a href="https://nodejs.org" class="thanks-link-project">

nodejs.org 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a href="/integrations/frameworks/javascript/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-orange);">
<div class="thanks-card-header">

{% image "/assets/images/icons/microsoft-orleans.png", alt: "Orleans logo", width: 32, height: 32, zoomable: false %}

<strong>Orleans</strong>

{% license_badge title: "MIT: https://github.com/dotnet/orleans/blob/main/LICENSE" %}

</div>

<p>

The virtual actor framework for building distributed, high-scale
applications in .NET.

</p>

<div class="thanks-card-links">
<a href="/integrations/frameworks/orleans/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>

<a
        href="https://learn.microsoft.com/dotnet/orleans/"
        class="thanks-link-project"
      >

learn.microsoft.com 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-blue);">
<div class="thanks-card-header">

{% image "/assets/images/icons/powershell-icon.png", alt: "PowerShell logo", width: 32, height: 32, zoomable: false %}

<strong>PowerShell</strong>

{% license_badge title: "MIT: https://github.com/PowerShell/PowerShell/blob/master/LICENSE.txt" %}

</div>

<p>

The cross-platform task automation and configuration management framework.

</p>

<div class="thanks-card-links">
<a href="/integrations/frameworks/powershell/powershell-get-started/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>

<a
        href="https://github.com/PowerShell/PowerShell"
        class="thanks-link-project"
      >

github.com 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-blue);">
<div class="thanks-card-header">

{% image "/assets/images/icons/python.svg", alt: "Python logo", width: 32, height: 32, zoomable: false %}

<strong>Python</strong>

{% license_badge title: "PSF-2.0: https://docs.python.org/3/license.html" %}

</div>

<p>

The versatile language powering data science, AI, and web services in the
Aspire ecosystem.

</p>

<div class="thanks-card-links">
<a href="/integrations/frameworks/python/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>

<a href="https://www.python.org" class="thanks-link-project">

python.org 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-orange);">
<div class="thanks-card-header">

{% image "/assets/images/icons/rust-icon.png", alt: "Rust logo", width: 32, height: 32, zoomable: false %}

<strong>Rust</strong>

{% license_badge title: "MIT OR Apache-2.0: https://www.rust-lang.org/policies/licenses" %}

</div>

<p>

The systems programming language bringing safety and speed to distributed
apps.

</p>

<div class="thanks-card-links">
<a href="/integrations/frameworks/rust/rust-get-started/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>

<a href="https://www.rust-lang.org" class="thanks-link-project">

rust-lang.org 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-blue);">
<div class="thanks-card-header">

{% image "/assets/images/icons/typescript.svg", alt: "TypeScript logo", width: 32, height: 32, zoomable: false %}

<strong>TypeScript</strong>

{% license_badge title: "Apache-2.0: https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt" %}

</div>

<p>

The typed superset of JavaScript that powers Aspire's TypeScript AppHost
and frontend tooling.

</p>

<div class="thanks-card-links">
<a href="https://www.typescriptlang.org" class="thanks-link-project">

typescriptlang.org 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>
</div>

## Testing frameworks

The tools that help keep Aspire apps reliable.

<div class="thanks-grid not-content">
<div class="thanks-card" style="--card-accent: var(--sl-color-purple);">
<div class="thanks-card-header">

{% image "/assets/images/icons/xunit-icon.svg", alt: "xUnit.net logo", width: 32, height: 32, zoomable: false %}

<strong>xUnit.net</strong>

{% license_badge title: "Apache-2.0: https://github.com/xunit/xunit/blob/main/LICENSE" %}

</div>

<p>

The community-focused unit testing tool for .NET — the backbone of
Aspire's test story.

</p>

<div class="thanks-card-links">
<a
        href="/testing/write-your-first-test/?testing-framework=xunit"
        class="thanks-link-docs"
      >

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>

<a href="https://xunit.net" class="thanks-link-project">

xunit.net {% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-green);">

<div class="thanks-card-header">

{% image "/assets/images/icons/nunit-icon.svg", alt: "NUnit logo", width: 32, height: 32, zoomable: false %}

<strong>NUnit</strong>

{% license_badge title: "MIT: https://github.com/nunit/nunit/blob/master/LICENSE.txt" %}

</div>

<p>The widely-used unit testing framework for all .NET languages.</p>

<div class="thanks-card-links">
<a
        href="/testing/write-your-first-test/?testing-framework=nunit"
        class="thanks-link-docs"
      >

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>

<a href="https://nunit.org" class="thanks-link-project">

nunit.org {% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>

</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-green);">
<div class="thanks-card-header">

{% image "/assets/images/icons/playwright-icon.svg", alt: "Playwright logo", width: 32, height: 32, zoomable: false %}

<strong>Playwright</strong>

{% license_badge title: "Apache-2.0: https://github.com/microsoft/playwright/blob/main/LICENSE" %}

</div>

<p>

The end-to-end testing framework for modern web apps — reliable
cross-browser automation.

</p>

<div class="thanks-card-links">
<a href="https://playwright.dev" class="thanks-link-project">

playwright.dev 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>
</div>

## Localization

The tools that help us speak every language.

<div class="thanks-grid not-content">
<div class="thanks-card" style="--card-accent: var(--sl-color-orange);">
<div class="thanks-card-header">

{% image "/assets/images/icons/lunaria-icon.svg", alt: "Lunaria logo", width: 32, height: 32, zoomable: false %}

<strong>Lunaria</strong>

{% license_badge title: "MIT: https://github.com/lunariajs/lunaria/blob/main/LICENSE" %}

</div>

<p>

The localization management tool that tracks translation status for Astro
and Starlight sites.

</p>

<div class="thanks-card-links">
<a href="https://lunaria.dev" class="thanks-link-project">

lunaria.dev 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a
        href="/community/translation-guide/#-about-translations"
        class="thanks-link-docs"
      >

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>
</div>
</div>

## Web stack & documentation

The tools that power this very website.

<div class="thanks-grid not-content">
<div class="thanks-card" style="--card-accent: var(--sl-color-purple);">
<div class="thanks-card-header">

{% image dark: "/assets/images/icons/astro-icon.svg", light: "/assets/images/icons/astro-icon-light.svg", alt: "Astro logo", zoomable: false, width: 32, height: 32, class: "thanks-header-icon borderless" %}

<strong>Astro</strong>

{% license_badge title: "MIT: https://github.com/withastro/astro/blob/main/LICENSE" %}

</div>

<p>

The web framework for content-driven websites — the engine behind
aspire.dev.

</p>

<div class="thanks-card-links">
<a href="https://astro.build" class="thanks-link-project">

astro.build 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-orange);">
<div class="thanks-card-header">

{% image "/assets/images/icons/starlight-icon.webp", alt: "Starlight logo", width: 32, height: 32, zoomable: false %}

<strong>Starlight</strong>

{% license_badge title: "MIT: https://github.com/withastro/starlight/blob/main/LICENSE" %}

</div>

<p>

The beautiful documentation theme for Astro that makes aspire.dev shine.

</p>

<div class="thanks-card-links">
<a href="https://starlight.astro.build" class="thanks-link-project">

starlight.astro.build 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-blue);">
<div class="thanks-card-header">

{% image "/assets/images/icons/expressivecode-icon.svg", alt: "Expressive Code logo", width: 32, height: 32, zoomable: false %}

<strong>Expressive Code</strong>

{% license_badge title: "MIT: https://github.com/expressive-code/expressive-code/blob/main/LICENSE" %}

</div>

<p>

The code block engine that makes our documentation examples beautiful and
interactive.

</p>

<div class="thanks-card-links">
<a href="https://expressive-code.com" class="thanks-link-project">

expressive-code.com 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-red);">
<div class="thanks-card-header">

{% image "/assets/images/icons/mermaid-icon.svg", alt: "Mermaid logo", width: 32, height: 32, zoomable: false %}

<strong>Mermaid</strong>

{% license_badge title: "MIT: https://github.com/mermaid-js/mermaid/blob/develop/LICENSE" %}

</div>

<p>

The JavaScript-based diagramming and charting tool that renders our
architecture diagrams.

</p>

<div class="thanks-card-links">
<a href="https://mermaid.js.org" class="thanks-link-project">

mermaid.js.org 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-green);">
<div class="thanks-card-header">

{% image "/assets/images/icons/sharp-icon.svg", alt: "sharp logo", width: 32, height: 32, zoomable: false %}

<strong>sharp</strong>

{% license_badge title: "Apache-2.0: https://github.com/lovell/sharp/blob/main/LICENSE" %}

</div>

<p>

The high-performance image processing library that optimizes every image
on this site.

</p>

<div class="thanks-card-links">
<a href="https://sharp.pixelplumbing.com" class="thanks-link-project">

sharp.pixelplumbing.com 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>
</div>

## UI & design

The design systems that make Aspire look and feel polished.

<div class="thanks-grid not-content">
<div class="thanks-card" style="--card-accent: var(--sl-color-blue);">
<div class="thanks-card-header">

{% image dark: "/assets/images/icons/fluentui-icon.svg", light: "/assets/images/icons/fluentui-icon-light.svg", alt: "Fluent UI logo", zoomable: false, width: 32, height: 32, class: "thanks-header-icon borderless" %}

<strong>Fluent UI</strong>

{% license_badge title: "MIT: https://github.com/microsoft/fluentui/blob/master/LICENSE" %}

</div>

<p>

Microsoft's design system that powers the Aspire dashboard's components
and visual language.

</p>

<div class="thanks-card-links">
<a href="https://fluent2.microsoft.design" class="thanks-link-project">

fluent2.microsoft.design 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a href="/dashboard/explore/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-purple);">
<div class="thanks-card-header">

{% image "/assets/images/icons/spectreconsole-icon.png", alt: "Spectre.Console logo", width: 32, height: 32, zoomable: false %}

<strong>Spectre.Console</strong>

{% license_badge title: "MIT: https://github.com/spectreconsole/spectre.console/blob/main/LICENSE.md" %}

</div>

<p>

The beautiful console library that powers the Aspire CLI's rich terminal
experience.

</p>

<div class="thanks-card-links">
<a href="https://spectreconsole.net" class="thanks-link-project">

spectreconsole.net 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a href="/reference/cli/overview/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>
</div>
</div>

## Runtime & framework

The bedrock of everything Aspire does — from the SDK and runtime to the Blazor-powered dashboard.

<div class="thanks-grid not-content">
<div class="thanks-card" style="--card-accent: var(--sl-color-purple);">
<div class="thanks-card-header">

{% image "/assets/images/icons/dotnet.svg", alt: ".NET logo", width: 32, height: 32, zoomable: false %}

<strong>.NET</strong>

{% license_badge title: "MIT: https://github.com/dotnet/runtime/blob/main/LICENSE.TXT" %}

</div>

<p>

The free, open-source, cross-platform framework that is the foundation of
Aspire.

</p>

<div class="thanks-card-links">
<a href="https://dotnet.microsoft.com" class="thanks-link-project">

dotnet.microsoft.com 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-purple);">
<div class="thanks-card-header">

{% image "/assets/images/icons/blazor-icon.svg", alt: "Blazor logo", width: 32, height: 32, zoomable: false %}

<strong>Blazor</strong>

{% license_badge title: "MIT: https://github.com/dotnet/aspnetcore/blob/main/LICENSE.txt" %}

</div>

<p>

Powers the Aspire dashboard — a rich, interactive UI built entirely in
.NET.

</p>

<div class="thanks-card-links">
<a
        href="https://dotnet.microsoft.com/apps/aspnet/web-apps/blazor"
        class="thanks-link-project"
      >

dotnet.microsoft.com 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a href="/dashboard/overview/" class="thanks-link-docs">

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-blue);">
<div class="thanks-card-header">

{% image dark: "/assets/images/icons/dapr-icon.png", light: "/assets/images/icons/dapr-light-icon.png", alt: "Dapr logo", zoomable: false, width: 32, height: 32, class: "thanks-header-icon borderless" %}

<strong>Dapr</strong>

{% license_badge title: "Apache-2.0: https://github.com/dapr/dapr/blob/master/LICENSE" %}

</div>

<p>

The Distributed Application Runtime — portable, event-driven building
blocks for microservices.

</p>

<div class="thanks-card-links">
<a href="https://dapr.io" class="thanks-link-project">

dapr.io {% icon "external", size: "small", class: "thanks-link-icon" %}

</a>

<a
        href="/integrations/frameworks/dapr/dapr-get-started/"
        class="thanks-link-docs"
      >

<span class="thanks-book-icon" aria-hidden="true"></span> Docs

</a>
</div>
</div>
</div>

## Developer experience & CLI

The tools that make the Aspire developer experience smooth.

<div class="thanks-grid not-content">
<div class="thanks-card" style="--card-accent: var(--color-cyan);">
<div class="thanks-card-header">

{% image "/assets/images/icons/hex1b-icon.svg", alt: "hex1b logo", width: 32, height: 32, zoomable: false %}

<strong>hex1b</strong>

{% license_badge title: "MIT: https://hex1b.dev" %}

</div>

<p>

The CLI automation tool for terminal applications — used to test and
validate Aspire's CLI experiences.

</p>

<div class="thanks-card-links">
<a href="https://hex1b.dev/" class="thanks-link-project">

hex1b.dev {% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>

<div class="thanks-card" style="--card-accent: var(--sl-color-purple);">
<div class="thanks-card-header">

{% image "/assets/images/icons/asciinema-icon.svg", alt: "asciinema logo", width: 32, height: 32, zoomable: false %}

<strong>asciinema</strong>

{% license_badge title: "GPL-3.0: https://github.com/asciinema/asciinema/blob/develop/LICENSE" %}

</div>

<p>

The terminal session recorder that powers the animated CLI demos on
aspire.dev.

</p>

<div class="thanks-card-links">
<a href="https://asciinema.org/" class="thanks-link-project">

asciinema.org 

{% icon "external", size: "small", class: "thanks-link-icon" %}

</a>
</div>
</div>
</div>

## And everyone else

This page can't capture every dependency, every pull request, or every community conversation that
shaped Aspire into what it is today. To every contributor who filed an issue, opened a PR, answered
a question on Discord, or shipped a NuGet package that Aspire depends on — **thank you**.

{% cta_banner title: "Want to join them?", description: "Aspire is open source and welcoming new contributors. Whether it's code, docs, or community support — there's a place for you.", primary_cta: props.cta_banner_primary_cta, secondary_cta: props.cta_banner_secondary_cta %}

<style>

  /* ── Hero section ── */
  .thanks-hero {
    position: relative;
    text-align: center;
    padding: 4rem 2rem 2.5rem;
    margin-bottom: 2rem;
    overflow: hidden;
    border-radius: 0.75rem;
    border: 1px solid color-mix(in srgb, var(--color-magenta) 15%, transparent);
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--color-magenta) 6%, transparent),
        color-mix(in srgb, var(--aspire-color-primary, #7455dd) 4%, transparent),
        transparent 70%
      );
  }

  .thanks-hero-glow {
    position: absolute;
    top: -40%;
    left: 50%;
    transform: translateX(-50%);
    width: 70%;
    height: 180%;
    background: radial-gradient(
      ellipse at center,
      color-mix(in srgb, var(--color-magenta) 6%, transparent),
      transparent 70%
    );
    pointer-events: none;
    animation: hero-glow-breathe 8s ease-in-out infinite;
  }

  .thanks-hero-noise {
    position: absolute;
    inset: 0;
    opacity: 0.03;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    pointer-events: none;
  }

  .thanks-heart-bg {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -55%);
    width: 280px;
    height: 280px;
    color: var(--color-magenta);
    opacity: 0.04;
    pointer-events: none;
    z-index: 0;
    animation: heart-breathe 6s ease-in-out infinite;
  }

  .thanks-eyebrow {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    text-transform: uppercase;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    color: var(--color-magenta);
    margin: 0 0 1.25rem;
    padding: 0.35rem 1rem;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--color-magenta) 20%, transparent);
    background: color-mix(in srgb, var(--color-magenta) 6%, transparent);
  }

  .thanks-title {
    position: relative;
    z-index: 1;
    font-size: clamp(2.25rem, 6vw, 3.5rem);
    font-weight: 800;
    line-height: 1.1;
    margin: 0 0 1.25rem;
    letter-spacing: -0.02em;
  }

  .thanks-title > div {
    display: block;
    font-size: inherit;
    font-weight: inherit;
    line-height: inherit;
  }

  .thanks-title p,
  .thanks-subtitle p {
    margin: 0;
    font-size: inherit;
    font-weight: inherit;
    line-height: inherit;
    color: inherit;
  }

  .thanks-highlight {
    background: linear-gradient(
      90deg,
      var(--color-magenta),
      var(--aspire-color-primary, #7455dd),
      var(--color-magenta)
    );
    background-size: 200% 100%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: shimmer-text 6s ease-in-out infinite;
  }

  .thanks-subtitle {
    position: relative;
    z-index: 1;
    max-width: 54rem;
    margin: 0 auto 2rem;
    font-size: 1.05rem;
    line-height: 1.75;
    color: var(--sl-color-gray-3);
    text-wrap: balance;
  }

  .thanks-divider {
    position: relative;
    z-index: 1;
    width: 6rem;
    height: 3px;
    margin: 0 auto;
    border-radius: 2px;
    background: linear-gradient(
      90deg,
      transparent,
      var(--color-magenta),
      var(--aspire-color-primary, #7455dd),
      transparent
    );
    opacity: 0.6;
  }

  .thanks-heartfelt {
    position: relative;
    z-index: 1;
    margin: 1.5rem 0 0;
    font-size: 1.15rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: var(--sl-color-gray-3);
  }

  @keyframes hero-glow-breathe {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @keyframes heart-breathe {
    0%, 100% { opacity: 0.04; transform: translate(-50%, -55%) scale(1); }
    50% { opacity: 0.06; transform: translate(-50%, -55%) scale(1.05); }
  }

  @keyframes shimmer-text {
    0% { background-position: 100% 50%; }
    50% { background-position: 0% 50%; }
    100% { background-position: 100% 50%; }
  }

  /* ── Card grid ── */
  .thanks-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  /* ── Individual cards — vertical layout ── */
  .thanks-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.25rem;
    border-radius: 0.75rem;
    border: 1px solid var(--sl-color-gray-5);
    background: var(--sl-color-gray-7, var(--sl-color-gray-6));
    transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease;
  }

  .thanks-card:hover {
    border-color: var(--card-accent, var(--sl-color-purple));
    box-shadow: 0 0 0 1px var(--card-accent, var(--sl-color-purple)),
                0 4px 16px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }

  /* ── Card header: icon + title inline ── */
  .thanks-card-header {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding-right: 2rem;
    color: var(--sl-color-text);
  }

  .thanks-card-header img,
  .thanks-card-header .thanks-header-icon {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    object-fit: contain;
    border: none;
    box-shadow: none;
    margin: 0;
    border-radius: 0.25rem;
  }

  .thanks-card-header strong {
    font-size: 1rem;
    color: var(--sl-color-white);
  }

  /* ── Card description ── */
  .thanks-card > p {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--sl-color-gray-2);
    flex: 1;
  }

  /* ── Card footer links ── */
  .thanks-card-links {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.25rem;
    justify-content: space-between;
  }

  .thanks-link-project {
    display: inline-flex;
    align-items: center;
    gap: 0.25em;
    font-size: 0.75rem;
    color: var(--sl-color-gray-3);
    text-decoration: none;
    transition: color 0.15s ease;
    white-space: nowrap;
  }

  .thanks-link-project:hover {
    color: var(--sl-color-white);
    text-decoration: none;
  }

  .thanks-link-icon {
    vertical-align: middle;
    position: relative;
    top: -0.0625em;
  }

  .thanks-arrow {
    font-size: 0.625rem;
    opacity: 0.6;
  }

  .thanks-link-docs {
    order: -1;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--card-accent, var(--sl-color-purple));
    text-decoration: none;
    padding: 0.2rem 0.5rem;
    border-radius: 0.375rem;
    border: 1px solid color-mix(in srgb, var(--card-accent, var(--sl-color-purple)) 30%, transparent);
    background: color-mix(in srgb, var(--card-accent, var(--sl-color-purple)) 8%, transparent);
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .thanks-link-docs:hover {
    background: color-mix(in srgb, var(--card-accent, var(--sl-color-purple)) 18%, transparent);
    border-color: color-mix(in srgb, var(--card-accent, var(--sl-color-purple)) 50%, transparent);
    text-decoration: none;
  }

  :global([data-theme='light']) .thanks-link-docs {
    color: color-mix(in srgb, var(--card-accent, var(--sl-color-purple)) 58%, black);
    border-color: color-mix(in srgb, var(--card-accent, var(--sl-color-purple)) 25%, transparent);
    background: color-mix(in srgb, var(--card-accent, var(--sl-color-purple)) 6%, transparent);
  }

  :root[data-theme='light'] .thanks-link-docs {
    color: color-mix(in srgb, var(--card-accent, var(--sl-color-purple)) 58%, black);
    border-color: color-mix(in srgb, var(--card-accent, var(--sl-color-purple)) 25%, transparent);
    background: color-mix(in srgb, var(--card-accent, var(--sl-color-purple)) 6%, transparent);
  }

  /* Open-book icon via CSS */
  .thanks-book-icon {
    display: inline-block;
    width: 12px;
    height: 12px;
    vertical-align: middle;
    position: relative;
    top: -0.0625em;
    background: currentColor;
    -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z'/%3E%3Cpath d='M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'/%3E%3C/svg%3E");
    -webkit-mask-size: contain;
    -webkit-mask-repeat: no-repeat;
    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z'/%3E%3Cpath d='M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'/%3E%3C/svg%3E");
    mask-size: contain;
    mask-repeat: no-repeat;
  }

  /* Remove external-link icon from card links */
  .thanks-link-project.external-link::after,
  .thanks-link-project[href^="http"]::after,
  .thanks-card-links a.external-link::after,
  .thanks-card-links a[href^="http"]::after {
    display: none !important;
    content: none !important;
  }

  /* Ensure ThemeImage icons inside card headers are properly constrained */
  .thanks-card-header :global(img.theme-image) {
    width: 32px !important;
    height: 32px !important;
    flex-shrink: 0;
    object-fit: contain;
    border: none !important;
    box-shadow: none !important;
    margin: 0 !important;
    border-radius: 0.25rem;
  }

  @media (max-width: 49.999rem), (pointer: coarse) {
    .thanks-card-header {
      padding-right: 3rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .thanks-hero-glow,
    .thanks-heart-bg,
    .thanks-highlight {
      animation: none;
    }

    .thanks-card {
      transition: none;
    }

    .thanks-card:hover {
      transform: none;
    }
  }

  @media (max-width: 480px) {
    .thanks-hero {
      padding: 2.5rem 1rem 1.5rem;
    }

    .thanks-heart-bg {
      width: 180px;
      height: 180px;
    }

    .thanks-grid {
      grid-template-columns: 1fr;
    }
  }

</style>
