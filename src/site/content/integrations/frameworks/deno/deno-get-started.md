---
title: Get started with Deno and Aspire
category: quickstart
description: Run Deno applications with Aspire, model them as AppHost resources, and configure their local development environment.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

{% image light: "/assets/images/icons/deno-light-icon.png", dark: "/assets/images/icons/deno-icon.png", alt: "Deno logo", width: 100, height: 100, zoomable: false, class: "float-inline-left icon" %}

The [Aspire Community Toolkit](https://github.com/CommunityToolkit/Aspire) Deno hosting integration adds Deno scripts and tasks to your [AppHost](/get-started/app-host/). Aspire starts the Deno process locally, shows it in the dashboard, and lets you connect it to the rest of your distributed application.

## How the integration works

The integration is a hosting integration: install it in the AppHost, then model each application with an {% api "Aspire.Hosting.DenoAppHostingExtensions.AddDenoApp" %} resource or an {% api "Aspire.Hosting.DenoAppHostingExtensions.AddDenoTask" %} resource. The resource runs the local `deno` command. You configure its working directory, permissions, arguments, endpoints, environment variables, and health checks in the AppHost.

`AddDenoApp` runs a script with `deno run`; `AddDenoTask` runs a task from `deno.json` or `deno.jsonc` with `deno task`. Both resource types participate in service discovery and can be referenced by other resources.

## Prerequisites

- Install [Deno](https://docs.deno.com/runtime/getting_started/installation/) and ensure `deno` is available on your `PATH`.
- Install the [Aspire CLI](/get-started/install-cli/) and meet the [Aspire prerequisites](/get-started/prerequisites/).
- Create an AppHost in C# or TypeScript.

## Add a Deno resource

Add `CommunityToolkit.Aspire.Hosting.Deno` to your AppHost. Then add a Deno task or script resource:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const app = await builder
  .addDenoTask('web', '../web', 'dev')
  .withHttpEndpoint({ env: 'PORT' })
  .withHttpHealthCheck({ path: '/' });

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var app = builder.AddDenoTask(
    name: "web",
    workingDirectory: "../web",
    taskName: "dev")
    .WithHttpEndpoint(env: "PORT")
    .WithHttpHealthCheck("/");

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

Have the Deno application listen on the endpoint environment variable. For example, grant the `--allow-env` permission when an application reads `PORT`.

{% linkbutton "/integrations/frameworks/deno/deno-host/", variant: "secondary", icon_placement: "end", icon: "right-arrow" %}
Set up Deno apps in the AppHost
{% endlinkbutton %}

## See also

- [Deno documentation](https://docs.deno.com/)
- [Deno AppHost API reference](/integrations/frameworks/deno/deno-host/)
- [Aspire integrations overview](/integrations/overview/)
