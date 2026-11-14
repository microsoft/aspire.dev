---
title: Stripe CLI hosting integration reference
description: Configure Stripe CLI listeners, event filters, API keys, and webhook-secret references in your Aspire AppHost with C# or TypeScript.
next: false
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

The [📦 CommunityToolkit.Aspire.Hosting.Stripe](https://nuget.org/packages/CommunityToolkit.Aspire.Hosting.Stripe) package adds a Stripe CLI container to your AppHost for local webhook forwarding. Start with [Get started with the Stripe integration](/integrations/cloud/stripe/stripe-get-started/) for prerequisites and a short setup flow.

## Installation

Install the hosting package in your AppHost:

{% install_package "CommunityToolkit.Aspire.Hosting.Stripe" %}

The package provides TypeScript AppHost exports through the generated `.aspire/modules/aspire.mjs` module. The TypeScript names for external-service forwarding and Stripe references differ from their C# overload names.

Use a container runtime to run the listener. Install the host Stripe CLI separately only when you need host-side commands such as `stripe trigger`.

## Add a Stripe resource

Add a resource with a name and an API-key parameter:

- `name`: The resource name displayed in the Aspire dashboard.
- `apiKey`: An Aspire parameter containing the Stripe API key. Mark the parameter as secret and supply a test key through `Parameters:stripe-api-key` in AppHost configuration.

The resource uses `docker.io/stripe/stripe-cli`, with image tag `v1.52.0` in the current integration source. Adding the resource sets `STRIPE_API_KEY` in the container. Add a listener configuration to start webhook forwarding.

### Forward to an Aspire resource

Use the endpoint-resource listener overload to forward to a project or another resource with endpoints. The example assumes an `Api` project at `../Api/Api.csproj`, referenced by the C# AppHost, with one HTTP endpoint in its launch profile and a handler at `/webhooks/stripe`.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const apiKey = await builder.addParameter('stripe-api-key', {
  secret: true,
});
const api = await builder.addProject('api', '../Api/Api.csproj');

const stripe = await builder.addStripe('stripe', apiKey);
await stripe.withListen(api, {
  webhookPath: '/webhooks/stripe',
});

await api.withStripeReference(stripe);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var apiKey = builder.AddParameter("stripe-api-key", secret: true);
var api = builder.AddProject<Projects.Api>("api");

var stripe = builder.AddStripe("stripe", apiKey)
    .WithListen(api, webhookPath: "/webhooks/stripe");

api.WithReference(stripe);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The listener adds `listen`, `--forward-to`, and the first endpoint's allocated address followed by `webhookPath`. The default path is `/webhooks/stripe`. The integration throws an `InvalidOperationException` when the target has no endpoints.

:::caution
This overload selects the first endpoint. It does not accept an endpoint name,
prefer HTTP over HTTPS, or rewrite the resulting address for container-to-host
access. Inspect the forwarding address in the CLI logs. If that address is not
reachable from the container, use an external-service destination with a
reachable URL instead.
:::

### Forward to an external service

Use an external service when the webhook handler runs outside the AppHost or when you need an explicit forwarding address. TypeScript uses `withListenExternalService`; C# uses the `WithListen` overload for `ExternalServiceResource`.

The example below assumes the `Api` project's HTTP launch-profile endpoint is port `5082` and is reachable through `host.docker.internal`. It also demonstrates event filtering, an optional CLI API-key argument, and a custom secret environment variable.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const apiKey = await builder.addParameter('stripe-api-key', {
  secret: true,
});
const api = await builder.addProject('api', '../Api/Api.csproj');
const webhookEndpoint = await builder.addExternalService(
  'webhook-endpoint',
  'http://host.docker.internal:5082'
);

const stripe = await builder.addStripe('stripe', apiKey);
await stripe.withListenExternalService(webhookEndpoint, {
  webhookPath: 'webhooks/stripe',
  events: ['payment_intent.created', 'charge.succeeded'],
});
await stripe.withApiKey(apiKey);

await api.withStripeReference(stripe, {
  webhookSigningSecretEnvVarName: 'CUSTOM_STRIPE_SECRET',
});

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var apiKey = builder.AddParameter("stripe-api-key", secret: true);
var api = builder.AddProject<Projects.Api>("api");
var webhookEndpoint = builder.AddExternalService(
    "webhook-endpoint",
    "http://host.docker.internal:5082");

var stripe = builder.AddStripe("stripe", apiKey)
    .WithListen(
        webhookEndpoint,
        webhookPath: "webhooks/stripe",
        events: ["payment_intent.created", "charge.succeeded"])
    .WithApiKey(apiKey);

api.WithReference(
    stripe,
    webhookSigningSecretEnvVarName: "CUSTOM_STRIPE_SECRET");

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The listener concatenates the external-service URI and `webhookPath`. A literal URI with no path is normalized with a trailing `/`, so use `webhooks/stripe` to produce a single separator in this example. Check the resulting URL when changing the base address or path.

External services backed by a URL parameter are also supported. The listener resolves the parameter while building its arguments. In run mode, it validates that the value is an absolute URI, has an absolute path of `/`, and has no fragment. Invalid values raise a `DistributedApplicationException`. Parameter values are concatenated as supplied, so include exactly one slash between the base URL and webhook path.

An external service with neither a URI nor a URL parameter raises an `InvalidOperationException`.

:::note
`host.docker.internal` is available on Docker Desktop. Other container
runtimes may require a different host address or additional networking
configuration. The API must listen on an interface reachable from the
container.
:::

## Filter webhook events

Both listener overloads accept an optional collection of event names. A nonempty collection adds `--events` with comma-separated values, such as `payment_intent.created,charge.succeeded`.

Omit `events`, or pass an empty collection, to add no event filter. The CLI then forwards all events available to that listener. The integration does not validate event names; use names supported by Stripe.

## Configure API keys

The required API-key parameter sets the container's `STRIPE_API_KEY` environment variable. No API key is generated by the integration.

The optional API-key configuration adds `--api-key <parameter-value>` to the CLI arguments. It can reuse the original parameter, as in the external-service example, or use another parameter. It does not replace the container environment variable configured when the resource was added.

Keep keys in the AppHost's secret store. Avoid putting real API keys in `appsettings.json`, code, or command examples.

## Pass the webhook signing secret to an application

Reference the Stripe resource from a destination that supports environment variables. TypeScript uses `withStripeReference`; C# uses the Stripe-specific `WithReference` overload. These APIs inject the signing secret under `STRIPE_WEBHOOK_SECRET` by default.

The destination can be a project, container, or another resource implementing `IResourceWithEnvironment`. The reference also adds a wait dependency when the destination implements `IResourceWithWaitSupport`.

To use another variable name, set `webhookSigningSecretEnvVarName`, as shown with `CUSTOM_STRIPE_SECRET` in the external-service example. Null or empty names are rejected.

### Environment-variable contract

| Value                   | Recipient               | Behavior                                                                        |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| `STRIPE_API_KEY`        | Stripe CLI container    | Comes from the required API-key parameter.                                      |
| `STRIPE_WEBHOOK_SECRET` | Referencing application | Default variable containing the signing secret extracted from CLI logs.         |
| Custom secret variable  | Referencing application | Replaces the default variable name when explicitly configured on the reference. |

The reference does not inject `ConnectionStrings__stripe`, a service-discovery URL, or the API key into the application. There is no client connection name to match to the resource name.

In a .NET application, read the default secret with `IConfiguration["STRIPE_WEBHOOK_SECRET"]`. Other languages can read the same variable from their process environment. If you customize the name in the AppHost, use that name in the application too.

The package does not include a consuming-app Stripe client integration, keyed-service registration, client configuration section, or client telemetry setup. Choose a Stripe SDK appropriate to your application and configure it independently.

### Signing-secret extraction and startup

Configuring either listener overload registers a log watcher. It looks for a case-insensitive `whsec_` prefix followed by letters, digits, underscores, or hyphens, and stores the first matching secret on the resource.

`StripeResource.WebhookSigningSecret` is a nullable, externally read-only property. The TypeScript export exposes it as `stripe.webhookSigningSecret.get()`. Reading it before the listener has emitted a secret can return `null`.

:::caution
The wait dependency is a resource-startup dependency, not a signing-secret
health check. The integration does not register a separate readiness check
that waits for a non-null secret. Check the application's configured secret
and listener logs if webhook verification fails. Do not log or expose the
signing secret.
:::

Use the listener's signing secret, not the API key or a different webhook endpoint's secret, to verify forwarded events. Verify the `Stripe-Signature` header against the raw request body using [Stripe's signature verification guidance](https://docs.stripe.com/events/manage-webhook-endpoints#signature-errors).

## Hosting integration health checks

The Stripe integration does not register a Stripe-specific health check. It does not probe the forwarding destination, verify delivery, or validate webhook signatures.

The CLI's container status and logs appear in the dashboard through Aspire's container-resource support. Diagnose authentication failures and forwarding errors there. Add appropriate health checks to the webhook application separately.

## Publishing and storage

The Stripe CLI resource is excluded from the application manifest. Use it for local development and configure deployed webhook endpoints separately in Stripe.

The integration has no Stripe-specific data-volume or bind-mount APIs and does not configure persistent storage. API-key authentication is supplied through the parameter rather than a mounted host CLI login configuration.

## Exported AppHost API

The following table covers the package's exported API surface. C# extension methods are in the `Aspire.Hosting` namespace; `StripeResource` is in `Aspire.Hosting.ApplicationModel`.

| C# API                                     | TypeScript API               | Parameters and behavior                                                                                                                                                             |
| ------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AddStripe`                                | `addStripe`                  | Required resource `name` and API-key parameter. Returns a Stripe container resource builder.                                                                                        |
| `WithListen` for `IResourceWithEndpoints`  | `withListen`                 | Required target resource; optional `webhookPath`, default `/webhooks/stripe`; optional `events`. Uses the first allocated endpoint.                                                 |
| `WithListen` for `ExternalServiceResource` | `withListenExternalService`  | Required external service; the same path and event defaults. Uses its URI or resolved URL parameter.                                                                                |
| `WithApiKey`                               | `withApiKey`                 | Required API-key parameter. Adds the `--api-key` argument.                                                                                                                          |
| `WithReference` for a Stripe source        | `withStripeReference`        | Required Stripe resource; optional `webhookSigningSecretEnvVarName`, default `STRIPE_WEBHOOK_SECRET`. Adds the secret environment variable and, where supported, a wait dependency. |
| `StripeResource.WebhookSigningSecret`      | `webhookSigningSecret.get()` | Nullable string populated from listener logs. Exposed for reading, with no public setter.                                                                                           |

The public `StripeResource(string name)` constructor creates the resource model. Prefer the builder API so the container image, API-key environment variable, and manifest exclusion are configured.

## See also

- [Get started with the Stripe integration](/integrations/cloud/stripe/stripe-get-started/)
- [Stripe CLI documentation](https://docs.stripe.com/stripe-cli)
- [Stripe webhook signature verification](https://docs.stripe.com/events/manage-webhook-endpoints#signature-errors)
- [Integration source and API exports](https://github.com/CommunityToolkit/Aspire/tree/main/src/CommunityToolkit.Aspire.Hosting.Stripe)
- [Stripe integration tests](https://github.com/CommunityToolkit/Aspire/tree/main/tests/CommunityToolkit.Aspire.Hosting.Stripe.Tests)
