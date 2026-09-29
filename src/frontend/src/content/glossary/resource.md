---
title: Resource
termType: Concept
description: A building block in the Aspire application model, such as a service, container, executable, cloud resource, or parameter.
aliases: [application resource]
topics: [foundations]
context: An API, its PostgreSQL database, and the password parameter used by that database are three different resources in one AppHost.
related: [apphost, hosting-integration, dag]
resources:
  - title: Understand the resources in your app model
    href: /architecture/resource-model/
legacyAnchors: [resource]
legacyGroup: core-concepts
---
Resources describe the parts of your application and the values those parts need. Not every resource is a running process: parameters and logical databases are resources too.

- **Projects** describe application projects, including .NET services and APIs.
- **Containers** run packaged workloads such as databases, caches, and message brokers.
- **Executables** run programs and scripts, including JavaScript, Python, and other runtimes.
- **Cloud resources** describe services such as managed databases and storage.
- **Parameters** represent configuration values, including secrets.

Hosting integrations add specialized resource types and configuration methods to the AppHost.
