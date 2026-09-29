---
title: Parameter
description: A resource representing an external configuration value, such as a secret or setting that varies between environments.
aliases: [external parameter]
topics: [foundations, deployment]
context: Declare an API key as a secret parameter, supply its value through configuration, and pass it to the service that needs it.
related: [resource, environment-variable, connection-string, publish-mode]
resources:
  - title: Supply external parameters to your AppHost
    href: /fundamentals/external-parameters/
  - title: Use parameters during deployment
    href: /deployment/deploy-with-aspire/#parameters
legacyAnchors: []
---
A parameter models a value that comes from outside the AppHost code. Examples include passwords, API keys, and settings that differ between environments.

The AppHost declares the parameter and references it from resource configuration. Its value can come from configuration or an interactive prompt, depending on the execution workflow. Parameters can be marked as secret.

A parameter is not the same as an environment variable. The parameter is part of the application model; an environment variable is one way to deliver its value to a running service. Deployment targets can also represent parameters in generated artifacts.
