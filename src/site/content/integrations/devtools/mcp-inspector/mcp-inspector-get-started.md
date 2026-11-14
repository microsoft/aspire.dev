---
title: MCP Inspector integration
description: Learn how to run MCP Inspector with Aspire to inspect and debug Model Context Protocol servers during development.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

{% image dark: "/assets/images/icons/mcp-inspector-icon.png", light: "/assets/images/icons/mcp-inspector-light-icon.png", alt: "MCP Inspector logo", width: 100, height: 100, zoomable: false, class: "float-inline-left icon" %}

[MCP Inspector](https://github.com/modelcontextprotocol/inspector) is a development tool for testing and debugging Model Context Protocol (MCP) servers. The Aspire Community Toolkit integration adds it to your AppHost and configures it to inspect one or more HTTP MCP server resources.

Use the Inspector UI to connect to the configured server and test its MCP interactions. Aspire starts the Inspector alongside your application and provides a dashboard link to its client endpoint.

## Why use the MCP Inspector integration?

- Run the Inspector as an Aspire-managed resource beside your MCP server.
- Configure server endpoints, transport types, paths, and a default server from the AppHost.
- Use the Aspire dashboard to open the Inspector and monitor its health.

## How it works

The AppHost starts your MCP server and the Inspector process. Calling `WithMcpServer` registers the server endpoint with the Inspector and creates a resource relationship in the dashboard. The Inspector has a browser client endpoint and a server proxy endpoint. Aspire configures a proxy authentication token and adds it to the Inspector's dashboard URL.

## Prerequisites

- An MCP server resource with at least one HTTP endpoint.
- Node.js and npm available on the machine running the AppHost. To use Yarn, pnpm, or Bun instead, install that package manager as well.

## Add MCP Inspector to the AppHost

Install the hosting integration package in your AppHost project:

{% install_package "CommunityToolkit.Aspire.Hosting.McpInspector" %}

Add your MCP server and MCP Inspector as AppHost resources:

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

The server project must expose an HTTP endpoint. The integration uses the `https` endpoint when available, otherwise it selects `http`, then the first endpoint on the server resource. `WithMcpServer` defaults to Streamable HTTP and the `/mcp` path.

:::note
The Inspector UI URL includes a proxy authentication token. Treat the URL as a
secret and do not share it outside your development environment.
:::

## Next steps

- [Configure the MCP Inspector resource](/integrations/devtools/mcp-inspector/mcp-inspector-host/)
- [MCP Inspector documentation](https://github.com/modelcontextprotocol/inspector)
- [Aspire AppHost overview](/get-started/app-host/)
