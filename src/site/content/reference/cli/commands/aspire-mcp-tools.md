---
title: aspire mcp tools command
description: Learn about the aspire mcp tools command and its usage. This command lists MCP tools exposed by running resources.
---

## Name

`aspire mcp tools` - List <abbr title="Model Context Protocol" data-tooltip-placement="top">MCP</abbr> tools exposed by running resources.

## Synopsis

```bash title="Aspire CLI"
aspire mcp tools [options]
```

## Description

The `aspire mcp tools` command lists the MCP tools exposed by resources in a running AppHost. Use it to discover which resources expose tools and which tool names you can pass to `aspire mcp call`.

When executed without the `--apphost` option, the command:

{% steps %}
1. Scans for all running AppHost processes.
2. If multiple AppHosts are running within the current directory scope, prompts you to select which one to target.
3. If only one AppHost is running in scope, connects to it directly.
4. If no in-scope AppHosts are found but out-of-scope AppHosts exist, displays all running AppHosts for selection.
{% endsteps %}

## Options

The following options are available:

- {% include_markdown "reference/cli/includes/option-project.md" %}

- **`--format <Json|Table>`**

  Output format. Use `Json` for machine-readable output suitable for scripting and automation. Defaults to `Table`.

- {% include_markdown "reference/cli/includes/option-help.md" %}

- {% include_markdown "reference/cli/includes/option-log-level.md" %}

- {% include_markdown "reference/cli/includes/option-non-interactive.md" %}

- {% include_markdown "reference/cli/includes/option-nologo.md" %}

- {% include_markdown "reference/cli/includes/option-banner.md" %}

- {% include_markdown "reference/cli/includes/option-wait.md" %}

## Examples

- List MCP tools for the current AppHost:

  ```bash title="Aspire CLI"
  aspire mcp tools
  ```

- Output the tool list as JSON:

  ```bash title="Aspire CLI"
  aspire mcp tools --format Json
  ```

- Target a specific AppHost project:

  ```bash title="Aspire CLI"
  aspire mcp tools --apphost './src/MyApp.AppHost/MyApp.AppHost.csproj'
  ```

## See also

- [aspire mcp](../aspire-mcp/)
- [aspire mcp call](../aspire-mcp-call/)
