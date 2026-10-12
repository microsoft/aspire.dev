---
title: Aspire Type System
termType: API contract
description: A portable contract that exposes Aspire's .NET hosting APIs to supported guest languages through generated SDKs.
aliases: [ATS]
topics: [foundations, integrations]
context: In a TypeScript AppHost, adding Redis calls a generated SDK method that invokes the exported hosting API in Aspire's .NET host.
related: [apphost, polyglot, hosting-integration]
resources:
  - title: Understand the Aspire Type System
    href: /architecture/multi-language-architecture/#aspire-type-system
  - title: Export integrations for guest languages
    href: /extensibility/multi-language-integration-authoring/
legacyAnchors: []
---
The Aspire Type System (ATS) describes the types and operations that can cross the boundary between Aspire's .NET host and a guest-language AppHost.

Integration authors mark their .NET APIs for export. Aspire scans that metadata and generates language-specific SDKs, allowing guest code to use hosting integrations without reimplementing their orchestration behavior.

ATS includes portable representations for values, callbacks, and handles to host-side objects. A guest SDK uses those contracts to communicate with the host.

ATS support for an **AppHost language** is separate from support for a **workload language**. Your services do not need an ATS SDK to be orchestrated by Aspire.
