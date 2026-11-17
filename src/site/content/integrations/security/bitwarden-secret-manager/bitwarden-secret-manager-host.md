---
title: Host Bitwarden Secrets Manager
description: Use Aspire to provision Bitwarden Secrets Manager projects, manage or reference secrets, and inject secret configuration into dependent resources.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

The Bitwarden Secrets Manager hosting integration models a project and its secrets as AppHost resources. During `aspire deploy`, it creates or updates the project and managed secrets, reads referenced secrets, and makes resolved values available to dependent resources.

## Hosting integration

Add the package to the AppHost project:

{% install_package "CommunityToolkit.Aspire.Hosting.Bitwarden.SecretManager" %}

### Add a Bitwarden Secrets Manager resource

Create parameters for the Bitwarden project name or ID, organization ID, and management access token. Mark the token as secret. `AddBitwardenSecretManager` treats the project parameter as a project name unless its resolved value is a GUID, in which case it adopts that project by ID.

The example declares a managed secret and references the Bitwarden resource from an app. `WaitForCompletion` prevents the app from starting until the one-shot Bitwarden provisioner finishes.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const projectNameOrId = await builder.addParameter('bitwarden-project');
const organizationId = await builder.addParameter('bitwarden-organization-id');
const accessToken = await builder.addParameter('bitwarden-access-token', {
  secret: true,
});

const bitwarden = await builder.addBitwardenSecretManager(
  'bitwarden',
  projectNameOrId,
  organizationId,
  accessToken
);
const apiKey = await bitwarden.addSecret('api-key');

const api = await builder.addProject('api', '../Api/Api.csproj');
await api.withBitwardenSecretManagerReference(bitwarden);
await api.waitForCompletion(bitwarden);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var projectNameOrId = builder.AddParameter("bitwarden-project");
var organizationId = builder.AddParameter("bitwarden-organization-id");
var accessToken = builder.AddParameter("bitwarden-access-token", secret: true);

var bitwarden = builder.AddBitwardenSecretManager(
    "bitwarden",
    projectNameOrId,
    organizationId,
    accessToken);
var apiKey = bitwarden.AddSecret("api-key");

var api = builder.AddProject<Projects.Api>("api")
    .WithReference(bitwarden)
    .WaitForCompletion(bitwarden);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

In the preceding examples, the generated AppHost parameter names identify the values required for local development or deployment:

- `bitwarden-project`: a project name to create or a project GUID to adopt. A project name does not locate an existing remote project by name; without a cached or explicit GUID, the integration creates a project.
- `bitwarden-organization-id`: the Bitwarden organization GUID.
- `bitwarden-access-token`: the management access token with read and write access.

Provide parameter values through the AppHost configuration or deployment parameters. Do not commit access tokens to source control.

### Declare managed secrets

Call `AddSecret` when the AppHost owns the remote secret. During deployment, the integration creates the secret or updates its value when the local value changes.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
const serviceToken = await bitwarden.addSecret('service-token');
const displayName = await bitwarden.addSecretWithRemoteName(
  'billing-key',
  'Billing API key'
);
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var serviceToken = bitwarden.AddSecret("service-token");
var displayName = bitwarden.AddSecret("billing-key", remoteName: "Billing API key");

// After adding all resources, run the app...
```
{% endtab %}
{% endtabs %}

The local value is resolved in this order:

1. AppHost configuration at `Parameters:{resourceName}-{secretName}`, such as `Parameters:bitwarden-service-token`.
2. The existing Bitwarden value, when a secret with the mapped identity already exists and no local value is configured.
3. An interactive dashboard prompt if the value is still missing.

The integration tracks project and secret IDs in a local cache. Managed secret IDs are mapped automatically across runs; managed secrets do not have a separate explicit GUID-adoption overload.

### Reference externally managed secrets

Call `GetSecret` to read an existing secret without allowing the AppHost to update it. Use the `remoteName` overload when the local resource name differs from the name in Bitwarden.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
const serviceToken = await bitwarden.getSecret('service-token');
const billingKey = await bitwarden.getSecretWithRemoteName(
  'billing-key',
  'Billing API key'
);
const selectedSecret = await bitwarden.getSecretById(
  'legacy-key',
  '00000000-0000-0000-0000-000000000000'
);
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var serviceToken = bitwarden.GetSecret("service-token");
var billingKey = bitwarden.GetSecret("billing-key", remoteName: "Billing API key");
var selectedSecret = bitwarden.GetSecret(
    "legacy-key",
    Guid.Parse("00000000-0000-0000-0000-000000000000"));

// After adding all resources, run the app...
```
{% endtab %}
{% endtabs %}

Bitwarden does not require secret names to be unique. Pass a secret GUID when multiple secrets in a project share a name. The integration reports an error if a name-only lookup is ambiguous or if the referenced secret cannot be found.

### Provide secret values to dependent resources

Reference the Bitwarden resource to inject configuration beneath `Aspire:Bitwarden:SecretManager:{connectionName}`. The default connection name is the Bitwarden resource name. The settings include `OrganizationId`, `ProjectId`, `AccessToken`, `ApiUrl`, and `IdentityUrl`.

Use the secret resource directly with `WithEnvironment` to inject its resolved value. The app does not need the Bitwarden SDK, but changes to that value require another deployment.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
const worker = await builder.addProject('worker', '../Worker/Worker.csproj');
await worker.withBitwardenSecretManagerReference(bitwarden);
await worker.waitForCompletion(bitwarden);
await worker.withEnvironment('SERVICE_TOKEN', serviceToken);
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var worker = builder.AddProject<Projects.Worker>("worker")
    .WithReference(bitwarden)
    .WaitForCompletion(bitwarden)
    .WithEnvironment("SERVICE_TOKEN", serviceToken);

// After adding all resources, run the app...
```
{% endtab %}
{% endtabs %}

To retrieve the secret at runtime through the SDK, inject the identifier instead. This lets the app read the current value without injecting it as a static environment value:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
const api = await builder.addProject('api', '../Api/Api.csproj');
await api.withBitwardenSecretManagerReference(bitwarden);
await api.waitForCompletion(bitwarden);
await api.withEnvironment(
  'SERVICE_TOKEN_SECRET_ID',
  await serviceToken.asSecretId()
);
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var api = builder.AddProject<Projects.Api>("api")
    .WithReference(bitwarden)
    .WaitForCompletion(bitwarden)
    .WithEnvironment("SERVICE_TOKEN_SECRET_ID", serviceToken.AsSecretId());

// After adding all resources, run the app...
```
{% endtab %}
{% endtabs %}

:::caution
`WithReference(bitwarden)` injects the management token by default. Give a
deployed app a separate read-only token with `WithBitwardenAccessToken`. Grant
that token read permission to the project manually in Bitwarden after the
AppHost creates the project.
:::

Use a secret parameter for the app's read-only token. This overrides only the token for the referenced client connection; the AppHost keeps using its management token to provision the project and secrets.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
const readOnlyToken = await builder.addParameter('bitwarden-readonly-token', {
  secret: true,
});

const api = await builder.addProject('api', '../Api/Api.csproj');
await api.withBitwardenSecretManagerReference(bitwarden);
await api.withBitwardenReferenceAccessToken(bitwarden, readOnlyToken);
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var readOnlyToken = builder.AddParameter("bitwarden-readonly-token", secret: true);

var api = builder.AddProject<Projects.Api>("api")
    .WithReference(bitwarden)
    .WithBitwardenAccessToken(bitwarden, readOnlyToken);

// After adding all resources, run the app...
```
{% endtab %}
{% endtabs %}

### Persist the client authentication cache

The runtime client authenticates with Bitwarden when it starts. Frequent restarts without a persistent auth cache can trigger Bitwarden rate limits.

For a container resource, mount a named volume with `WithBitwardenAuthCacheVolume`. The default mount directory is `/var/lib/bitwarden`; the default volume name includes the app and Bitwarden resource names. This API requires a container and throws for process resources such as `AddProject`.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
const api = await builder.addContainer('api', 'example/api');
await api.withBitwardenSecretManagerReference(bitwarden);
await api.withBitwardenReferenceAuthCacheVolume(bitwarden);
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var api = builder.AddContainer("api", "example/api")
    .WithReference(bitwarden)
    .WithBitwardenAuthCacheVolume(bitwarden);

// After adding all resources, run the app...
```
{% endtab %}
{% endtabs %}

For a process resource or an environment-specific directory, configure a path inside the app:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
const authCacheDirectory = await builder.addParameter(
  'bitwarden-auth-cache-directory'
);

const api = await builder.addProject('api', '../Api/Api.csproj');
await api.withBitwardenSecretManagerReference(bitwarden);
await api.withBitwardenReferenceAuthCacheDirectoryFromParameter(
  bitwarden,
  authCacheDirectory
);
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var authCacheDirectory = builder.AddParameter("bitwarden-auth-cache-directory");

var api = builder.AddProject<Projects.Api>("api")
    .WithReference(bitwarden)
    .WithBitwardenAuthCacheDirectory(bitwarden, authCacheDirectory);

// After adding all resources, run the app...
```
{% endtab %}
{% endtabs %}

Use a path that exists and is writable in the app environment. A host-specific path is not automatically translated into a container path.

### Configure Bitwarden endpoints and cache files

The API and identity URLs default to `https://api.bitwarden.com` and `https://identity.bitwarden.com`. Override either URL with an absolute string, an AppHost parameter, or an external service resource. When an external service resource is used, the Bitwarden resource references and waits for that service.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
await bitwarden.withApiUrl('https://bitwarden.example.com/api');
await bitwarden.withIdentityUrl('https://bitwarden.example.com/identity');
await bitwarden.withCacheFile('.bitwarden/team.Development.json');
await bitwarden.withAuthCacheDirectory('/ci/bitwarden-auth');
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
bitwarden
    .WithApiUrl("https://bitwarden.example.com/api")
    .WithIdentityUrl("https://bitwarden.example.com/identity")
    .WithCacheFile(".bitwarden/team.Development.json")
    .WithAuthCacheDirectory("/ci/bitwarden-auth");

// After adding all resources, run the app...
```
{% endtab %}
{% endtabs %}

`WithCacheFile` changes the AppHost bookkeeping file for project and secret ID mappings. Its default is `.bitwarden/{resourceName}.{environment}.json`, relative to the AppHost directory. `WithAuthCacheDirectory` changes the AppHost SDK auth-cache location; by default the Aspire store keeps it using the token identifier. These are separate from the runtime app's auth-cache setting.

### Deployment and resource ordering

Run `aspire deploy` to execute the Bitwarden deployment pipeline. It authenticates, provisions the project, synchronizes managed secret values, creates or updates managed secrets, and resolves declared external references. For Docker Compose deployments, it also applies resolved values to generated environment files.

The Bitwarden resource is a one-shot provisioner. Call `WaitForCompletion(bitwarden)` for a dependent resource that needs resolved project IDs, secret values, or secret IDs before it starts. The hosting resource does not expose a separate health-check API.

### Exported AppHost API

The generated API export artifact marks the following hosting surface for Aspire's polyglot AppHost. TypeScript overload aliases are listed where parameter types require distinct names.

| API                                                                                                          | Purpose                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AddBitwardenSecretManager(name, projectNameOrId, organizationId, accessToken)`                              | Add a project resource.                                                                                                                                                       |
| `AddSecret(name)` / `AddSecret(name, remoteName)`                                                            | Declare an AppHost-managed secret. The TypeScript overload with `remoteName` is `addSecretWithRemoteName`.                                                                    |
| `GetSecret(name)` / `GetSecret(name, remoteName)` / `GetSecret(name, secretId)`                              | Reference an existing secret by name, remote name, or GUID. TypeScript overload aliases are `getSecretWithRemoteName` and `getSecretById`.                                    |
| `WithApiUrl(string)` / `WithApiUrl(parameter)` / `WithApiUrl(externalService)`                               | Set the API endpoint. TypeScript overload aliases are `withApiUrlFromParameter` and `withApiUrlFromExternalService`.                                                          |
| `WithIdentityUrl(string)` / `WithIdentityUrl(parameter)` / `WithIdentityUrl(externalService)`                | Set the identity endpoint. TypeScript overload aliases are `withIdentityUrlFromParameter` and `withIdentityUrlFromExternalService`.                                           |
| `WithCacheFile(path)`                                                                                        | Set the AppHost project and secret ID cache path.                                                                                                                             |
| `WithAuthCacheDirectory(path)`                                                                               | Set the AppHost SDK auth-cache directory.                                                                                                                                     |
| `WithReference(bitwarden, connectionName?)`                                                                  | Inject client settings into a dependent resource. In TypeScript, call `withBitwardenSecretManagerReference`.                                                                  |
| `AsSecretId()`                                                                                               | Get an expression for a secret's ID.                                                                                                                                          |
| `WithBitwardenAccessToken(bitwarden, token)`                                                                 | Override the runtime token injected for a Bitwarden connection.                                                                                                               |
| `WithBitwardenAuthCacheDirectory(bitwarden, path)` / `WithBitwardenAuthCacheDirectory(bitwarden, parameter)` | Set a runtime client's auth-cache directory. TypeScript overloads are `withBitwardenReferenceAuthCacheDirectory` and `withBitwardenReferenceAuthCacheDirectoryFromParameter`. |
| `WithBitwardenAuthCacheVolume(bitwarden, volumeName?, containerDirectory?)`                                  | Mount a named volume for a container client's auth cache.                                                                                                                     |

`EndpointReference` URL overloads and methods targeting a custom connection name are intentionally excluded from the generated polyglot API. In C#, those additional hosting overloads are available for cases outside the standard resource-name connection flow.

The exported resource types also expose the following properties:

| Resource type                    | Exported properties                                                 |
| -------------------------------- | ------------------------------------------------------------------- |
| `BitwardenSecretManagerResource` | `AuthCacheDirectory`, `CacheFile`, `ExistingProjectId`, `ProjectId` |
| `BitwardenSecretResource`        | `IsManaged`, `Parent`, `RemoteName`, `ResolvedSecretId`, `SecretId` |

## See also

- [Get started with the Bitwarden Secrets Manager integration](/integrations/security/bitwarden-secret-manager/bitwarden-secret-manager-get-started/)
- [Connect to Bitwarden Secrets Manager](/integrations/security/bitwarden-secret-manager/bitwarden-secret-manager-connect/)
- [Bitwarden Secrets Manager](https://bitwarden.com/products/secrets-manager/)
