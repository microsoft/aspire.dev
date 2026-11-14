---
title: Connect with the Zitadel integration
description: Pass a Zitadel authority endpoint from Aspire to consuming applications, inspect OIDC discovery, and configure ASP.NET Core authentication.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

Applications connect to Zitadel through its identity endpoint using OpenID Connect or OAuth 2.0. The Community Toolkit package configures the server in the AppHost; configure authentication separately in each consuming application. First [host Zitadel with PostgreSQL](/integrations/security/zitadel/zitadel-host/), then pass its authority URL to the consumer.

## Connection contract

`ZitadelResource` is a container resource with endpoints. It does **not** implement `IResourceWithConnectionString`, provide a `ConnectionStringExpression`, or export a dictionary of Zitadel connection properties.

| Resource member or setting | Meaning                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Endpoint named `http`      | The server endpoint, with container target port `8080`. Its URL scheme can become HTTPS through certificate configuration. |
| `AdminUsernameParameter`   | Initial administrator username parameter in the C# resource API.                                                           |
| `AdminPasswordParameter`   | Initial administrator password parameter in the C# resource API.                                                           |
| `ZITADEL_EXTERNALDOMAIN`   | Server-side external hostname, derived from the endpoint target host unless overridden.                                    |
| `ZITADEL_EXTERNALPORT`     | Server-side external port, supplied from the endpoint when available.                                                      |

Referencing Zitadel does not inject `ConnectionStrings__zitadel`. Use its named endpoint to populate application configuration explicitly. The administrator parameters belong to server initialization; do not pass them to your application as OIDC credentials.

:::note
There is no Zitadel client registration or keyed-client API in this hosting
package. Application-side authentication, health checks, and telemetry are the
responsibility of your chosen client library.
:::

## Pass the endpoint to a consuming app

The following example assumes an ASP.NET Core project at `../Web/Web.csproj` and, for a C# AppHost, its generated `Projects.Web` type. Add the hosting packages described on the [host page](/integrations/security/zitadel/zitadel-host/) before running it.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const postgres = await builder.addPostgres('postgres');
const zitadel = await builder.addZitadel('zitadel', { port: 8080 });
await zitadel.withDatabase(postgres);

const web = await builder.addProject('web', '../Web/Web.csproj');
await web.withReference(zitadel);
await web.withEnvironment(
  'Zitadel__Authority',
  await zitadel.getEndpoint('http')
);
await web.waitFor(zitadel);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres");
var zitadel = builder.AddZitadel("zitadel", port: 8080)
    .WithDatabase(postgres);

builder.AddProject<Projects.Web>("web")
    .WithReference(zitadel)
    .WithEnvironment("Zitadel__Authority", zitadel.GetEndpoint("http"))
    .WaitFor(zitadel);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

`WithReference` supplies Aspire's endpoint service-discovery configuration. The explicit environment assignment supplies `Zitadel__Authority`; that name is an application convention used by this page, not a property exported by the integration. .NET's environment configuration provider reads it as `Zitadel:Authority`.

Use the same resource name, `zitadel`, when selecting the endpoint and declaring the reference. Unlike a connection-string integration, the application does not use that resource name as a client registration key. Other languages can read the same explicit environment variable.

### Match the external hostname

Use an authority URL whose hostname matches Zitadel's configured external domain. The browser and application must both be able to reach it. If a reverse proxy or container network requires a different address, configure public routing and the external domain together rather than replacing the authority with an internal hostname.

Upstream tests for the dashboard and OIDC discovery explicitly set the HTTP `Host` header to match the resource endpoint host. A mismatched host can produce a `404` even when `/healthz` succeeds.

:::caution
Keep HTTPS certificate validation enabled. Trust the development certificate
in each client environment where needed. Changing `RequireHttpsMetadata` does
not fix certificate trust, and using an insecure certificate-validation
callback is not a substitute for configuring trust.
:::

## Inspect OpenID Connect discovery

Zitadel exposes `/.well-known/openid-configuration`. These examples read the explicit authority environment variable and print the advertised issuer. They are connectivity diagnostics, not authentication implementations or token validators.

Run them with `Zitadel__Authority` set to the actual reachable endpoint URL. The JavaScript example requires a Node.js version with built-in `fetch`; the Python and Go examples use standard libraries.

{% tabs sync: "zitadel-consumer-lang" %}
{% tab "C#", id: "csharp" %}
```csharp title="Program.cs"
using System.Net.Http;
using System.Text.Json;

var authority = Environment.GetEnvironmentVariable("Zitadel__Authority")
    ?? throw new InvalidOperationException("Set Zitadel__Authority.");

using var client = new HttpClient();
var json = await client.GetStringAsync(
    $"{authority.TrimEnd('/')}/.well-known/openid-configuration");
using var discovery = JsonDocument.Parse(json);

Console.WriteLine(discovery.RootElement.GetProperty("issuer").GetString());
```
{% endtab %}
{% tab "TypeScript / JavaScript", id: "typescript" %}
```javascript title="discovery.mjs"
const authority = process.env.Zitadel__Authority;
if (!authority) {
  throw new Error('Set Zitadel__Authority.');
}

const response = await fetch(
  `${authority.replace(/\/$/, '')}/.well-known/openid-configuration`
);
if (!response.ok) {
  throw new Error(`Discovery failed: ${response.status}`);
}

const discovery = await response.json();
console.log(discovery.issuer);
```
{% endtab %}
{% tab "Python", id: "python" %}
```python title="discovery.py"
import json
import os
from urllib.request import urlopen

authority = os.environ["Zitadel__Authority"].rstrip("/")
with urlopen(f"{authority}/.well-known/openid-configuration", timeout=30) as response:
    discovery = json.load(response)

print(discovery["issuer"])
```
{% endtab %}
{% tab "Go", id: "go" %}
```go title="main.go"
package main

import (
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "os"
    "strings"
    "time"
)

func main() {
    authority := strings.TrimRight(os.Getenv("Zitadel__Authority"), "/")
    if authority == "" {
        log.Fatal("Set Zitadel__Authority.")
    }

    client := &http.Client{Timeout: 30 * time.Second}
    response, err := client.Get(authority + "/.well-known/openid-configuration")
    if err != nil {
        log.Fatal(err)
    }
    defer response.Body.Close()
    if response.StatusCode != http.StatusOK {
        log.Fatalf("Discovery failed: %s", response.Status)
    }

    var discovery struct {
        Issuer string `json:"issuer"`
    }
    if err := json.NewDecoder(response.Body).Decode(&discovery); err != nil {
        log.Fatal(err)
    }
    fmt.Println(discovery.Issuer)
}
```
{% endtab %}
{% endtabs %}

## Add an ASP.NET Core OpenID Connect client

Create an OIDC application registration in Zitadel before configuring the web app. For the confidential web-client example below, select authorization code flow and client-secret authentication. Register the web app's exact sign-in callback URL, such as `https://localhost:7243/signin-oidc`, using the web app's actual host and port.

Required client settings are:

- `Authority`: The Zitadel URL used for discovery.
- `ClientId`: The identifier from the OIDC application registration.
- `ClientSecret`: The secret for that registration, stored securely.

Install [📦 Microsoft.AspNetCore.Authentication.OpenIdConnect](https://nuget.org/packages/Microsoft.AspNetCore.Authentication.OpenIdConnect) in the consuming web project. Choose a package version compatible with the project's target framework.

{% install_dotnet_package "Microsoft.AspNetCore.Authentication.OpenIdConnect" %}

### Configuration providers and inline options

Use the application's `Zitadel` configuration section for non-secret settings:

```json title="appsettings.json"
{
  "Zitadel": {
    "Authority": "https://localhost:8080",
    "ClientId": "<ZITADEL_CLIENT_ID>"
  }
}
```

Replace the example authority with the actual endpoint URL and the client ID with the registered value. The AppHost environment assignment overrides `Zitadel:Authority` when launched through Aspire. Store `Zitadel:ClientSecret` in the web project's user secrets for development or a secure production configuration provider. Do not put it in `appsettings.json`.

Configure cookies for the local session and OpenID Connect for authentication challenges:

```csharp title="Program.cs"
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;

var builder = WebApplication.CreateBuilder(args);
var settings = builder.Configuration.GetSection("Zitadel");

builder.Services.AddAuthentication(options =>
{
    options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
})
    .AddCookie()
    .AddOpenIdConnect(options =>
    {
        options.Authority = settings["Authority"]
            ?? throw new InvalidOperationException("Configure Zitadel:Authority.");
        options.ClientId = settings["ClientId"]
            ?? throw new InvalidOperationException("Configure Zitadel:ClientId.");
        options.ClientSecret = settings["ClientSecret"]
            ?? throw new InvalidOperationException("Configure Zitadel:ClientSecret.");
        options.ResponseType = "code";
        options.UsePkce = true;
        options.MapInboundClaims = false;
        options.TokenValidationParameters.NameClaimType = "name";
    });
builder.Services.AddAuthorization();

var app = builder.Build();

app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/", () => "Open /account to sign in.");
app.MapGet("/account", (ClaimsPrincipal user) => new
{
    Name = user.Identity?.Name
}).RequireAuthorization();

app.Run();
```

The inline delegate configures the standard ASP.NET Core handler. The `Zitadel` section is chosen by this example; it is not a Community Toolkit settings class or an `Aspire:Zitadel` configuration contract. For additional options and sign-out configuration, see [Configure OpenID Connect web authentication](https://learn.microsoft.com/aspnet/core/security/authentication/configure-oidc-web-authentication).

For a deliberately HTTP-only local server, the OIDC handler's HTTPS metadata requirement needs a development-only override. Prefer configuring Aspire certificates and using HTTPS. Never disable HTTPS metadata requirements in production.

### Multiple authentication providers

ASP.NET Core uses named authentication schemes, not keyed Zitadel clients. Register additional named OIDC schemes if the application needs multiple identity providers. This hosting package does not provide `AddZitadelClient` or `AddKeyedZitadelClient` methods.

## Client health checks and observability

The hosting package does not add client-side health checks, logging providers, OpenTelemetry tracing, or metrics to consuming applications. Its `/healthz` check reports server health and does not verify the application's credentials, callback URL, or ability to authenticate a user.

Use your authentication library's diagnostics for sign-in failures. ASP.NET Core authentication handlers log through `Microsoft.Extensions.Logging`; configure application logging and [service defaults](/get-started/csharp-service-defaults/) separately. Do not log client secrets or tokens. Container logs and resource health remain available in the Aspire dashboard.

## See also

- [Zitadel hosting integration](/integrations/security/zitadel/zitadel-host/)
- [Zitadel documentation and integration guides](https://zitadel.com/docs)
- [Authenticate users with OpenID Connect in Zitadel](https://zitadel.com/docs/guides/integrate/login/oidc)
- [ASP.NET Core OpenID Connect authentication](https://learn.microsoft.com/aspnet/core/security/authentication/configure-oidc-web-authentication)
- [Zitadel endpoint integration tests](https://github.com/CommunityToolkit/Aspire/blob/main/tests/CommunityToolkit.Aspire.Hosting.Zitadel.Tests/AppHostTests.cs)
