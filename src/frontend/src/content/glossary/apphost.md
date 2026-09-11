---
title: AppHost
termType: Concept
pronunciation: app host
description: The executable application model that declares your services, resources, connections, and local orchestration.
aliases: [orchestration project]
topics: [foundations]
context: Model a frontend, an API, and a PostgreSQL database together, then give the API a database reference and an explicit readiness dependency.
related: [ats, resource, distributed-application, withreference, waitfor]
resources:
  - title: Define your application with an AppHost
    href: /get-started/app-host/
legacyAnchors: [apphost]
legacyGroup: core-concepts
---
You can write an AppHost in C# or any guest language supported through the [Aspire Type System (ATS)](/dev/glossary/ats/). It declares your resources and how they connect, orchestrates local development, and supplies an application model to deployment integrations.

Guest languages use generated SDKs to access exported hosting APIs. The available AppHost languages and APIs depend on your Aspire version and integrations.

The AppHost runs alongside your services; it is not the server that handles users' requests. Configure an explicit readiness dependency when one resource must wait for another to become healthy.
