---
title: aspire dashboard command
description: Learn about the aspire dashboard command and its usage. This command is used to manage the Aspire dashboard.
sidebar:
  badge: Preview
---

## Name

`aspire dashboard` - Manage the Aspire dashboard.

## Synopsis

```bash title="Aspire CLI"
aspire dashboard [command] [options]
```

## Description

The `aspire dashboard` command provides subcommands for managing the Aspire Dashboard. Use it to start a standalone dashboard instance that receives OpenTelemetry data (logs, traces, and metrics) from your applications.

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

| Command                                                  | Function                       |
| -------------------------------------------------------- | ------------------------------ |
| [`aspire dashboard run`](../aspire-dashboard-run/)       | Start the Aspire dashboard.    |

## See also

- [aspire dashboard run command](../aspire-dashboard-run/)
