---
title: Environment variable
description: A process-level name and value used to pass configuration, endpoints, and connection information to an application.
aliases: [environment configuration, env var]
topics: [foundations]
context: Inspect a service's environment in the dashboard to see which connection strings and endpoint settings the AppHost supplied.
related: [connection-string, service-discovery, polyglot]
resources:
  - title: Configure environment variables for your resources
    href: /fundamentals/environment-variables/
legacyAnchors: [environment-variable]
legacyGroup: key-terms
---
Aspire supplies environment variables to running resources for configuration such as:

- `ConnectionStrings__resourcename` for a named connection string.
- `services__servicename__https__0` for a service's HTTPS endpoint.
- Custom settings configured with `WithEnvironment` in C# or `withEnvironment` in TypeScript.

Applications read these through their runtime's environment APIs or a configuration library. .NET configuration maps double underscores to configuration separators; JavaScript and Python can read the original environment variable names directly.

Values can contain secrets. Avoid copying sensitive environment values into bug reports or sharing them publicly.
