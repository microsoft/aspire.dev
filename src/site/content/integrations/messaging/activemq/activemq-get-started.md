---
title: Get started with ActiveMQ integration
description: Run ActiveMQ Classic or Artemis from an Aspire AppHost and configure credentials, broker ports, and the web console for local development.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

{% image "/assets/images/icons/activemq-icon.png", alt: "ActiveMQ logo", width: 100, height: 100, fit: "contain", style: "float: left; margin-right: 1rem;", zoomable: false %}

Use the ActiveMQ integration from the [Aspire Community Toolkit](https://github.com/CommunityToolkit/Aspire) to run ActiveMQ Classic or ActiveMQ Artemis as a container resource. Both brokers expose a TCP endpoint that you can reference from application resources.

## Prerequisites

- An Aspire AppHost project
- An ActiveMQ client library compatible with the broker you choose

## Add ActiveMQ to your AppHost

Install the [📦 CommunityToolkit.Aspire.Hosting.ActiveMQ](https://www.nuget.org/packages/CommunityToolkit.Aspire.Hosting.ActiveMQ) package in the AppHost:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```bash title="Terminal"
aspire add CommunityToolkit.Aspire.Hosting.ActiveMQ
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```bash title="Terminal"
aspire add CommunityToolkit.Aspire.Hosting.ActiveMQ
```
{% endtab %}
{% endtabs %}

Choose either ActiveMQ Classic or Artemis in your AppHost. See [Set up ActiveMQ in the AppHost](../activemq-host/) for credentials, the web console, schemes, and storage options.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();
const username = await builder.addParameter('activemq-user', {
  value: 'admin',
  publishValueAsDefault: true,
});
const password = await builder.addParameter('activemq-password', {
  value: 'admin',
  secret: true,
});

const broker = await builder.addActiveMQ('activemq', {
  userName: username,
  password,
});
await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);
var username = builder.AddParameter("activemq-user", "admin");
var password = builder.AddParameter("activemq-password", secret: true);

var broker = builder.AddActiveMQ("activemq", username, password);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The package also provides `AddActiveMQArtemis` and `addActiveMQArtemis` for the Artemis image. A connection name such as `activemq` is used when another resource references the broker.

## See also

- [Set up ActiveMQ in the AppHost](../activemq-host/)
- [ActiveMQ Classic documentation](https://activemq.apache.org/components/classic/)
- [ActiveMQ Artemis documentation](https://activemq.apache.org/components/artemis/)
- [CommunityToolkit.Aspire.Hosting.ActiveMQ](https://github.com/CommunityToolkit/Aspire/tree/main/src/CommunityToolkit.Aspire.Hosting.ActiveMQ)
