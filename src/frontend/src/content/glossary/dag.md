---
title: DAG
termType: Concept
pronunciation: dag (rhymes with bag)
description: "A directed acyclic graph: nodes connected by directional edges, with no path that loops back to its starting node."
aliases: [directed acyclic graph]
topics: [reference, foundations]
context: An API waits for a migration job, which waits for a database. A reverse wait from the database to the API would create a cycle.
related: [heterogeneous-dag, resource, waitfor]
resources:
  - title: Understand your application's resource graph
    href: /architecture/resource-model/
legacyAnchors: [dag]
legacyGroup: api-reference-terms
---
Aspire describes its resource dependency model as a directed acyclic graph. Resources form the nodes, and dependency relationships form directed edges.

The acyclic constraint matters for startup dependencies: if two resources each wait for the other, neither can proceed. Model the required ordering without introducing circular waits.

A startup dependency graph is not the same as the application's network traffic graph. Services can exchange requests without each waiting for the other to become ready.
