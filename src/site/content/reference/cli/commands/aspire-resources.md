---
title: aspire resources command
description: Learn about the aspire resources command alias and migrate to the primary aspire describe command.
---

## Name

`aspire resources` - Alias for `aspire describe`.

## Description

:::caution[Command renamed]
`aspire resources` is a backward-compatible alias. Use
[`aspire describe`](/reference/cli/commands/aspire-describe/) as the
primary command name.
:::

The `aspire resources` command was renamed to `aspire describe`. Existing scripts that use `aspire resources` continue to work.

The `--watch` flag was also renamed to `--follow` (`-f`). Use `aspire describe --follow` for continuous updates.

## See also

- [aspire describe command](/reference/cli/commands/aspire-describe/)
