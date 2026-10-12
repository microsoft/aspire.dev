---
title: Endpoint
description: A named network access point on a resource, describing how clients can reach it through a scheme, host, and port.
aliases: [named endpoint]
topics: [foundations]
context: Give an API an HTTP endpoint, then reference it from a frontend so the frontend can discover its address without hard-coding a port.
related: [resource, service-discovery, connection-string, withreference]
resources:
  - title: Understand Aspire endpoints and networking
    href: /fundamentals/networking-overview/
  - title: Use named endpoints in service discovery
    href: /fundamentals/service-discovery/#named-endpoints
legacyAnchors: []
---
An endpoint describes network access to a resource. A resource can expose multiple named endpoints, such as HTTP and HTTPS, with addresses resolved as Aspire prepares the application.

During local development, a **proxied endpoint** routes traffic through an Aspire-managed proxy. A **proxyless endpoint** connects directly to the resource. The client-facing port and the port the resource listens on can differ.

An endpoint is not a connection string or an API route. It describes network access; a connection string can also carry database names and credentials, while a route identifies an operation within a service.
