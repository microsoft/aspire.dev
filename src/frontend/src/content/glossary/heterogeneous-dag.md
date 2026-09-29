---
title: Heterogeneous DAG
termType: Concept
description: A dependency graph containing different kinds of nodes, such as application projects, containers, cloud resources, and parameters.
aliases: [heterogeneous directed acyclic graph]
topics: [reference]
context: One application model connects an API project, a database container, and a password parameter instead of treating all nodes as processes.
related: [dag, resource, referenceexpression]
resources:
  - title: Understand resource relationships and hierarchies
    href: /architecture/resource-hierarchies/
legacyAnchors: [heterogeneous-dag]
legacyGroup: api-reference-terms
---
Heterogeneous means that the graph's nodes are not all the same type. Aspire's model includes executable workloads as well as configuration values and cloud infrastructure.

Dependencies can describe both orchestration relationships and structured values passed between resources. This lets tools understand a database connection's endpoint and parameter references rather than treating the connection as opaque text.
