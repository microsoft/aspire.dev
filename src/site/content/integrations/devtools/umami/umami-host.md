---
title: Set up Umami in the AppHost
description: Use the Aspire Community Toolkit Umami hosting integration to run Umami with a PostgreSQL database in an AppHost.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

This article describes the Aspire Community Toolkit hosting integration for Umami. Use its AppHost APIs to run an Umami container and configure its PostgreSQL backend.

If you're new to the integration, start with [Get started with the Umami integration](/integrations/devtools/umami/umami-get-started/).

## Installation

Install the [📦 CommunityToolkit.Aspire.Hosting.Umami](https://nuget.org/packages/CommunityToolkit.Aspire.Hosting.Umami) package in your AppHost:

{% install_package "CommunityToolkit.Aspire.Hosting.Umami" %}

## Add an Umami resource

Add a PostgreSQL database, then pass it to `WithPostgreSQL` to configure Umami's storage backend:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const postgres = await builder.addPostgres('postgres');
const database = await postgres.addDatabase('umami-db');

const umami = await builder.addUmami('umami');
await umami.withPostgreSQL(database);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres");
var database = postgres.AddDatabase("umami-db");

var umami = builder.AddUmami("umami")
    .WithPostgreSQL(database);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

`AddUmami` accepts the resource name, an optional secret parameter, and an optional host port. If you omit the secret, the integration creates a secret parameter for Umami. If you omit the port, Aspire assigns the HTTP endpoint's host port.

The Umami container listens on port `3000`. The integration uses the `umamisoftware/umami:3.4` image and configures its `APP_SECRET` environment variable from the secret parameter.

## Configure the PostgreSQL backend

Pass a PostgreSQL database resource to `WithPostgreSQL`. The integration waits for that database and sets Umami's `DATABASE_URL` using the PostgreSQL resource's username, password, host, port, and database name. Umami requires a database backend; the README for this integration identifies PostgreSQL as the supported backend.

## Use a custom secret and port

Pass a secret parameter and a host port to `AddUmami` when you need to supply Umami's `APP_SECRET` or reserve a specific host port:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const umamiSecret = await builder.addParameter('umami-secret', {
  secret: true,
});
const postgres = await builder.addPostgres('postgres');
const database = await postgres.addDatabase('umami-db');

const umami = await builder.addUmami('umami', {
  secret: umamiSecret,
  port: 31300,
});
await umami.withPostgreSQL(database);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var umamiSecret = builder.AddParameter("umami-secret", secret: true);
var postgres = builder.AddPostgres("postgres");
var database = postgres.AddDatabase("umami-db");

var umami = builder.AddUmami("umami", secret: umamiSecret, port: 31300)
    .WithPostgreSQL(database);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The `port` argument sets the host port for Umami's HTTP endpoint. The container's target port remains `3000`.

## Hosting integration health checks

The integration configures an HTTP health check that requests Umami's `/api/heartbeat` endpoint. Aspire reports the resource as healthy after the endpoint responds successfully.

## AppHost API

The integration exports the following AppHost API:

- {% api "Aspire.Hosting.UmamiBuilderExtensions.AddUmami" %} adds an
  Umami resource. Its optional `secret` parameter supplies the `APP_SECRET`
  parameter, and its optional `port` parameter sets the host port.
- {% api "Aspire.Hosting.UmamiBuilderExtensions.WithPostgreSQL" %}
  configures the supplied PostgreSQL database resource as Umami's storage
  backend.
- `UmamiResource.PrimaryEndpoint` exposes the resource's HTTP endpoint.
- `UmamiResource.SecretParameter` exposes the parameter used for `APP_SECRET`.

## See also

- [Get started with the Umami integration](/integrations/devtools/umami/umami-get-started/)
- [Umami documentation](https://umami.is/docs)
- [Aspire Community Toolkit](https://github.com/CommunityToolkit/Aspire)
