---
title: Existing resource pattern
termType: Pattern
description: Connects an application to a dependency that already exists instead of creating and managing a new instance.
aliases: [existing resource, AddConnectionString]
topics: [integrations, deployment]
context: Supply a shared database's connection string in AppHost configuration and reference it from an API without starting another database container.
related: [connection-string, withreference, emulator-pattern]
resources:
  - title: Connect to existing services with parameters
    href: /fundamentals/external-parameters/
legacyAnchors: [existing-resource-pattern]
legacyGroup: common-patterns
---
For a dependency exposed through a connection string, use `AddConnectionString` in C# or `addConnectionString` in TypeScript to represent the configured value in the AppHost.

For a resource named `db`, Aspire reads `ConnectionStrings:db` from AppHost configuration, including the environment variable `ConnectionStrings__db`, and passes the value to referencing consumers.

This is useful for shared team resources or existing production services. The connection string resource does not create, migrate, or manage the database itself. Keep credentials in an appropriate secret store rather than source control.
