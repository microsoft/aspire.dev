---
title: Hosting and client relationship
description: The division between modeling a dependency in the AppHost and connecting to that dependency inside an application.
aliases: [The relationship, integration relationship]
topics: [integrations]
context: The AppHost provisions connection information for a named database; the API uses its database client to open the connection.
related: [hosting-integration, client-integration, withreference]
resources:
  - title: Choose hosting and client integrations
    href: /integrations/overview/
legacyAnchors: [the-relationship]
legacyGroup: resource-types
---
A hosting integration and a client integration serve different layers of the same application:

1. The AppHost uses a hosting integration to model the service, such as a PostgreSQL server and database.
2. A resource reference passes the database's connection information to the consuming API.
3. The API uses a client integration or its usual database library to read that configuration and connect.

For .NET, `Aspire.Hosting.PostgreSQL` belongs in the AppHost and `Aspire.Npgsql` belongs in the application. A Python or JavaScript API can consume the same configuration with its own PostgreSQL client; it does not need a .NET client package.
