---
title: Deployment pipeline
description: A dependency-aware set of steps that builds, publishes, or deploys resources from the Aspire application model.
aliases: [application pipeline]
topics: [deployment]
context: Build a service's container image before pushing it to a registry, then deploy it to a compute environment as part of the same pipeline.
related: [compute-environment, publisher, publish-mode, dag]
resources:
  - title: Understand Aspire deployment pipelines
    href: /deployment/pipelines/
  - title: Run Aspire from a CI/CD workflow
    href: /deployment/ci-cd/
legacyAnchors: []
---
Aspire's deployment pipeline organizes work into named steps with explicit dependencies. Resources and deployment integrations contribute steps, and independent steps can run concurrently.

Publishing, deploying, and running a selected step provide different entry points into that work. The pipeline uses the AppHost's application model rather than requiring a separate description of the resource topology.

An Aspire deployment pipeline is not the same as a CI/CD workflow. A workflow in GitHub Actions or Azure Pipelines can invoke Aspire's pipeline as part of a broader process that also runs tests, manages approvals, and supplies credentials.
