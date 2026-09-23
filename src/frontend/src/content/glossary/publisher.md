---
title: Publisher
description: A component that interprets the application model and emits deployment artifacts for a particular target or format.
aliases: [deployment publisher]
topics: [deployment, reference]
context: A deployment integration reads resources and their references to generate target-specific configuration instead of starting local processes.
related: [publish-mode, referenceexpression, hoisting]
resources:
  - title: Understand how your resources are published
    href: /architecture/resource-publishing/
legacyAnchors: [publisher]
legacyGroup: api-reference-terms
---
A publisher translates resource definitions, annotations, and value references into output understood by deployment tooling.

Different publishers and deployment integrations support different resource types and output formats. Configuring a resource locally does not guarantee that every target knows how to publish it.

Publishing and deployment are separate concerns: producing an artifact does not necessarily apply it to a running environment.
