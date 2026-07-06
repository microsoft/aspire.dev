---
title: Config File Description
---

Starting in Aspire 13.2, Aspire prefers a rooted `aspire.config.json` file for
project-scoped configuration. The CLI can also read and write user-scoped global
defaults.

- **Project-scoped configuration**

  Project-scoped settings live in a rooted `aspire.config.json` file. This
  replaces the older `.aspire/settings.json` model.

- **Global configuration**

  User-scoped defaults can be set with `aspire config set --global ...`.
  Project-scoped settings override global values when both are present.
  Project-specific values such as `appHost.path` must be configured locally in
  `aspire.config.json`.
