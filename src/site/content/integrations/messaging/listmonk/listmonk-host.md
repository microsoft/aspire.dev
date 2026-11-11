---
title: Set up listmonk with the Aspire integration
description: Configure listmonk's PostgreSQL connection, first-run admin credentials, HTTP endpoint, uploads storage, and container settings in an Aspire AppHost.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

The listmonk hosting integration runs listmonk in a container and configures its database connection from a PostgreSQL resource. For a first walkthrough, see [Get started with the listmonk integration](../listmonk-get-started/).

## Installation

{% install_package "CommunityToolkit.Aspire.Hosting.Listmonk" %}

## Add a listmonk resource

Reference a PostgreSQL database and provide the initial admin credentials. The password parameter is secret. listmonk uses these admin credentials during the first database setup.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();
const password = await builder.addParameter('listmonk-admin-password', {
  secret: true,
});
const postgres = await builder.addPostgres('postgres');
const database = await postgres.addDatabase('listmonkdb');

const listmonk = await builder.addListmonk('listmonk');
await listmonk.withReference(database);
await listmonk.withAdminCredentials('admin', password);
await listmonk.withUploadsVolume();

const api = await builder.addProject('api', '../Api/Api.csproj');
await api.withReference(listmonk);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);
var adminPassword = builder.AddParameter("listmonk-admin-password", secret: true);
var database = builder.AddPostgres("postgres")
    .AddDatabase("listmonkdb");

var listmonk = builder.AddListmonk("listmonk")
    .WithReference(database)
    .WithAdminCredentials("admin", adminPassword)
    .WithUploadsVolume();

builder.AddProject<Projects.Api>("api")
    .WithReference(listmonk);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

Referencing the database configures listmonk's PostgreSQL environment variables and waits for the database before starting listmonk. Referencing listmonk from another resource exposes its HTTP host, port, and URI as connection properties.

## Configure listmonk

The container listens on port `9000` by default. Pass `port` to `AddListmonk` or `addListmonk` to set the host port. Use the configuration methods to customize listmonk's environment:

| Method                                                             | Setting                                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `WithAppAddress`                                                   | `LISTMONK_app__address`, the address listmonk binds to.                |
| `WithTimeZone`                                                     | `TZ`, the container time zone.                                         |
| `WithAdminUser`, `WithAdminPassword`, `WithAdminCredentials`       | `LISTMONK_ADMIN_USER` and `LISTMONK_ADMIN_PASSWORD` for initial setup. |
| `WithDatabaseSslMode`                                              | `LISTMONK_db__ssl_mode`.                                               |
| `WithDatabaseMaxOpenConnections`, `WithDatabaseMaxIdleConnections` | PostgreSQL connection pool limits.                                     |
| `WithDatabaseMaxLifetime`                                          | `LISTMONK_db__max_lifetime`.                                           |
| `WithDatabaseParameters`                                           | Additional PostgreSQL connection parameters.                           |
| `WithUserId`, `WithGroupId`                                        | Container process user and group IDs through `PUID` and `PGID`.        |
| `WithUploadsVolume`, `WithUploadsBindMount`                        | Store uploaded files in a container volume or a host directory.        |

## Persist uploads

Use a named volume to keep uploaded files outside the container lifecycle. Use a bind mount when you need direct access to the files on the host.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
const listmonk = await builder.addListmonk('listmonk');
await listmonk.withUploadsVolume();
// Or mount a host directory:
// await listmonk.withUploadsBindMount('./listmonk-uploads');
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var listmonk = builder.AddListmonk("listmonk")
    .WithUploadsVolume();
// Or mount a host directory:
// var listmonk = builder.AddListmonk("listmonk")
//     .WithUploadsBindMount("./listmonk-uploads");
```
{% endtab %}
{% endtabs %}

The volume mounts at `/listmonk/uploads`. The package provides the AppHost resource; use an HTTP client to call listmonk's API.

## See also

- [Get started with the listmonk integration](../listmonk-get-started/)
- [listmonk configuration documentation](https://listmonk.app/docs/configuration/)
- [CommunityToolkit.Aspire.Hosting.Listmonk source and tests](https://github.com/CommunityToolkit/Aspire/tree/main/src/CommunityToolkit.Aspire.Hosting.Listmonk)
