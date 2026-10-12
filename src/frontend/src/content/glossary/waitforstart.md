---
title: WaitForStart
termType: API method
description: Delays startup until a dependency reaches the running state, without waiting for its health checks.
aliases: [waitForStart, start dependency]
topics: [foundations, reference]
context: Start a consumer after a dependency's process starts when the consumer can tolerate initial connection failures and retry safely.
related: [waitfor, waitforcompletion, health-check]
resources:
  - title: Configure resource dependencies and waits
    href: /fundamentals/annotations-overview/
legacyAnchors: [waitforstart]
legacyGroup: apis-and-patterns
---
`WaitForStart` in C# and `waitForStart` in TypeScript provide weaker coordination than a readiness wait. The dependency must reach the running state, but its health checks do not need to pass.

Use this when startup ordering matters but your application already handles temporary unavailability. Prefer `WaitFor` when a consumer needs the dependency's configured readiness checks to succeed before it starts.
