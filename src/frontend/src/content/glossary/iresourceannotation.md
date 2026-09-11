---
title: IResourceAnnotation
termType: API interface
description: The .NET interface for typed metadata attached to an Aspire resource to describe configuration or behavior.
aliases: [resource annotation, annotation]
topics: [reference]
context: An integration attaches endpoint or environment annotations to a resource so orchestration and publishing can interpret them later.
related: [withannotation, resource, lifecycle-events]
resources:
  - title: Customize resources with annotations
    href: /fundamentals/annotations-overview/
legacyAnchors: [iresourceannotation]
legacyGroup: api-reference-terms
---
Annotations store strongly typed metadata on resources. Built-in annotations describe concerns such as endpoints, environment settings, and startup waits; integration authors can define custom annotation types.

`IResourceAnnotation` is a .NET extensibility interface. TypeScript AppHost configuration methods manage the underlying metadata without exposing arbitrary .NET annotation implementations as a direct authoring pattern.
