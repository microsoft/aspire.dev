---
title: Connection string
description: A formatted value containing the address and options a client needs to connect to a database, cache, or similar service.
aliases: [connection information]
topics: [foundations, integrations]
context: A database named catalog supplies ConnectionStrings__catalog to a referencing service, which passes it to its database client.
related: [withreference, environment-variable, existing-resource-pattern]
resources:
  - title: Configure connection strings and parameters
    href: /fundamentals/external-parameters/
legacyAnchors: [connection-string]
legacyGroup: key-terms
---
A connection string can contain a host, port, database name, authentication information, and provider-specific options. Its syntax depends on the client library; there is no universal database connection string format.

Aspire integrations can construct connection strings from resource configuration, or the AppHost can accept an existing connection string from configuration. Referencing that resource makes its connection information available to a consumer.

.NET applications can read the `ConnectionStrings:<name>` configuration key through `GetConnectionString`. Environment variables use double underscores, for example `ConnectionStrings__catalog`. JavaScript applications read environment variables through `process.env`; Python applications use their environment APIs. Do not expose connection strings containing credentials in logs or screenshots.
