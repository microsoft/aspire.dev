---
title: Hoisting
description: In resource publishing, preserving an unresolved value for substitution at a later deployment or runtime stage.
aliases: [value hoisting]
topics: [reference, deployment]
context: Keep a resource endpoint as a deployment-time reference instead of embedding the localhost address allocated during development.
related: [deferred-evaluation, referenceexpression, publisher]
resources:
  - title: Understand structured values in resource hierarchies
    href: /architecture/resource-hierarchies/
legacyAnchors: [hoisting]
legacyGroup: api-reference-terms
---
In Aspire publishing discussions, hoisting describes leaving a value unresolved so a later stage can provide it. It is not JavaScript's declaration-hoisting behavior.

Structured endpoint and parameter references preserve the information a publisher needs to emit an appropriate placeholder or deployment expression. The exact representation and resolution stage depend on the deployment target.
