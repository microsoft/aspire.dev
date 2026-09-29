---
title: Client integration
description: An integration used inside an application to configure a service client, often with dependency injection, health checks, and telemetry.
aliases: [client package]
topics: [integrations]
context: A .NET API uses Aspire.Npgsql to register an Npgsql data source using the connection string supplied for its database.
related: [hosting-integration, integration-relationship, connection-string]
resources:
  - title: Connect your app to PostgreSQL
    href: /integrations/databases/postgres/postgres-connect/
legacyAnchors: [client-integration]
legacyGroup: resource-types
---
Client integrations operate inside your service, not the AppHost. They configure SDK clients using application configuration and commonly add dependency injection registration, health checks, and OpenTelemetry support.

For PostgreSQL, the .NET `Aspire.Npgsql` integration uses `AddNpgsqlDataSource` to register an `NpgsqlDataSource` and make `NpgsqlConnection` available through dependency injection.

The connection name must match the supplied connection string. Applications in other runtimes can use their normal client libraries with the same AppHost-provided connection information.
