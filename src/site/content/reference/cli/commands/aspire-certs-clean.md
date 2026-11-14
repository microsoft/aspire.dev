---
title: aspire certs clean command
description: Learn about the aspire certs clean command and its usage. This command removes all HTTPS development certificates.
---

## Name

`aspire certs clean` - Remove all HTTPS development certificates.

## Synopsis

```bash title="Aspire CLI"
aspire certs clean [options]
```

## Description

The `aspire certs clean` command removes all HTTPS development certificates. Use it when you want to reset local certificate state before trusting a new certificate or while troubleshooting HTTPS-related local development issues.

:::note
On Linux, if `certutil` is unavailable, NSS certificate database cleanup for
Firefox and Chromium browsers is skipped, but `aspire certs clean` still
completes cleanup for the remaining certificate stores. Run `aspire doctor`
to check whether `certutil` is installed. Install it from your
distribution's NSS tools package, for example `libnss3-tools`, to enable
browser certificate trust cleanup.
:::

## Options

The following options are available:

- {% include_markdown "reference/cli/includes/option-help.md" %}

- {% include_markdown "reference/cli/includes/option-log-level.md" %}

- {% include_markdown "reference/cli/includes/option-non-interactive.md" %}

- {% include_markdown "reference/cli/includes/option-nologo.md" %}

- {% include_markdown "reference/cli/includes/option-banner.md" %}

- {% include_markdown "reference/cli/includes/option-wait.md" %}

## Examples

- Remove all HTTPS development certificates:

  ```bash title="Aspire CLI"
  aspire certs clean
  ```

## See also

- [aspire certs](../aspire-certs/)
- [aspire certs trust](../aspire-certs-trust/)
