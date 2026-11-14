---
title: Aspire CLI overview
description: Overview of the Aspire CLI, the cross-platform terminal tool for creating, running, and deploying Aspire AppHost projects from your shell.
seoTitle: 'Aspire CLI overview: commands, options, and workflows'
---

The Aspire CLI (`aspire` command) is a cross-platform tool that provides command-line functionality to create, manage, run, and publish multi-language Aspire projects. Use the Aspire CLI to streamline development workflows and coordinate services for distributed applications.

:::caution[Use trusted repositories]
Only run Aspire CLI commands from repositories and directories that you trust.
:::

The Aspire CLI is an interactive-first experience.

{% card_grid %}
{% link_card href: "/get-started/install-cli/", title: "Install the Aspire CLI", icon: "download", description: "Get started by installing the Aspire CLI on your machine." %}

{% link_card href: "../install-script/", title: "Review install script reference", icon: "settings", description: "Explore the details of the install script with reference." %}
{% endcard_grid %}

## Use templates

The `aspire new` command is an interactive-first CLI experience, and is used to create one or more Aspire projects. As part of creating a project, Aspire CLI ensures that the latest Aspire project templates are installed into the `dotnet` system.

Use the `aspire new` command to create an Aspire project from a list of templates. Once a template is selected, the name of the project is set, and the output folder is chosen, `aspire` downloads the latest templates and generates one or more projects.

{% learnmore %}
[Command reference: `aspire new`](../commands/aspire-new/)
{% endlearnmore %}

While command-line parameters can be used to automate the creation of an Aspire project, the Aspire CLI is an interactive-first experience.

## Initialize existing repos and workspaces

The `aspire init` command adds Aspire support to an existing repo or workspace. It can scaffold a C# or TypeScript AppHost, making it easy to adopt Aspire incrementally without creating an entirely new project structure.

The command analyzes your existing repo or workspace and creates the AppHost and initial configuration needed for the path you choose.

{% learnmore %}
[Command reference: `aspire init`](../commands/aspire-init/)
{% endlearnmore %}

## Start the Aspire AppHost

The `aspire run` command runs the AppHost project in development mode, which configures the Aspire environment, builds and starts resources defined by the AppHost, launches the web dashboard, and prints a list of endpoints.

When `aspire run` starts, it searches the current directory for an AppHost project. If a project isn't found, the subdirectories are searched until one is found. If no AppHost project is found, Aspire stops. Once a project is found, Aspire CLI takes the following steps:

{% steps %}
1. Installs or verifies that Aspire's local hosting certificates are installed and trusted.
1. Builds the AppHost project and its resources.
1. Starts the AppHost and its resources.
1. Starts the dashboard.
{% endsteps %}

The following snippet is an example of the output displayed by the `aspire run` command:

```bash title="Aspire CLI"
Dashboard:  https://localhost:17244/login?t=9db79f2885dae24ee06c6ef10290b8b2

    Logs:  /home/vscode/.aspire/cli/logs/apphost-5932-2025-08-25-18-37-31.log

        Press CTRL+C to stop the apphost and exit.
```

{% learnmore %}
[Command reference: `aspire run`](../commands/aspire-run/)
{% endlearnmore %}

## Add integrations

The `aspire add` command is an easy way to add official integration packages to your AppHost project. Use this as an alternative to a NuGet search through your IDE. You can run `aspire add <name|id>` if you know the name or NuGet ID of the integration package. If you omit a name or ID, the tool provides a list of packages to choose from. If you provide a partial name or ID, the tool filters the list of packages with items that match the provided value.

{% learnmore %}
[Command reference: `aspire add`](../commands/aspire-add/)
{% endlearnmore %}

## Update Aspire packages

The `aspire update` command helps you keep your Aspire projects current by automatically detecting and updating outdated packages and templates. It finds outdated Aspire NuGet packages while respecting channel configurations and intelligently handles complex dependency graphs.

The command validates package compatibility before applying changes and provides detailed output showing which packages were updated.

{% learnmore %}
[Command reference: `aspire update`](../commands/aspire-update/)
{% endlearnmore %}

## Publish Aspire applications

The `aspire publish` command publishes resources by serializing them to disk. When this command is run, Aspire executes the publish pipeline step, and any dependent steps, registered in the app model. These steps serialize resources so that they can be consumed by deployment tools.

Some integrations automatically register publishing pipeline steps for you, for example:

- `AzureEnvironmentResource` generates Bicep assets
- `DockerComposeEnvironmentResource` generates docker-compose YAML
- `KubernetesEnvironmentResource` generates Kubernetes Helm charts

{% learnmore %}
[Command reference: `aspire publish`](../commands/aspire-publish/)
{% endlearnmore %}

## Deploy Aspire solutions

The `aspire deploy` command invokes the `deploy` pipeline step and any dependent steps (such as the `publish` step) registered in the app model.

:::tip
Consider this a good way to deploy your Aspire solution to a staging or
testing environment.
:::

{% learnmore %}
[Command reference: `aspire deploy`](../commands/aspire-deploy/)
{% endlearnmore %}

## Destroy deployed environments

The `aspire destroy` command tears down an environment that was previously deployed with `aspire deploy`. It completes the deployment lifecycle: `aspire publish` → `aspire deploy` → `aspire destroy`.

Each compute environment implements its own destroy step with contextual confirmation before removing resources. Pass `--yes` to skip the confirmation prompt in automated environments.

{% learnmore %}
[Command reference: `aspire destroy`](../commands/aspire-destroy/)
{% endlearnmore %}

## Execute pipeline steps

The `aspire do` command executes a specific pipeline step and its dependencies in your Aspire AppHost. This provides fine-grained control over the orchestration pipeline, allowing you to run individual steps of the deployment or build process without executing the entire pipeline.

Use this command to test individual pipeline stages during development or to execute only the dependencies needed for a particular step.

{% learnmore %}[Command reference: `aspire do`](../commands/aspire-do/){% endlearnmore %}

## Restore AppHost dependencies

The `aspire restore` command restores dependencies and generates the SDK code your AppHost needs before you build, run, or automate the application. Use it as an explicit restore step in CI/CD pipelines or after changing integrations and resources.

{% learnmore %}
[Command reference: `aspire restore`](../commands/aspire-restore/)
{% endlearnmore %}

## Start the AppHost in the background

The `aspire start` command starts an AppHost in the background and returns once it is running. Use it when you want a detached apphost without staying attached to the interactive `aspire run` session.

{% learnmore %}
[Command reference: `aspire start`](../commands/aspire-start/)
{% endlearnmore %}

## Stop a running AppHost

The `aspire stop` command stops a running Aspire AppHost process. When multiple AppHosts are running, the command prompts you to select which one to stop, or you can use `--all` to stop them all at once.

{% learnmore %}
[Command reference: `aspire stop`](../commands/aspire-stop/)
{% endlearnmore %}

## List running AppHosts

The `aspire ps` command lists all running Aspire AppHost processes. The output includes the AppHost project path, process IDs, and dashboard URLs for each running instance. Use `--format Json` for machine-readable output suitable for scripting and automation.

{% learnmore %}[Command reference: `aspire ps`](../commands/aspire-ps/){% endlearnmore %}

## Wait for resource readiness

The `aspire wait` command blocks until a named resource within a running AppHost reaches a target status such as `healthy`, `up`, or `down`. This is useful for CI/CD pipelines and automation workflows where you need to wait for resources to be ready after starting an AppHost in the background.

{% learnmore %}
[Command reference: `aspire wait`](../commands/aspire-wait/)
{% endlearnmore %}

## Run resource commands

The `aspire resource` command executes a command exposed by a resource in a running AppHost, such as `start`, `stop`, or `restart`. Use it when you need to manage an individual resource directly from the terminal.

{% learnmore %}
[Command reference: `aspire resource`](../commands/aspire-resource/)
{% endlearnmore %}

## Inspect runtime data

Use `aspire describe`, `aspire logs`, and `aspire export` to inspect resources, stream logs, and package telemetry and resource data from a running AppHost. Use `aspire otel` to view OpenTelemetry data—structured logs, distributed trace spans, and trace summaries—collected by the Aspire Dashboard directly from the terminal. Together, these commands give you a CLI-first workflow for monitoring and collecting diagnostics.

{% learnmore %}
[Command reference: `aspire describe`](../commands/aspire-describe/), [Command
reference: `aspire logs`](../commands/aspire-logs/), [Command reference:
`aspire export`](../commands/aspire-export/), and [Command reference: `aspire
otel`](../commands/aspire-otel/)
{% endlearnmore %}

Use the `--search` option with `aspire logs` and `aspire otel` commands to filter output by matching text against log content and trace/span fields. Search supports free-text fragments, structured `field:value` qualifiers, negation, and comparison operators.

{% learnmore %}[Search and filter](../search-filter/){% endlearnmore %}

## Diagnose and prepare the environment

Use `aspire doctor` to verify that your environment is ready for Aspire development, and `aspire certs` to manage the HTTPS development certificates used by local resources and dashboards.

{% learnmore %}
[Command reference: `aspire doctor`](../commands/aspire-doctor/) and [Command
reference: `aspire certs`](../commands/aspire-certs/)
{% endlearnmore %}

## Work with <abbr title="Model Context Protocol" data-tooltip-placement="top">MCP</abbr> tools

The `aspire mcp` command lets you list and call MCP tools exposed by running resources. If you need to start the MCP server used by compatible AI agents, use `aspire agent mcp`.

{% learnmore %}
[Command reference: `aspire mcp`](../commands/aspire-mcp/) and [Command
reference: `aspire agent mcp`](../commands/aspire-agent-mcp/)
{% endlearnmore %}

## Manage CLI configuration

The `aspire config` command lets you manage Aspire CLI configuration settings. Use it to `list`, `get`, `set`, or `delete` configuration values that control CLI behavior. This command is also used to toggle features on or off.

{% learnmore %}
[Command reference: `aspire config`](../commands/aspire-config/)
{% endlearnmore %}

## Manage secrets

The `aspire secret` command manages user secrets for an Aspire AppHost project. User secrets provide a safe way to store sensitive configuration values—such as passwords, API keys, and connection strings—outside of your project files during local development.

Aspire uses user secrets to persist values that resources need across restarts, such as auto-generated passwords for database containers.

{% learnmore %}
[Command reference: `aspire secret`](../commands/aspire-secret/)
{% endlearnmore %}

## Browse documentation

The `aspire docs` command lets you browse and search the official Aspire documentation directly from the terminal. You can list all available pages, search for specific topics by keyword, or retrieve the full content of a page by its slug—all without leaving your development workflow.

{% learnmore %}
[Command reference: `aspire docs`](../commands/aspire-docs/)
{% endlearnmore %}

## Manage CLI cache

The `aspire cache` command manages the disk cache used by the Aspire CLI. The CLI caches data such as downloaded templates, NuGet package information, and other temporary files to improve performance and reduce network requests.

Use `aspire cache clear` to remove all cached data. This is useful when troubleshooting CLI issues, freeing up disk space, or ensuring fresh data after updating the CLI.

{% learnmore %}
[Command reference: `aspire cache`](../commands/aspire-cache/)
{% endlearnmore %}
