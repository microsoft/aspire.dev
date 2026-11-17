---
title: WithAnnotation
termType: API method
description: A C# resource-builder extension method that attaches typed annotation metadata to a resource.
aliases: [annotation attachment]
topics: [reference]
context: A C# hosting integration attaches a custom annotation, then its orchestration or publishing logic reads that metadata.
related: [iresourceannotation, hosting-integration]
resources:
  - title: Learn the patterns for extending resources
    href: /architecture/resource-api-patterns/
legacyAnchors: [withannotation]
legacyGroup: api-reference-terms
---
`WithAnnotation` is part of the .NET resource-builder API. It lets integration authors attach typed metadata that other parts of Aspire can inspect and act on.

The TypeScript and Go SDKs do **not** expose a general `withAnnotation` counterpart. Use supported configuration methods, such as endpoint and environment methods, which attach the necessary metadata internally.

An annotation needs a consumer to give it meaning. Attaching arbitrary metadata by itself does not create a new orchestration behavior.
