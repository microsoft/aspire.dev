---
title: Resource command
description: A named operation attached to a resource that lets a developer trigger work such as clearing a cache or seeding data.
aliases: [custom resource command]
topics: [dashboard, foundations]
context: Attach a clear-cache command to a Redis resource so a developer can reset cached data without restarting the entire app.
related: [resource, aspire-dashboard, apphost]
resources:
  - title: Add custom resource commands
    href: /fundamentals/custom-resource-commands/
  - title: Invoke resource HTTP endpoints as commands
    href: /fundamentals/http-commands/
legacyAnchors: []
---
A resource command exposes an operation on a resource through Aspire's developer tools. Its implementation might invoke application logic, make an HTTP request, or run a process.

Examples include applying database migrations, seeding test data, and clearing a cache. Commands can report progress and results, and their availability can depend on the resource's state.

A resource command is not a top-level Aspire CLI command. It belongs to a particular resource in the application model, even when you invoke it through the CLI.
