---
title: Deferred evaluation
description: Resolving or computing a value only when the information needed to produce it is available.
aliases: [lazy evaluation, deferred resolution]
topics: [reference]
context: Resolve a service's allocated port after endpoint allocation rather than trying to read it while the AppHost is still declaring resources.
related: [referenceexpression, hoisting, environment-variable]
resources:
  - title: Understand how resource values are resolved
    href: /architecture/resource-hierarchies/
legacyAnchors: [deferred-evaluation]
legacyGroup: api-reference-terms
---
Some resource values do not exist when the application model is first constructed. Ports, endpoints, generated credentials, or provisioned cloud outputs may become available later.

Value providers and structured expressions defer resolution until the appropriate stage. In run mode that may produce a concrete value; in publish mode the target may receive an expression to resolve during deployment.

Preserving a reference avoids hard-coding a development value into output intended for another environment.
