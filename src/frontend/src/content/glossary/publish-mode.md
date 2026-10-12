---
title: Publish mode
description: The AppHost execution mode that produces deployment artifacts from the application model using configured deployment integrations.
aliases: [publishing]
topics: [deployment]
context: Configure a Docker Compose environment, then publish deployment output for a CI/CD pipeline rather than launching the development application.
related: [run-mode, publisher, deferred-evaluation]
resources:
  - title: Publish your Aspire application
    href: /reference/cli/commands/aspire-publish/
legacyAnchors: [publish-mode]
legacyGroup: execution-modes
---
`aspire publish` executes the publishing workflow for the configured application model. Deployment integrations determine the output, such as Docker Compose configuration, Kubernetes artifacts, or infrastructure definitions.

Publishing is not the same as running the local application or deploying it. It does not normally launch the application's development resources, although configured pipeline steps may perform build or container tooling work.

Do not assume publishing automatically produces every artifact format or resolves every production endpoint. Parameters and references can remain unresolved until deployment or runtime.
