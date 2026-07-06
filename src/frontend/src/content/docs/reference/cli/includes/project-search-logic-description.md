---
title: Project Search Logic
---

The Aspire CLI uses the following logic, in order, to determine which AppHost
project to process:

- The `--apphost` option.

  This option specifies the path to the Aspire AppHost project file to process.

- The rooted `aspire.config.json` file.

  If the rooted config exists in the current directory, it's used. If not, the
  CLI walks up the directory structure looking for it. If Aspire finds the
  rooted config, it uses the recorded AppHost information to determine which
  project to process. Legacy `.aspire/settings.json` files are still read during
  migration.

- Searches the current directory and subdirectories.

  Starting in the current directory, the CLI gathers all AppHost projects from that directory and below. If a single project is discovered, it's automatically selected. If multiple projects are discovered, they're printed to the terminal for the user to manually select one of the projects.

  Once a project is selected, either automatically or manually, Aspire records
  that selection in the rooted configuration so later commands can reuse it.
