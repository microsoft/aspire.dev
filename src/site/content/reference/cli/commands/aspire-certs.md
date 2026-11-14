---
title: aspire certs command
seoTitle: aspire certs command reference for the Aspire CLI
description: Learn about the aspire certs command and its usage. This command manages HTTPS development certificates.
---

## Name

`aspire certs` - Manage HTTPS development certificates.

## Synopsis

```bash title="Aspire CLI"
aspire certs [command] [options]
```

## Description

The `aspire certs` command manages the HTTPS development certificates used by Aspire during local development. Use it when you want to trust the development certificate explicitly or remove existing development certificates while troubleshooting HTTPS issues.

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

| Command                                           | Function                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| [`aspire certs clean`](../aspire-certs-clean/)    | Remove all HTTPS development certificates.                       |
| [`aspire certs trust`](../aspire-certs-trust/)    | Trust the HTTPS development certificate, creating one if needed. |

## Examples

- Trust the Aspire HTTPS development certificate:

  ```bash title="Aspire CLI"
  aspire certs trust
  ```

- Remove all local HTTPS development certificates:

  ```bash title="Aspire CLI"
  aspire certs clean
  ```

## See also

- [aspire doctor](../aspire-doctor/)
- [aspire run](../aspire-run/)
