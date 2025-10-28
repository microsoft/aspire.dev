---
title: Project Search Logic
---

The Aspire CLI uses the following logic, in order, to determine which AppHost project to process:

- The `--project` option.

  This option specifies the path to a project to process.

- The `.aspire/settings.json` config file.

  If the config file path exists in the current directory, it's used. If not, the CLI walks up the directory structure looking for the config file. If it finds a config file, it reads the `appHostPath` setting value as the project to process.

- Searches the current directory and subdirectories.

  Starting in the current directory, the CLI gathers all AppHost projects from that directory and below. If a single project is discovered, it's automatically selected. If multiple projects are discovered, they're printed to the terminal for the user to manually select one of the projects.
  
  Once a project is selected, either automatically or manually, the path to the project is stored in the `.aspire/settings.json` config file.
