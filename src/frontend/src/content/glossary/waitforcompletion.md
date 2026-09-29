---
title: WaitForCompletion
termType: API method
description: Delays startup until a dependency exits with the expected exit code, rather than only waiting for it to run.
aliases: [waitForCompletion, completion dependency]
topics: [foundations, reference]
context: Run a database migration resource to completion before starting the API that depends on the updated schema.
related: [waitfor, waitforstart]
resources:
  - title: Configure resource dependencies and waits
    href: /fundamentals/annotations-overview/
legacyAnchors: [waitforcompletion]
legacyGroup: apis-and-patterns
---
`WaitForCompletion` in C# and `waitForCompletion` in TypeScript are useful for one-time jobs such as migrations, data seeding, and setup scripts.

The default expected exit code is zero. A failed setup job is not the same as successful completion. Configure the dependency around the outcome your consuming service requires.

Do not use a completion wait for a long-running database server or web service that is expected to stay alive. Use a readiness or start wait instead.
