---
title: JavaScript monorepo hosting extensions
description: Add Nx and Turborepo workspaces to Aspire with Community Toolkit decorators for package managers, child apps, and mapped ports.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

{% image light: "/assets/images/icons/nodejs-light-icon.png", dark: "/assets/images/icons/nodejs-icon.png", alt: "Node.js logo", width: 100, height: 100, zoomable: false, class: "float-inline-left icon" %}

The [📦 CommunityToolkit.Aspire.Hosting.JavaScript.Extensions](https://www.nuget.org/packages/CommunityToolkit.Aspire.Hosting.JavaScript.Extensions) package adds Nx and Turborepo monorepo support to the official [📦 Aspire.Hosting.JavaScript](https://www.nuget.org/packages/Aspire.Hosting.JavaScript) integration. Use the official package for individual Node.js, Vite, Next.js, and Bun apps; use this Community Toolkit package when an app belongs to an Nx or Turborepo workspace.

Start with an existing Nx or Turborepo workspace. Pass the workspace root as `workingDirectory`, then pass the Nx project name or Turborepo package name to `AddApp` / `addApp`. For Turborepo, the optional `filter` selects the package to run.

The extensions add:

- {% api "Aspire.Hosting.JavaScriptHostingExtensions.AddNxApp" %} for an Nx workspace.
- {% api "Aspire.Hosting.JavaScriptHostingExtensions.AddTurborepoApp" %} for a Turborepo workspace.
- `AddApp` / `addApp` for apps within those workspaces.
- `WithNpm`, {% api "Aspire.Hosting.McpInspectorResourceBuilderExtensions.WithYarn" %}, {% api "Aspire.Hosting.McpInspectorResourceBuilderExtensions.WithPnpm" %}, and {% api "Aspire.Hosting.McpInspectorResourceBuilderExtensions.WithBun" %} to select the workspace package manager.
- `WithPackageManagerLaunch` / `withPackageManagerLaunch` to launch the workspace through the selected package manager.
- {% api "Aspire.Hosting.JavaScriptHostingExtensions.WithMappedEndpointPort" %} to pass an Aspire endpoint's allocated port to a JavaScript app.

## Hosting integration

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```bash title="Terminal"
aspire add CommunityToolkit.Aspire.Hosting.JavaScript.Extensions
```

This command adds the package to `aspire.config.json` so Aspire can generate its TypeScript bindings.
{% endtab %}
{% tab "C#", id: "csharp" %}
{% install_package "CommunityToolkit.Aspire.Hosting.JavaScript.Extensions" %}
{% endtab %}
{% endtabs %}

## Add an Nx workspace app

`AddNxApp` / `addNxApp` models the workspace. Add each runnable project with `AddApp` / `addApp`, then decorate that child app with the official JavaScript resource APIs it needs.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts" twoslash
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const nx = await builder.addNxApp('nx-workspace', {
  workingDirectory: '../nx-demo',
});
await nx.withNpm(true);
await nx.withPackageManagerLaunch();

const blog = await nx.addApp('blog');
await blog.withHttpEndpoint({ env: 'PORT' });
await blog.withMappedEndpointPort();

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var nx = builder.AddNxApp("nx-workspace", "../nx-demo")
    .WithNpm(install: true)
    .WithPackageManagerLaunch();

nx.AddApp("blog")
    .WithHttpEndpoint(env: "PORT")
    .WithMappedEndpointPort();

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

## Add a Turborepo workspace app

Use `AddTurborepoApp` / `addTurborepoApp` for a Turborepo workspace. The optional `filter` selects the workspace package to run.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts" twoslash
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const turbo = await builder.addTurborepoApp('turborepo', {
  workingDirectory: '../turborepo-demo',
});
await turbo.withPnpm(true);
await turbo.withPackageManagerLaunch();

const web = await turbo.addApp('web', { filter: 'web' });
await web.withHttpEndpoint({ env: 'PORT' });
await web.withMappedEndpointPort();

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var turbo = builder.AddTurborepoApp("turborepo", "../turborepo-demo")
    .WithPnpm(install: true)
    .WithPackageManagerLaunch();

turbo.AddApp("web", filter: "web")
    .WithHttpEndpoint(env: "PORT")
    .WithMappedEndpointPort();

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

:::note[Use the official package for individual apps]
{% api "Aspire.Hosting.JavaScriptHostingExtensions.AddNodeApp" %}, {% api "Aspire.Hosting.JavaScriptHostingExtensions.AddViteApp" %}, {% api "Aspire.Hosting.JavaScriptHostingExtensions.AddNextJsApp" %}, and {% api "Aspire.Hosting.JavaScriptHostingExtensions.AddBunApp" %}, together with the generic `WithNpm`, `WithYarn`, `WithPnpm`, and `WithBun` decorators for individual JavaScript resources, are provided by `Aspire.Hosting.JavaScript`. They aren't APIs from this Community Toolkit package.
:::

## See also

- [JavaScript integration](/integrations/frameworks/javascript/)
- [Nx documentation](https://nx.dev/)
- [Turborepo documentation](https://turbo.build/repo/docs)
- [Aspire Community Toolkit](https://github.com/CommunityToolkit/Aspire)
- [Aspire integrations overview](/integrations/overview/)
