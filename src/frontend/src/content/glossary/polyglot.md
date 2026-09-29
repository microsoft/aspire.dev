---
title: Polyglot
description: Describes an application or toolchain that uses multiple programming languages, with Aspire coordinating its resources.
aliases: [multi-language]
topics: [foundations]
context: Use a TypeScript or C# AppHost to coordinate a Python API, a JavaScript frontend, and a database without rewriting the services.
related: [apphost, distributed-application, environment-variable]
resources:
  - title: Connect services written in different languages
    href: /architecture/multi-language-architecture/
legacyAnchors: [polyglot]
legacyGroup: core-concepts
---
In Aspire, polyglot refers to code and applications written in multiple languages, including TypeScript, C#, Python, Go, Java, and Rust.

Distinguish the **AppHost language**, which expresses orchestration, from the **workload languages**, which implement your services. A TypeScript AppHost can orchestrate a .NET service, and a C# AppHost can orchestrate a Python service.

Generated SDKs and language-specific integrations connect these layers. Available configuration APIs vary by integration; check its documentation rather than assuming every API has a direct translation.
