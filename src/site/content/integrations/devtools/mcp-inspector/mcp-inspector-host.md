---
title: Host MCP Inspector integration
description: Configure MCP Inspector in an Aspire AppHost, including inspected servers, ports, package managers, authentication, and health checks.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

{% image dark: "/assets/images/icons/mcp-inspector-icon.png", light: "/assets/images/icons/mcp-inspector-light-icon.png", alt: "MCP Inspector logo", width: 100, height: 100, zoomable: false, class: "float-inline-left icon" %}

This page describes the AppHost APIs in the MCP Inspector integration. Use them to add the MCP Inspector UI and connect it to one or more MCP server resources.

## Installation

Install the Community Toolkit package in your AppHost project:

{% install_package "CommunityToolkit.Aspire.Hosting.McpInspector" %}

The integration runs `@modelcontextprotocol/inspector` using `npx` by default. It uses the npm package version `0.17.2` unless you configure another version.

## Add an MCP Inspector resource

Call {% api "Aspire.Hosting.McpInspectorResourceBuilderExtensions.AddMcpInspector" %} to add the Inspector, then call {% api "Aspire.Hosting.McpInspectorResourceBuilderExtensions.WithMcpServer" %} with a server resource that exposes an HTTP endpoint:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const mcpServer = await builder.addProject(
  'mcp-server',
  '../McpServer/McpServer.csproj'
);

const inspector = await builder.addMcpInspector('inspector');
await inspector.withInspectedMcpServer(mcpServer);

await builder.build().run();
```

In TypeScript, the exported methods are named `addMcpInspector` and `withInspectedMcpServer`.
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mcpServer = builder.AddProject<Projects.McpServer>("mcp-server");
var inspector = builder.AddMcpInspector("inspector")
    .WithMcpServer(mcpServer);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The server resource must have at least one endpoint. The integration selects its `https` endpoint when available, otherwise its `http` endpoint, or the first endpoint if neither named endpoint exists. It writes the server details to the Inspector configuration and creates an `Inspecting` relationship in the Aspire dashboard.

## Configure inspected MCP servers

{% api "Aspire.Hosting.McpInspectorResourceBuilderExtensions.WithMcpServer" %}

accepts the following parameters:

- `mcpServer`: The endpoint-bearing MCP server resource.
- `isDefault`: Whether the Inspector should select this server by default. The default is `true`.
- `transportType`: The server transport. The default is `McpTransportType.StreamableHttp`.
- `path`: The MCP endpoint path. The default is `/mcp`.

The default server must be registered before the Inspector starts. Register additional servers with `isDefault: false`:

```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var primaryServer = builder.AddProject<Projects.PrimaryMcpServer>("primary-mcp-server");
var secondaryServer = builder.AddProject<Projects.SecondaryMcpServer>("secondary-mcp-server");

var inspector = builder.AddMcpInspector("inspector")
    .WithMcpServer(primaryServer)
    .WithMcpServer(secondaryServer, isDefault: false);

// After adding all resources, run the app...
builder.Build().Run();
```

If you use an endpoint path other than `/mcp`, set `path` to the route served by the MCP server:

```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mcpServer = builder.AddProject<Projects.McpServer>("mcp-server");
var inspector = builder.AddMcpInspector("inspector")
    .WithMcpServer(mcpServer, path: "/api/mcp");

// After adding all resources, run the app...
builder.Build().Run();
```

`McpTransportType.StreamableHttp` is the default transport. `McpTransportType.Sse` remains in the enum for compatibility but is obsolete because SSE transport is deprecated in the MCP specification.

## Configure ports and Inspector version

The client endpoint defaults to port `6274`, and the server proxy endpoint defaults to port `6277`. Set alternate ports and the Inspector package version in a TypeScript options object:

```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const mcpServer = await builder.addProject(
  'mcp-server',
  '../McpServer/McpServer.csproj'
);

const inspector = await builder.addMcpInspector('inspector', {
  clientPort: 6275,
  serverPort: 6278,
  inspectorVersion: '0.17.2',
});
await inspector.withInspectedMcpServer(mcpServer);

await builder.build().run();
```

In C#, configure `Aspire.Hosting.McpInspectorOptions` with an options object or delegate:

```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mcpServer = builder.AddProject<Projects.McpServer>("mcp-server");
var inspector = builder.AddMcpInspector("inspector", options =>
{
    options.ClientPort = 6275;
    options.ServerPort = 6278;
    options.InspectorVersion = "0.17.2";
})
    .WithMcpServer(mcpServer);

// After adding all resources, run the app...
builder.Build().Run();
```

The `McpInspectorOptions` type exposes:

- `ClientPort`: Port for the browser client. Defaults to `6274`.
- `ServerPort`: Port for the MCP server proxy. Defaults to `6277`.
- `InspectorVersion`: Version of the `@modelcontextprotocol/inspector` package. Defaults to `0.17.2`.
- `ProxyToken`: Aspire parameter used as the proxy authentication token. When unset, Aspire creates a random token parameter.

TypeScript AppHosts pass optional settings in an options object with `clientPort`, `serverPort`, `inspectorVersion`, and `proxyToken` properties.

## Choose a package manager

The integration uses `npx` by default. Call one of these methods to use a different package manager:

{% api "Aspire.Hosting.McpInspectorResourceBuilderExtensions.WithYarn" %}

,

{% api "Aspire.Hosting.McpInspectorResourceBuilderExtensions.WithPnpm" %}

, and

{% api "Aspire.Hosting.McpInspectorResourceBuilderExtensions.WithBun" %}

select Yarn, pnpm, and Bun, respectively. Install the selected package manager
on the machine running the AppHost.

```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mcpServer = builder.AddProject<Projects.McpServer>("mcp-server");
var inspector = builder.AddMcpInspector("inspector")
    .WithPnpm()
    .WithMcpServer(mcpServer);

// After adding all resources, run the app...
builder.Build().Run();
```

Yarn runs through `yarn dlx` and uses the `node-modules` linker. pnpm runs through `pnpm dlx`, and Bun runs through `bunx`.

## Proxy authentication

Aspire creates a random secret parameter named after the Inspector resource with the `-proxyToken` suffix, such as `inspector-proxyToken`. The dashboard URL for the Inspector UI includes the token as a query parameter so the client can authenticate to the server proxy.

To supply a token from an AppHost parameter, set `ProxyToken`:

```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mcpServer = builder.AddProject<Projects.McpServer>("mcp-server");
var proxyToken = builder.AddParameter("mcp-inspector-token", secret: true);

var inspector = builder.AddMcpInspector("inspector", options =>
{
    options.ProxyToken = proxyToken;
})
    .WithMcpServer(mcpServer);

// After adding all resources, run the app...
builder.Build().Run();
```

:::caution
The Inspector URL contains the proxy token. Treat the URL as sensitive and do
not expose it outside your development environment.
:::

## Hosting integration health checks

The integration adds health checks for both Inspector endpoints:

- The client endpoint is checked with an HTTP request to `/`.
- The server proxy endpoint is checked at `/config` with proxy authentication.

The health checks verify that the Inspector UI responds and that its server proxy configuration endpoint is available.

## AppHost API reference

The package exposes these AppHost APIs:

- {% api "Aspire.Hosting.McpInspectorResourceBuilderExtensions.AddMcpInspector" %}
  creates an Inspector resource. C# supports `McpInspectorOptions` and a
  configuration delegate. The positional C# overload is obsolete. TypeScript
  exposes `addMcpInspector(name, options?)`, where `options` can include
  `clientPort`, `serverPort`, `inspectorVersion`, and `proxyToken`.
- {% api "Aspire.Hosting.McpInspectorResourceBuilderExtensions.WithMcpServer" %}
  registers a server endpoint, transport, and MCP path. The TypeScript name is
  `withInspectedMcpServer`.
- {% api "Aspire.Hosting.McpInspectorResourceBuilderExtensions.WithYarn" %}
  ,
  {% api "Aspire.Hosting.McpInspectorResourceBuilderExtensions.WithPnpm" %}
  , and
  {% api "Aspire.Hosting.McpInspectorResourceBuilderExtensions.WithBun" %}
  select the package manager.
- `McpInspectorOptions` configures the client and proxy ports, Inspector
  version, and proxy token in C#.
- `McpInspectorResource` exposes `ClientEndpoint`, `ServerProxyEndpoint`, `McpServers`, `DefaultMcpServer`, and `ProxyTokenParameter`. Its endpoint names are `ClientEndpointName` (`client`) and `ServerProxyEndpointName` (`server-proxy`); `InspectorVersion` is `0.17.2`.
- `McpTransportType` provides `StreamableHttp` and the obsolete `Sse` value.

## See also

- [Get started with the MCP Inspector integration](/integrations/devtools/mcp-inspector/mcp-inspector-get-started/)
- [MCP Inspector documentation](https://github.com/modelcontextprotocol/inspector)
