---
title: Zitadel hosting integration
description: Configure Zitadel containers in an Aspire AppHost with PostgreSQL, administrator parameters, external domains, TLS, and health checks.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

The [Aspire Community Toolkit](https://github.com/CommunityToolkit/Aspire) Zitadel hosting integration models a `ZitadelResource` container in your AppHost. Start with [Get started with the Zitadel integration](/integrations/security/zitadel/zitadel-get-started/) for an overview. For application authentication, see [Connect to Zitadel](/integrations/security/zitadel/zitadel-connect/).

## Installation

Install the [📦 CommunityToolkit.Aspire.Hosting.Zitadel](https://nuget.org/packages/CommunityToolkit.Aspire.Hosting.Zitadel) package in your AppHost:

{% install_package "CommunityToolkit.Aspire.Hosting.Zitadel", short_name: "zitadel" %}

Install [📦 Aspire.Hosting.PostgreSQL](https://nuget.org/packages/Aspire.Hosting.PostgreSQL) to declare the database:

{% install_package "Aspire.Hosting.PostgreSQL", short_name: "postgres" %}

TypeScript AppHosts use generated bindings from `./.aspire/modules/aspire.mjs`. The Zitadel package exports `addZitadel`, `withDatabase`, `withExistingDatabase`, and `withExternalDomain`.

## Add Zitadel resource

Add a PostgreSQL server and attach it to a Zitadel resource:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const postgres = await builder.addPostgres('postgres');
const zitadel = await builder.addZitadel('zitadel');
await zitadel.withDatabase(postgres);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres");
var zitadel = builder.AddZitadel("zitadel")
    .WithDatabase(postgres);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The integration uses the `ghcr.io/zitadel/zitadel` image. The reviewed source defaults to tag `v4.16.2`. It launches the container with `start-from-init --masterkeyFromEnv`, exposes an endpoint named `http` with target port `8080`, and adds a **Zitadel Dashboard** link.

The required `name` argument identifies the resource in Aspire. Optional arguments configure:

- `port`: The host port. Omit it to allocate a port dynamically.
- `username`: A parameter resource for the first administrator's username.
- `password`: A parameter resource for the first administrator's password.
- `masterKey`: A parameter resource for Zitadel's master key.

:::caution
Zitadel requires PostgreSQL. Adding the Zitadel resource alone does not add or
configure a database. Attach a server or database with the database helper
before running the AppHost.
:::

## Configure the database

### Select a database name

Passing a PostgreSQL server creates a database resource. Set `databaseName` to select its name; omitting it, or supplying a blank value, uses `zitadel-db`.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const postgres = await builder.addPostgres('postgres');
const zitadel = await builder.addZitadel('zitadel');
await zitadel.withDatabase(postgres, { databaseName: 'identity' });

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres");
var zitadel = builder.AddZitadel("zitadel")
    .WithDatabase(postgres, databaseName: "identity");

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

### Use an existing database resource and persist data

Pass a database resource to reuse one already declared in the AppHost. TypeScript names this overload `withExistingDatabase`; C# uses `WithDatabase` for both overloads.

Add a data volume to **PostgreSQL** to keep identity data outside the database container's lifecycle:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const postgres = await builder.addPostgres('postgres');
await postgres.withDataVolume();
const database = await postgres.addDatabase('identity');

const zitadel = await builder.addZitadel('zitadel');
await zitadel.withExistingDatabase(database);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres")
    .WithDataVolume();
var database = postgres.AddDatabase("identity");

var zitadel = builder.AddZitadel("zitadel")
    .WithDatabase(database);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

This selects an existing Aspire database resource, not an arbitrary database connection string. For a host-directory bind mount instead of a managed volume, use PostgreSQL's data bind mount API. See [PostgreSQL hosting](/integrations/databases/postgres/postgres-host/) for storage configuration. The Zitadel package does not define its own data-volume or data-bind-mount helper.

Both database overloads set the following environment variables:

| Environment variable                       | Value source                         |
| ------------------------------------------ | ------------------------------------ |
| `ZITADEL_DATABASE_POSTGRES_HOST`           | PostgreSQL server host reference     |
| `ZITADEL_DATABASE_POSTGRES_PORT`           | PostgreSQL server port reference     |
| `ZITADEL_DATABASE_POSTGRES_DATABASE`       | Selected database name               |
| `ZITADEL_DATABASE_POSTGRES_USER_USERNAME`  | PostgreSQL server username           |
| `ZITADEL_DATABASE_POSTGRES_USER_PASSWORD`  | PostgreSQL server password parameter |
| `ZITADEL_DATABASE_POSTGRES_ADMIN_USERNAME` | The same server username             |
| `ZITADEL_DATABASE_POSTGRES_ADMIN_PASSWORD` | The same server password parameter   |

The helper also adds a reference to the database and waits for it. It does not create separate PostgreSQL admin and application credentials.

## Configure administrator credentials and master key

By default, the integration uses username `admin`. It generates a password with at least one lowercase letter, uppercase letter, digit, and special character. It also generates a secret master-key parameter with a minimum length of 32 and the same character-category guarantees.

Supply parameter resources to control these values. Configure the secret values in the AppHost's secret store or another secure configuration provider before running this example:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const username = await builder.addParameter('identity-admin', {
  value: 'admin',
});
const password = await builder.addParameter('identity-password', {
  secret: true,
});
const masterKey = await builder.addParameter('identity-master-key', {
  secret: true,
});

const postgres = await builder.addPostgres('postgres');
const zitadel = await builder.addZitadel('zitadel', {
  username,
  password,
  masterKey,
});
await zitadel.withDatabase(postgres);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var username = builder.AddParameter("identity-admin", "admin");
var password = builder.AddParameter("identity-password", secret: true);
var masterKey = builder.AddParameter("identity-master-key", secret: true);

var postgres = builder.AddPostgres("postgres");
var zitadel = builder.AddZitadel("zitadel",
    username: username,
    password: password,
    masterKey: masterKey)
    .WithDatabase(postgres);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The username and password populate `ZITADEL_FIRSTINSTANCE_ORG_HUMAN_USERNAME` and `ZITADEL_FIRSTINSTANCE_ORG_HUMAN_PASSWORD`. The master key populates `ZITADEL_MASTERKEY`. These are initialization settings, not application client credentials.

The integration sets `ZITADEL_FIRSTINSTANCE_ORG_HUMAN_PASSWORDCHANGEREQUIRED=false`. It also sets `ZITADEL_DEFAULTINSTANCE_FEATURES_LOGINV2_REQUIRED=false` so the example does not require a separate Login V2 container.

:::caution
Supply a 32-character master key that meets Zitadel's requirements, and
protect it alongside your persistent database. The hosting helper passes
custom values through without validating their length or complexity. Do not
commit passwords or master keys to source control.
:::

## Configure the external domain and port

The default external domain is taken from the endpoint's target host. Unit tests assert `localhost` for the default resource. The integration supplies the endpoint port as `ZITADEL_EXTERNALPORT` when available.

Override the domain with the external-domain helper and use a fixed host port when your clients need a stable authority URL:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const postgres = await builder.addPostgres('postgres');
const zitadel = await builder.addZitadel('zitadel', { port: 8080 });
await zitadel.withDatabase(postgres);
await zitadel.withExternalDomain('auth.example.com');

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres");
var zitadel = builder.AddZitadel("zitadel", port: 8080)
    .WithDatabase(postgres)
    .WithExternalDomain("auth.example.com");

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

Pass only the hostname, not a URL with a scheme or port. The helper sets `ZITADEL_EXTERNALDOMAIN` and rejects null, empty, or whitespace-only strings. It does not configure DNS, a reverse proxy, or a certificate for that hostname. Arrange those separately before using a custom domain.

:::note
The upstream README includes an `externalDomain` argument on `AddZitadel` and
describes a `name.dev.localhost` default. The current source and generated API
export do not have that argument. Use the external-domain helper and the
actual endpoint host instead.
:::

### TLS behavior

The integration participates in Aspire's certificate configuration. When a certificate is supplied to its configuration callback, it sets:

- `ZITADEL_EXTERNALSECURE=true`
- `ZITADEL_TLS_ENABLED=true`
- `ZITADEL_TLS_CERTPATH` to the certificate path
- `ZITADEL_TLS_KEYPATH` to the key path

In run mode, the integration changes the endpoint scheme to HTTPS when a configured certificate or applicable developer certificate is available. The endpoint name stays `http`, since Zitadel binds to a single port. Do not assume the endpoint name determines its URL scheme. See [Certificate configuration](/app-host/certificate-configuration/) for Aspire's certificate setup.

## Hosting integration health checks

The hosting integration registers an HTTP health check at `/healthz`. It checks whether the Zitadel health endpoint responds successfully. Use a consumer's wait dependency to delay startup until Zitadel is healthy, as shown on the [connect page](/integrations/security/zitadel/zitadel-connect/).

Upstream container tests wait for PostgreSQL and Zitadel to become healthy, then assert HTTP `200 OK` from `/healthz`. Separate tests exercise the root dashboard and `/.well-known/openid-configuration`. The hosting health check itself does not test an OIDC client registration or complete a user sign-in.

## Exported AppHost API reference

| C# API                                                      | TypeScript API                                                  | Behavior                                                                                                                                           |
| ----------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AddZitadel(name, port?, username?, password?, masterKey?)` | `addZitadel(name, { port?, username?, password?, masterKey? })` | Adds the container, endpoint, initial credentials, certificate configuration, and HTTP health check. The TypeScript options object can be omitted. |
| `WithDatabase(server, databaseName?)`                       | `withDatabase(server, { databaseName? })`                       | Adds a database to a PostgreSQL server, then configures Zitadel to use it. The TypeScript options object can be omitted.                           |
| `WithDatabase(database)`                                    | `withExistingDatabase(database)`                                | Uses a previously declared PostgreSQL database resource.                                                                                           |
| `WithExternalDomain(externalDomain)`                        | `withExternalDomain(externalDomain)`                            | Overrides `ZITADEL_EXTERNALDOMAIN`.                                                                                                                |

`ZitadelResource` derives from `ContainerResource`. Its public C# API includes the constructor `ZitadelResource(string name)` and the required, settable `AdminUsernameParameter` and `AdminPasswordParameter` properties. Prefer the builder API so the container annotations and environment settings are configured. These properties are not separate TypeScript exports, and the resource does not implement `IResourceWithConnectionString`.

For the endpoint contract and application-side configuration, see [Connect to Zitadel](/integrations/security/zitadel/zitadel-connect/).

## See also

- [Zitadel documentation](https://zitadel.com/docs)
- [PostgreSQL hosting integration](/integrations/databases/postgres/postgres-host/)
- [Zitadel hosting source](https://github.com/CommunityToolkit/Aspire/blob/main/src/CommunityToolkit.Aspire.Hosting.Zitadel/ZitadelHostingExtensions.cs)
- [Generated public API](https://github.com/CommunityToolkit/Aspire/blob/main/src/CommunityToolkit.Aspire.Hosting.Zitadel/api/CommunityToolkit.Aspire.Hosting.Zitadel.cs)
- [Zitadel hosting tests](https://github.com/CommunityToolkit/Aspire/tree/main/tests/CommunityToolkit.Aspire.Hosting.Zitadel.Tests)
