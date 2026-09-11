---
title: Compute environment
description: A resource representing a deployment target that contributes pipeline steps for compatible application resources.
aliases: []
topics: [deployment]
context: Add a Kubernetes compute environment and bind your API to it so Aspire can produce the target-specific deployment output.
related: [deployment-pipeline, resource, publisher, publish-mode]
resources:
  - title: Understand compute environments
    href: /deployment/deploy-with-aspire/#compute-environments
  - title: Deploy to Kubernetes
    href: /deployment/kubernetes/
legacyAnchors: []
---
A compute environment answers where a compatible project, container, or executable resource should be deployed. Examples include deployment targets for Docker Compose, Kubernetes, and Azure.

Compatible compute resources attach to a matching compute environment by default. If several matching environments exist, bind each resource explicitly to the target that should own it.

The compute environment contributes target-specific pipeline behavior. It is not simply an environment name such as Development or Production, nor is it a collection of environment variables.
