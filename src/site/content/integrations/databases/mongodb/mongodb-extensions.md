---
title: Use community extensions for MongoDB hosting
description: Decorate official Aspire MongoDB resources with Community Toolkit DbGate and dbx management interfaces for local development.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

{% image "/assets/images/icons/mongodb-icon.png", alt: "MongoDB logo", width: 100, height: 100, fit: "contain", class: "float-inline-left icon", zoomable: false %}

The Aspire Community Toolkit MongoDB hosting extensions package provides extra functionality to the [Aspire.Hosting.MongoDB](https://www.nuget.org/packages/Aspire.Hosting.MongoDB) hosting package.

This package provides the following features:

- [DbGate](https://dbgate.org/) management UI
- dbx management UI

## Hosting integration

To get started with the Aspire Community Toolkit MongoDB hosting extensions, install the [CommunityToolkit.Aspire.Hosting.MongoDB.Extensions](https://www.nuget.org/packages/CommunityToolkit.Aspire.Hosting.MongoDB.Extensions) NuGet package in the AppHost project.

{% install_package "CommunityToolkit.Aspire.Hosting.MongoDB.Extensions" %}

For TypeScript AppHosts, add the Community Toolkit MongoDB extensions package to `aspire.config.json`:

```json title="aspire.config.json" ins={3}
{
  "packages": {
    "CommunityToolkit.Aspire.Hosting.MongoDB.Extensions": "*"
  }
}
```

## Add management UI

### DbGate management UI

To add the [DbGate](https://dbgate.org/) management UI, decorate the official `MongoDBServerResource` builder with {% api "Aspire.Hosting.MongoDBBuilderExtensions.WithDbGate" %}:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const mongodb = await builder.addMongoDB('mongodb');
await mongodb.withDbGate();

const api = await builder.addProject('api', '../Api/Api.csproj');
await api.withReference(mongodb);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mongodb = builder.AddMongoDB("mongodb")
    .WithDbGate();

builder.AddProject<Projects.ExampleProject>("api")
    .WithReference(mongodb);

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

This adds a new DbGate resource to the AppHost which is available from the Aspire dashboard. DbGate is a comprehensive database management tool that provides a web-based interface for managing your MongoDB databases.

### dbx management UI

[dbx](https://github.com/t8y2/dbx) is a lightweight, web-based database client and an alternative management UI to DbGate and Adminer. Use {% api "Aspire.Hosting.MongoDBBuilderExtensions.WithDbx" %} to add a dbx child resource configured for the MongoDB server:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const mongodb = await builder.addMongoDB('mongodb');
await mongodb.withDbx({
  containerName: 'mongodb-dbx',
  imageTag: '0.5.33',
});

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mongodb = builder.AddMongoDB("mongodb")
    .WithDbx();

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The C# overload accepts an optional container configuration callback and `containerName`. The TypeScript binding accepts optional `containerName` and `imageTag` values.

## See also

- [DbGate documentation](https://dbgate.org/)
- [MongoDB hosting integration](/integrations/databases/mongodb/mongodb-host/)
- [Connect to MongoDB](/integrations/databases/mongodb/mongodb-connect/)
- [Aspire Community Toolkit](https://github.com/CommunityToolkit/Aspire)
- [Aspire integrations overview](/integrations/overview/)
- [Aspire GitHub repo](https://github.com/microsoft/aspire)
