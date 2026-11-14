---
title: aspire config set command
description: Learn about the aspire config set command and its usage. This command sets an Aspire CLI config value by key name.
---

## Name

`aspire config set` - Set a configuration value.

## Synopsis

```bash title="Aspire CLI"
aspire config set <key> <value> [options]
```

## Description

The `aspire config set` command sets a config value by key name.

{% include_markdown "reference/cli/includes/config-file-description.md" %}

## Arguments

The following arguments are available:

- **`key`**

  The configuration key to set.

- **`value`**

  The configuration value to set.

## Options

The following options are available:

- **`-g, --global`**

  Set the configuration value in user-scoped global Aspire configuration
  instead of the rooted `aspire.config.json` file.
  Project-specific values such as `appHost.path` can't be set globally.

- {% include_markdown "reference/cli/includes/option-help.md" %}

- {% include_markdown "reference/cli/includes/option-log-level.md" %}

- {% include_markdown "reference/cli/includes/option-non-interactive.md" %}

- {% include_markdown "reference/cli/includes/option-nologo.md" %}

- {% include_markdown "reference/cli/includes/option-banner.md" %}

- {% include_markdown "reference/cli/includes/option-wait.md" %}

## Settings

The following config settings are available:

{% include_markdown "reference/cli/includes/config-settings-table.md" %}
