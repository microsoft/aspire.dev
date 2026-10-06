# Integration Documentation

## File Location

Place integration docs in the appropriate category folder under `src/frontend/src/content/docs/integrations/`:

| Category        | Folder             | Examples                        |
| --------------- | ------------------ | ------------------------------- |
| AI/ML           | `ai/`              | Ollama, Azure OpenAI            |
| Caching         | `caching/`         | Redis, Garnet, Valkey           |
| Cloud           | `cloud/`           | Azure, AWS services             |
| Compute         | `compute/`         | Docker, Kubernetes              |
| Databases       | `databases/`       | PostgreSQL, SQL Server, MongoDB |
| Frameworks      | `frameworks/`      | Python, Rust, Orleans           |
| Messaging       | `messaging/`       | RabbitMQ, Kafka                 |
| Observability   | `observability/`   | OpenTelemetry, Prometheus       |
| Reverse Proxies | `reverse-proxies/` | YARP                            |
| Security        | `security/`        | Keycloak                        |

## Integration Documentation Structure

### For Hosting-Only Integrations

````mdx
---
title: [Technology] integration
description: Learn how to use the [Technology] integration with Aspire.
---

import { Aside, Tabs, TabItem } from "@astrojs/starlight/components";
import InstallPackage from "@components/InstallPackage.astro";
import { Image } from "astro:assets";

import techIcon from "@assets/icons/technology.svg";

<Image
  src={techIcon}
  alt="Technology logo"
  width={100}
  height={100}
  fit="contain"
  style="float: left; margin-right: 1rem;"
  data-zoom-off
/>

Brief description of the technology and what the integration enables.

## Hosting integration

<InstallPackage packageName="Aspire.Hosting.Technology" />

### Add [Technology] resource

<Tabs syncKey='aspire-lang'>
<TabItem id='typescript' label='TypeScript'>

```typescript title="apphost.mts"
import { createBuilder } from "./.aspire/modules/aspire.mjs";

const builder = await createBuilder();

const tech = await builder.addTechnology("tech");

await builder.build().run();
```

</TabItem>
<TabItem id='csharp' label='C#'>

```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var tech = builder.AddTechnology("tech");

// After adding all resources, run the app...
builder.Build().Run();
```

</TabItem>
</Tabs>

### Configuration options

Describe available configuration methods and options.

## See also

- [Official Technology documentation](https://...)
- [Related Aspire documentation](/path/to/related/)
````

### For Hosting + Client Integrations

Include both hosting and client sections:

````mdx
## Hosting integration

<InstallPackage packageName="Aspire.Hosting.Technology" />

### Add [Technology] resource

<Tabs syncKey='aspire-lang'>
<TabItem id='typescript' label='TypeScript'>

```typescript title="apphost.mts"
import { createBuilder } from "./.aspire/modules/aspire.mjs";

const builder = await createBuilder();

const tech = await builder.addTechnology("tech");

const api = await builder.addProject("api", "../Api/Api.csproj");
await api.withReference(tech);

await builder.build().run();
```

</TabItem>
<TabItem id='csharp' label='C#'>

```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var tech = builder.AddTechnology("tech");

builder.AddProject<Projects.Api>("api")
    .WithReference(tech);

builder.Build().Run();
```

</TabItem>
</Tabs>

### Hosting integration health checks

[Health check information if applicable...]

## Client integration

<InstallDotNetPackage packageName="Aspire.Technology" />

### Add [Technology] client

```csharp title="C# — Program.cs"
builder.AddTechnologyClient("tech");
```

### Add keyed [Technology] client

```csharp title="C# — Program.cs"
builder.AddKeyedTechnologyClient("tech");
```

For more information, see [.NET dependency injection: Keyed services](https://learn.microsoft.com/dotnet/core/extensions/dependency-injection#keyed-services).

### Configuration

#### Connection strings

The connection name must match the resource name defined in the AppHost.

#### Configuration providers

```json title="JSON — appsettings.json"
{
  "Aspire": {
    "Technology": {
      "myconnection": {
        "Option1": "value"
      }
    }
  }
}
```

### Client integration health checks

[Health check information...]

### Observability and telemetry

[Logging and tracing information...]

## See also

- [Official documentation](https://...)
````

## Community Toolkit Integrations

For integrations from the [Aspire Community Toolkit](https://github.com/CommunityToolkit/Aspire), add the badge at the top:

```mdx
import Badge from "@astrojs/starlight/components/Badge.astro";

<Badge text="⭐ Community Toolkit" variant="tip" size="large" />
```
