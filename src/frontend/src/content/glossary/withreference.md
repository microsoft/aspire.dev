---
title: WithReference
termType: API method
description: Supplies a consuming resource with connection strings or service endpoint configuration from another resource.
aliases: [withReference, resource reference]
topics: [foundations, reference]
context: Give an API a reference to a named PostgreSQL database to supply its connection string. Add WaitFor separately if startup must wait for readiness.
related: [waitfor, connection-string, service-discovery]
resources:
  - title: Connect your services with service discovery
    href: /fundamentals/service-discovery/
  - title: PostgreSQL hosting integration
    href: /integrations/databases/postgres/postgres-host/
legacyAnchors: [withreference]
legacyGroup: apis-and-patterns
---
`WithReference` in C# and `withReference` in TypeScript connect the configuration of resources. The information supplied depends on the referenced resource: a database can provide a connection string, while a service can provide named endpoints for service discovery.

A database reference typically becomes `ConnectionStrings__<name>` in the consuming process's environment. Service endpoint references supply service discovery configuration instead; a single reference does not necessarily provide both forms.

A reference does **not** guarantee startup order or readiness. Use an explicit wait when required, and configure the consuming application's client or service discovery support to read the supplied configuration.
