---
title: aspire agent command
seoTitle: aspire agent command reference for the Aspire CLI
description: Learn about the aspire agent command and its usage. This command driver manages AI agent integrations, Aspire skills, and MCP (Model Context Protocol) server operations.
---

## Name

`aspire agent` - Manage AI agent integrations.

## Synopsis

```bash title="Aspire CLI"
aspire agent [command] [options]
```

## Description

The `aspire agent` command manages AI agent integrations for Aspire. This includes initializing agent environment configuration, installing Aspire skills, and starting the <abbr title="Model Context Protocol" data-tooltip-placement="top">MCP</abbr> server. The MCP server enables AI assistants and development tools to interact with your Aspire AppHost, providing capabilities such as resource management, diagnostics, and observability.

## Options

The following options are available:

- {% include_markdown "reference/cli/includes/option-help.md" %}

- {% include_markdown "reference/cli/includes/option-log-level.md" %}

- {% include_markdown "reference/cli/includes/option-non-interactive.md" %}

- {% include_markdown "reference/cli/includes/option-nologo.md" %}

- {% include_markdown "reference/cli/includes/option-banner.md" %}

- {% include_markdown "reference/cli/includes/option-wait.md" %}

## Commands

The following commands are available:

| Command                                      | Status | Function                                                           |
| -------------------------------------------- | ------ | ------------------------------------------------------------------ |
| [`aspire agent mcp`](../aspire-agent-mcp/)   | Stable | Start the MCP (Model Context Protocol) server.                     |
| [`aspire agent init`](../aspire-agent-init/) | Stable | Initialize AI agent configuration for detected agent environments. |

## See also

- [aspire agent mcp command](../aspire-agent-mcp/)
- [aspire agent init command](../aspire-agent-init/)
