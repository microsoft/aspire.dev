---
title: Config Settings Table
---

| Logical key                            | Stored in `aspire.config.json` as      | Description                                                                                                                                         |
| -------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appHost.path`                         | `appHost.path`                         | Project-scoped path to the default AppHost project. This setting must be configured in the local `aspire.config.json` file.                         |
| `channel`                              | `channel`                              | Default Aspire channel used by channel-aware commands such as `aspire new`, `aspire init`, and `aspire update`.                                     |
| `features.defaultWatchEnabled`         | `features.defaultWatchEnabled`         | Enable or disable watch mode by default when running Aspire applications for automatic restarts on file changes.                                    |
| `features.execCommandEnabled`          | `features.execCommandEnabled`          | Enable or disable the legacy `aspire exec` command for executing commands inside running resources.                                                 |
| `features.experimentalPolyglot:go`     | `features.experimentalPolyglot:go`     | Enable or disable experimental Go language support for polyglot Aspire applications.                                                                |
| `features.experimentalPolyglot:java`   | `features.experimentalPolyglot:java`   | Enable or disable experimental Java language support for polyglot Aspire applications.                                                              |
| `features.experimentalPolyglot:python` | `features.experimentalPolyglot:python` | Enable or disable experimental Python language support for polyglot Aspire applications.                                                            |
| `features.experimentalPolyglot:rust`   | `features.experimentalPolyglot:rust`   | Enable or disable experimental Rust language support for polyglot Aspire applications.                                                              |
| `features.showAllTemplates`            | `features.showAllTemplates`            | Show all available templates, including experimental ones, in `aspire new` and `aspire init`.                                                       |
| `features.showDeprecatedPackages`      | `features.showDeprecatedPackages`      | Show or hide deprecated packages in `aspire add` search results.                                                                                    |
| `features.updateNotificationsEnabled`  | `features.updateNotificationsEnabled`  | Enable or disable Aspire CLI update notifications.                                                                                                  |
