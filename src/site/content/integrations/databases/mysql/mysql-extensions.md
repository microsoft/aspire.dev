---
title: Use community extensions for MySQL hosting
description: Decorate official Aspire MySQL resources with Community Toolkit Adminer, DbGate, and dbx management interfaces.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

{% image "/assets/images/icons/mysqlconnector-icon.png", alt: "MySQL logo", width: 100, height: 100, fit: "contain", class: "float-inline-left icon", zoomable: false %}

The Aspire Community Toolkit MySQL hosting extensions package provides extra functionality to the [Aspire.Hosting.MySql](https://www.nuget.org/packages/Aspire.Hosting.MySql) hosting package.

This package provides the following features:

- [Adminer](https://adminer.org/) management UI
- [DbGate](https://dbgate.org/) management UI
- dbx management UI

## Hosting integration

To get started with the Aspire Community Toolkit MySQL hosting extensions, install the [CommunityToolkit.Aspire.Hosting.MySql.Extensions](https://www.nuget.org/packages/CommunityToolkit.Aspire.Hosting.MySql.Extensions) NuGet package in the AppHost project.

{% install_package "CommunityToolkit.Aspire.Hosting.MySql.Extensions" %}

For TypeScript AppHosts, add the Community Toolkit MySQL extensions package to `aspire.config.json`:

```json title="aspire.config.json" ins={3}
{
  "packages": {
    "CommunityToolkit.Aspire.Hosting.MySql.Extensions": "*"
  }
}
```

## Add management UI

### DbGate management UI

To add the [DbGate](https://dbgate.org/) management UI, decorate the official `MySqlServerResource` builder with {% api "Aspire.Hosting.MySqlBuilderExtensions.WithDbGate" %}:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const mysql = await builder.addMySql('mysql');
await mysql.withDbGate();

const api = await builder.addProject('api', '../Api/Api.csproj');
await api.withReference(mysql);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mysql = builder.AddMySql("mysql")
    .WithDbGate();

builder.AddProject<Projects.ExampleProject>("api")
    .WithReference(mysql);

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

This adds a new DbGate resource to the AppHost which is available from the Aspire dashboard. DbGate is a comprehensive database management tool that provides a web-based interface for managing your MySQL databases.

### Adminer management UI

To add the [Adminer](https://adminer.org/) management UI, decorate the official `MySqlServerResource` builder with {% api "Aspire.Hosting.MySqlBuilderExtensions.WithAdminer" %}:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const mysql = await builder.addMySql('mysql');
await mysql.withAdminer();

const api = await builder.addProject('api', '../Api/Api.csproj');
await api.withReference(mysql);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mysql = builder.AddMySql("mysql")
    .WithAdminer();

builder.AddProject<Projects.ExampleProject>("api")
    .WithReference(mysql);

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

This adds a new Adminer resource to the AppHost which is available from the Aspire dashboard. Adminer is a lightweight database management tool that provides a simple web interface for database operations.

### Using both management UIs

You can use both management UIs together on the same MySQL resource:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const mysql = await builder.addMySql('mysql');
await mysql.withDbGate();
await mysql.withAdminer();

const api = await builder.addProject('api', '../Api/Api.csproj');
await api.withReference(mysql);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mysql = builder.AddMySql("mysql")
    .WithDbGate()
    .WithAdminer();

builder.AddProject<Projects.ExampleProject>("api")
    .WithReference(mysql);

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

### dbx management UI

[dbx](https://github.com/t8y2/dbx) is a lightweight, web-based database client and an alternative management UI to DbGate and Adminer. Use {% api "Aspire.Hosting.MySqlBuilderExtensions.WithDbx" %} to add a dbx child resource configured for the MySQL server:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const mysql = await builder.addMySql('mysql');
await mysql.withDbx({
  containerName: 'mysql-dbx',
  imageTag: '0.5.33',
});

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mysql = builder.AddMySql("mysql")
    .WithDbx();

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The C# overload accepts an optional container configuration callback and `containerName`. The TypeScript binding accepts optional `containerName` and `imageTag` values.

## See also

- [Adminer documentation](https://www.adminer.org/)
- [DbGate documentation](https://dbgate.org/)
- [MySQL hosting integration](/integrations/databases/mysql/mysql-host/)
- [Connect to MySQL](/integrations/databases/mysql/mysql-connect/)
- [Aspire Community Toolkit](https://github.com/CommunityToolkit/Aspire)
- [Aspire integrations overview](/integrations/overview/)
- [Aspire GitHub repo](https://github.com/microsoft/aspire)
