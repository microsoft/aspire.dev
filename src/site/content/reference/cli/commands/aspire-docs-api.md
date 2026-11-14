---
title: aspire docs api command
description: Learn about the aspire docs api command and its usage. This command group is used to browse, search, and retrieve Aspire API reference material from aspire.dev.
---

## Name

`aspire docs api` - Browse, search, and retrieve Aspire API reference documentation from aspire.dev.

## Synopsis

```bash title="Aspire CLI"
aspire docs api [command] [options]
```

## Description

The `aspire docs api` command group provides access to the Aspire API reference documentation published on [aspire.dev](https://aspire.dev). Unlike the [`aspire docs`](../aspire-docs/) commands that work with prose documentation pages, the `aspire docs api` commands are backed by the API reference index built from `aspire.dev`'s sitemap.

You can browse the API catalog by scope, search for specific types or members by keyword, or retrieve the full reference content for a specific API entry. Both C# and TypeScript API hierarchies are supported.

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

| Command                                                        | Status | Function                                                      |
| -------------------------------------------------------------- | ------ | ------------------------------------------------------------- |
| [`aspire docs api list <scope>`](../aspire-docs-api-list/)     | Stable | Browse API reference entries under a given scope.             |
| [`aspire docs api search <query>`](../aspire-docs-api-search/) | Stable | Search Aspire API reference by keyword.                       |
| [`aspire docs api get <id>`](../aspire-docs-api-get/)          | Stable | Get the full content of an API reference entry by identifier. |

## See also

- [aspire docs command](../aspire-docs/)
- [aspire docs api list command](../aspire-docs-api-list/)
- [aspire docs api search command](../aspire-docs-api-search/)
- [aspire docs api get command](../aspire-docs-api-get/)
