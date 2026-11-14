---
title: Azure App Service runtime configuration
description: Learn how apps deployed to Azure App Service via Aspire consume injected connection strings and resource references at runtime.
---

{% image "/assets/images/icons/azure-app-services.svg", alt: "Azure App Service logo", height: 100, width: 100, class: "float-inline-left icon", zoomable: false %}

Azure App Service is a **deployment target**, not a data service. There is no client library to install in apps that run on App Service. Instead, Aspire injects connection strings and resource references as **environment variables** when it deploys your app — exactly the same values your app reads during local development.

## How configuration reaches your app

When you reference a resource (database, cache, message broker, and so on) from a project in your AppHost and that project is deployed to an App Service environment, Aspire:

1. Resolves the connection information for the referenced resource.
2. Writes each connection property as an App Service application setting, which the platform surfaces to your app as an environment variable.

Your deployed app reads those variables using the same code it uses locally — `Environment.GetEnvironmentVariable(...)` in C#, `process.env.*` in Node.js, `os.getenv(...)` in Python, and so on. No special App Service SDK is required.

:::note
Aspire automatically sets the `AZURE_TOKEN_CREDENTIALS` environment variable to `ManagedIdentityCredential` for deployed resources that use a managed identity. This ensures `DefaultAzureCredential` selects the correct credential without ambiguity. For more information, see [DefaultAzureCredential behavior in Azure deployments](/whats-new/aspire-13/#defaultazurecredential-behavior-in-azure-deployments).
:::

## Connection string format

Connection string environment variables follow the standard Aspire convention:

- For resources referenced by name, Aspire injects a `ConnectionStrings__<resourcename>` variable (double underscore for non-.NET apps, colon separator for .NET `IConfiguration`).
- Individual connection properties are also available as `<RESOURCENAME>_<PROPERTY>` variables where applicable.

For the exact variable names exposed by each resource type, see the connection documentation for that resource — for example, [Connect to PostgreSQL](/integrations/databases/postgres/postgres-connect/) or [Connect to Valkey](/integrations/caching/valkey/valkey-connect/).

## See also

{% card_grid %}
{% link_card title: "Azure App Service Hosting integration", href: "/integrations/cloud/azure/azure-app-service/azure-app-service-host/", description: "Learn how to model an App Service environment in your AppHost and customize deployment." %}

{% link_card title: "Deploy your first Aspire app", href: "/get-started/deploy-first-app/", description: "Walk through deploying an Aspire app end to end." %}

{% link_card title: "Local Azure provisioning", href: "/integrations/cloud/azure/local-provisioning/", description: "Configure Azure subscription and location for provisioning during development." %}
{% endcard_grid %}
