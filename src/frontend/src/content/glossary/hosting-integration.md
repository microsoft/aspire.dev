---
title: Hosting integration
description: An Aspire integration that adds and configures resources in the AppHost application model.
aliases: [hosting package]
topics: [integrations]
context: Use the PostgreSQL hosting integration to model a database server, add a database, and expose connection information to consumers.
related: [client-integration, integration-relationship, resource]
resources:
  - title: Add PostgreSQL to your AppHost
    href: /integrations/databases/postgres/postgres-host/
legacyAnchors: [hosting-integration]
legacyGroup: resource-types
---
Hosting integrations configure the infrastructure side of an application: resources, networking, health checks, volumes, and connection information. The exact capabilities vary by integration.

For example, `Aspire.Hosting.PostgreSQL` supplies `AddPostgres` in a C# AppHost and `addPostgres` in a TypeScript AppHost. It models a PostgreSQL server; you can add named databases and reference them from services.

A hosting integration does not install or configure the database client inside your application. That is the role of application code or a client integration.
