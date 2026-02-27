---
name: update-integrations
description: Update integration documentation links by synchronizing NuGet package names with their documentation URLs. Use when adding new integrations, refreshing package data, or ensuring integration-docs.json stays in sync with aspire-integrations.json.
---

# Update Integration Documentation Links

This skill synchronizes the integration package catalog with documentation URL mappings. It ensures every NuGet package listed in the integrations data file has a corresponding documentation link.

## Overview

The aspire.dev site maintains two key data files:

- **`src/frontend/src/data/aspire-integrations.json`** — Package metadata fetched from NuGet (titles, descriptions, icons, versions, download counts).
- **`src/frontend/src/data/integration-docs.json`** — Mappings from package names to site-relative documentation URLs.

This skill keeps the second file in sync with the first.

## Prerequisites

- Node.js installed and available on `PATH`
- Working directory is the repository root
- The frontend project dependencies are installed (`pnpm install` in `src/frontend/`)

## Step-by-Step Process

### 1. Run the update script

Fetch the latest package data from NuGet:

```bash
cd src/frontend && node scripts/update-integrations.js
```

This writes updated package metadata to `src/frontend/src/data/aspire-integrations.json`. The script queries the NuGet v3 API for packages matching `owner:aspire`, `Aspire.Hosting.`, and `CommunityToolkit.Aspire`, then filters out deprecated, unlisted, and excluded packages.

### 2. Read the updated package data

Load `src/frontend/src/data/aspire-integrations.json` and extract all package names from the `title` field of each entry in the JSON array.

### 3. Update integration documentation mappings

Load `src/frontend/src/data/integration-docs.json` and reconcile it with the package list:

- **For each package name** (from `title` field) in `aspire-integrations.json`:
  - Check if a matching entry exists in `integration-docs.json` (where `match` equals the package name)
  - If an entry exists, verify the `href` is correct
  - If no entry exists, determine the appropriate documentation URL

- **Remove stale entries** from `integration-docs.json` that reference packages no longer in `aspire-integrations.json`

- **Preserve existing correct mappings** — do not change entries that are already accurate

### 4. Determining documentation URLs

When a package has no existing mapping, determine the URL based on:

#### Package name patterns

| Package prefix | Documentation path pattern |
|---|---|
| `Aspire.Hosting.Azure.*` | `/integrations/cloud/azure/{service-name}/` |
| `Aspire.Azure.*` | `/integrations/cloud/azure/{service-name}/` |
| `Aspire.Hosting.{Tech}` | `/integrations/{category}/{tech}/` |
| `Aspire.{Client}.{Driver}` | `/integrations/{category}/{tech}/` |
| `CommunityToolkit.Aspire.Hosting.*` | `/integrations/{category}/{tech}/` |
| `CommunityToolkit.Aspire.*` | `/integrations/{category}/{tech}/` |

#### Technology categories

The documentation site organizes integrations into these categories:

| Category path | Technologies |
|---|---|
| `/integrations/ai/` | OpenAI, Ollama, Milvus, Qdrant |
| `/integrations/caching/` | Redis, Valkey, Garnet, Memcached |
| `/integrations/cloud/azure/` | All Azure services |
| `/integrations/compute/` | Orleans, Dapr |
| `/integrations/databases/` | PostgreSQL, SQL Server, MySQL, MongoDB, Cosmos DB, Oracle, Elasticsearch, Milvus, Qdrant |
| `/integrations/databases/efcore/` | EF Core variants of database integrations |
| `/integrations/devtools/` | Developer tools and utilities |
| `/integrations/frameworks/` | Framework integrations |
| `/integrations/messaging/` | Kafka, RabbitMQ, NATS, Azure Service Bus, Event Hubs |
| `/integrations/observability/` | OpenTelemetry, Seq, logging |
| `/integrations/reverse-proxies/` | YARP |
| `/integrations/security/` | Keycloak, Key Vault |

#### URL resolution strategy

1. Match against existing similar package mappings in `integration-docs.json`
2. Infer from the package name and technology category
3. **Verify the page exists** — use Playwright MCP tools or check the file system under `src/frontend/src/content/docs/` to confirm the target page is real
4. If no valid documentation page can be found, flag the package for manual review

### 5. Verify all links

For every entry in the updated `integration-docs.json`:

- **Site-relative links** must end with a trailing `/`
- **External links** (e.g., AWS docs) are allowed and should use full URLs
- **All site-relative links must point to existing documentation pages** — check by verifying a corresponding `.mdx` file exists under `src/frontend/src/content/docs/`

Do not assume a page exists without verification.

### 6. Save the result

Write the updated `integration-docs.json` maintaining consistent formatting (2-space indentation, trailing newline).

## Entry format

Each entry in `integration-docs.json` follows this structure:

```json
{
  "match": "Aspire.Hosting.Redis",
  "href": "/integrations/caching/redis/"
}
```

- `match` — The exact NuGet package name (from the `title` field in `aspire-integrations.json`)
- `href` — A site-relative path (with trailing `/`) or an external URL

## Handling unmapped packages

When a package name has no clear documentation mapping:

1. **Do not invent a URL** — only use paths that correspond to real pages
2. **List the package** for manual review with a note explaining why no mapping was found
3. These packages likely need new documentation pages written (hand off to the `doc-writer` skill)

## Example output

After running this skill, the agent should report:

- Number of packages in `aspire-integrations.json`
- Number of mapped entries in `integration-docs.json`
- Any new mappings added
- Any stale mappings removed
- Any packages that could not be mapped (flagged for manual review)
