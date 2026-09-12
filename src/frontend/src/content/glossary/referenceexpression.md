---
title: ReferenceExpression
termType: API type
description: A structured expression that combines text and resource value references without resolving those references too early.
aliases: [reference expression]
topics: [reference]
context: Compose a database connection string from an endpoint and a secret parameter while preserving both references for run or publish mode.
related: [deferred-evaluation, hoisting, connection-string]
resources:
  - title: Compose resource values with expressions
    href: /architecture/resource-hierarchies/
legacyAnchors: [referenceexpression]
legacyGroup: api-reference-terms
---
A `ReferenceExpression` retains the structure of a value assembled from endpoints, parameters, connection strings, and literal text.

At runtime, value providers can resolve the expression to concrete values. During publishing, a publisher can preserve or translate references into its own representation.

Do not eagerly concatenate an unresolved endpoint into plain text when authoring an integration. Once the structure is lost, a publisher cannot reliably recover the dependency information from the string.
