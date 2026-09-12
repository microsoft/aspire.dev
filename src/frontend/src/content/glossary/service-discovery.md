---
title: Service discovery
description: Resolves logical service names to configured endpoints so clients do not need hard-coded network addresses.
aliases: [service resolution]
topics: [foundations]
context: A frontend calls an API by its logical name while the AppHost supplies the API's actual endpoint configuration.
related: [withreference, environment-variable, service-defaults]
resources:
  - title: Connect your services with service discovery
    href: /fundamentals/service-discovery/
legacyAnchors: [service-discovery]
legacyGroup: key-terms
---
Service discovery separates a service's logical name from its current address. For example, a client configured for Aspire service discovery can resolve a request to `http://apiservice` using endpoints supplied by the AppHost.

The AppHost supplies endpoint configuration through resource references. The consuming application must use service discovery support or read and apply the endpoint configuration itself. A reference does not install a client library or configure arbitrary DNS on the host.

.NET service defaults configure service discovery for participating applications. Other runtimes can use their own configuration and discovery mechanisms.
