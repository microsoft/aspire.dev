---
title: Distributed application
description: An application whose parts communicate across process or network boundaries, rather than running as a single unit.
aliases: [distributed app]
topics: [foundations]
context: A storefront calls a product API, which reads a database and writes messages to a queue. Aspire models these parts together.
related: [apphost, resource, service-discovery]
resources:
  - title: Learn how Aspire fits your application
    href: /get-started/what-is-aspire/
legacyAnchors: [distributed-application]
legacyGroup: core-concepts
---
A distributed application can include a frontend, several APIs, databases, caches, and message queues. Its parts have independent lifecycles and can fail or become available at different times.

Aspire helps you describe, run, observe, and prepare these parts for deployment as one application. It does not remove the need to handle network failures, retries, authentication, or data consistency in your services.
