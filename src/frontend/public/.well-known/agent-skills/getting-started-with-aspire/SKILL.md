---
name: getting-started-with-aspire
description: "Use this skill when a developer asks how to begin using Aspire — installing the Aspire CLI, creating a new Aspire app, running it locally, or finding the authoritative docs, integration catalog, or API reference on aspire.dev. Use it for questions like \"how do I install aspire?\", \"how do I create a new aspire app?\", \"how do I run my aspire app?\", or \"where is the documentation for aspire?\". Do not use it for operating an existing Aspire AppHost (use the official `aspire` skill at github.com/microsoft/aspire/tree/main/.agents/skills/aspire), authoring AppHost code, or adding integrations to an existing app."
---

# Getting started with Aspire

[Aspire](https://aspire.dev) is the .NET cloud-native stack for building, running, debugging, and deploying distributed applications. The Aspire CLI (`aspire`) is the entry point for everything: scaffolding apps, running them locally, inspecting state, and deploying.

## When to use this skill

- The user is new to Aspire and wants to install the CLI.
- The user wants to scaffold a brand-new Aspire app.
- The user wants to know how to run the app they just created.
- The user is looking for the authoritative docs, integration catalog, or API reference.

## Don't use this skill for

- Operating an existing Aspire AppHost (resources, logs, traces, dashboard commands). That's the [official `aspire` skill](https://github.com/microsoft/aspire/tree/main/.agents/skills/aspire).
- Editing AppHost source code (C# or TypeScript) — consult the API reference on aspire.dev.

## Install the Aspire CLI

The official cross-platform installers are hosted on aspire.dev:

- **Windows (PowerShell):** `iex (irm https://aspire.dev/install.ps1)`
- **macOS / Linux (bash):** `curl -fsSL https://aspire.dev/install.sh | bash`

After install, verify with `aspire --version`. Do not install Aspire from NuGet/npm directly when the user wants the CLI — the install script is the supported path.

## Create a new Aspire app

```sh
aspire new
```

`aspire new` is **interactive**. It prompts for the template (for example `aspire-starter`, `apphost`, `apphost-ts`), the project name, the output location, and the language. It creates a subfolder for the new project, so run it from the parent directory where you want the project folder to live. Do not pass fabricated template flags; let the CLI prompt the user.

## Run the app

```sh
cd <project>
aspire start
```

`aspire start` launches the AppHost and the Aspire dashboard. Prefer `aspire start` over `dotnet run` for AppHosts — `aspire start` is the agent-friendly path; `aspire run` blocks the terminal.

## Where to learn more

- **Documentation hub:** <https://aspire.dev/docs/>
- **CLI reference:** <https://aspire.dev/reference/cli/>
- **Integration catalog:** <https://aspire.dev/integrations/>
- **C# API reference:** <https://aspire.dev/reference/api/csharp/>
- **TypeScript API reference:** <https://aspire.dev/reference/api/typescript/>
- **LLM-friendly corpus:** <https://aspire.dev/llms.txt>, <https://aspire.dev/llms-full.txt>
- **Per-page markdown:** every page on aspire.dev is also available as `<page>.md` (or via `Accept: text/markdown` content negotiation).
- **In-page search tool:** when running in a WebMCP-capable browser, the `search-aspire-docs` tool is registered on every aspire.dev page.
- **Source repository:** <https://github.com/microsoft/aspire>
