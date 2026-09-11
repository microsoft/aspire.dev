---
title: Emulator pattern
termType: Pattern
description: Replaces a supported cloud resource with a local emulator for development while keeping the resource in the application model.
aliases: [emulator, RunAsEmulator]
topics: [integrations]
context: Use the Azure Storage integration's emulator support to run Azurite locally instead of connecting to a live storage account.
related: [hosting-integration, run-mode, existing-resource-pattern]
resources:
  - title: Run Azure Blob Storage locally with an emulator
    href: /integrations/cloud/azure/azure-storage-blobs/azure-storage-blobs-host/
legacyAnchors: [emulator-pattern]
legacyGroup: common-patterns
---
Some hosting integrations support a local emulator, often running in a container. Azure Storage, for example, can use Azurite through `RunAsEmulator` in C# or `runAsEmulator` in TypeScript.

This can reduce the need for live cloud resources during development. Support is integration-specific: not every cloud resource has an emulator, and emulator behavior may differ from the production service.

Review the integration's supported features and test cloud-specific behavior against the real service before deployment.
