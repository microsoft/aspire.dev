---
name: update-samples
description: Update the samples data file by fetching sample metadata from the dotnet/aspire-samples GitHub repository. Use when adding new samples, refreshing sample data, or ensuring samples.json stays in sync with the upstream repo.
---

# Update Samples Data

This skill synchronizes the samples data file with the `dotnet/aspire-samples` GitHub repository. It enumerates all sample projects in the `samples/` directory, fetches each sample's README.md, and generates a structured JSON catalog.

## Overview

The aspire.dev site maintains a data file for samples:

- **`src/frontend/src/data/samples.json`** — Sample metadata including titles, descriptions, tags, deep links, and README content extracted from the upstream repo.

This skill keeps that file in sync with the `dotnet/aspire-samples` repository on GitHub.

## Prerequisites

- Node.js installed and available on `PATH`
- Working directory is the repository root
- The frontend project dependencies are installed (`pnpm install` in `src/frontend/`)
- Optional: `GITHUB_TOKEN` environment variable for higher GitHub API rate limits

## Step-by-Step Process

### 1. Run the update script

Fetch the latest sample data from the GitHub API:

```bash
cd src/frontend && node scripts/update-samples.js
```

This writes updated sample metadata to `src/frontend/src/data/samples.json`. The script queries the GitHub Contents API for directories in `dotnet/aspire-samples/samples/`, fetches each sample's README.md, and extracts structured metadata.

### 2. What the script does

For each subdirectory in `samples/`:

1. **Lists directories** — Calls the GitHub Contents API to enumerate entries in `samples/` and filters to directories only (skipping files like `global.json`, `Directory.Build.props`).

2. **Fetches README.md** — Downloads the raw README.md for each sample directory.

3. **Extracts metadata** from the README:
   - **`name`** — The directory name (e.g., `aspire-shop`)
   - **`title`** — Extracted from the first `# heading` in the README
   - **`description`** — The first paragraph of body text after the title (before any `##` heading)
   - **`href`** — Deep link to the sample on GitHub: `https://github.com/dotnet/aspire-samples/tree/main/samples/{name}`
   - **`readme`** — The full Markdown content of the README.md, with image paths rewritten to local assets (see below)
   - **`tags`** — Auto-detected tags based on technologies, languages, services, and features mentioned in the README and directory name
   - **`thumbnail`** — Local asset path to the first image referenced in the README (if any), or `null`

4. **Downloads images** — For each image referenced in the README (`![alt](src)`):
   - Resolves the remote URL (relative paths are resolved against the GitHub raw content URL)
   - Downloads the image to `src/frontend/src/assets/samples/{name}/{filename}`
   - Rewrites the image reference in the README to use the local asset path: `~/assets/samples/{name}/{filename}`
   - This ensures images are bundled with the site and served locally rather than hotlinked from GitHub

5. **Writes output** — Saves the result as a sorted JSON array to `src/frontend/src/data/samples.json`.

### 3. Tag detection

Tags are automatically inferred from the README content and sample name. The script detects:

#### Languages
| Tag | Matched by |
|---|---|
| `csharp` | C#, .NET references |
| `python` | Python references |
| `javascript` | JavaScript references |
| `node` | Node.js references |
| `go` | Go/Golang references |

#### Services & Technologies
| Tag | Matched by |
|---|---|
| `redis` | Redis references |
| `postgresql` | PostgreSQL, Postgres, Npgsql references |
| `sql-server` | SQL Server, MSSQL references |
| `mysql` | MySQL references |
| `mongodb` | MongoDB references |
| `rabbitmq` | RabbitMQ references |
| `kafka` | Kafka references |
| `prometheus` | Prometheus references |
| `grafana` | Grafana references |
| `docker` | Docker, container references |

#### Azure Services
| Tag | Matched by |
|---|---|
| `azure` | Azure references |
| `azure-functions` | Azure Functions references |
| `azure-storage` | Azure Storage references |
| `azure-service-bus` | Azure Service Bus references |

#### Frameworks & Features
| Tag | Matched by |
|---|---|
| `blazor` | Blazor references |
| `orleans` | Orleans references |
| `grpc` | gRPC references |
| `ef-core` | Entity Framework Core references |
| `metrics` | Metrics, OpenTelemetry references |
| `health-checks` | Health check references |
| `containers` | Container build/deployment references |
| `databases` | Database-related references |
| `migrations` | Database migration references |
| `volumes` | Volume mount references |
| `dashboard` | Dashboard references |

### 4. Output format

The output `samples.json` is a JSON array with entries like:

```json
[
  {
    "name": "aspire-shop",
    "title": "Aspire Shop",
    "description": "The app consists of four .NET services including a Blazor frontend, catalog API, catalog database manager, and basket service.",
    "href": "https://github.com/dotnet/aspire-samples/tree/main/samples/aspire-shop",
    "readme": "# Aspire Shop\n\n![Screenshot...](~/assets/samples/aspire-shop/aspireshop-frontend-complete.png)...",
    "tags": ["csharp", "blazor", "postgresql", "redis", "grpc", "ef-core"],
    "thumbnail": "~/assets/samples/aspire-shop/aspireshop-frontend-complete.png"
  }
]
```

### 5. Manual review

After running the script:

- **Review new entries** — Verify titles and descriptions are meaningful
- **Check tags** — The auto-detection may miss niche technologies; manually add tags if needed
- **Verify thumbnails** — Ensure image URLs resolve correctly
- **Remove stale samples** — The script automatically handles this since it rebuilds from source

### 6. Environment variables

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | No | GitHub personal access token for higher API rate limits (60 → 5000 requests/hour) |

### 7. Integration with build

The script is registered as an npm script in `src/frontend/package.json`:

```bash
pnpm update:samples
```

It is also included in the `update:all` aggregate script so it runs alongside other data updates during builds.
