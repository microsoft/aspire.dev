# Documentation Coverage Audit Plan

## Overview

This plan provides a comprehensive methodology for auditing documentation coverage between the [dotnet/aspire](https://github.com/dotnet/aspire) source repository and the [aspire.dev](https://aspire.dev) documentation site. The goal is to identify gaps in documentation coverage and create actionable issues for Copilot or contributors to address.

## Objectives

1. **Catalog all APIs** in the dotnet/aspire repository
2. **Audit existing documentation** in microsoft/aspire.dev
3. **Identify deltas** between documented and undocumented features
4. **Generate issues** for each documentation gap

## Phase 1: Source API Discovery

### Step 1.1: Clone the dotnet/aspire repository

```bash
git clone https://github.com/dotnet/aspire.git /tmp/aspire-source
cd /tmp/aspire-source
```

### Step 1.2: Identify all public API surfaces

Scan the following namespace patterns in the dotnet/aspire repository:

| Namespace Pattern | Description | Source Location |
|---|---|---|
| `Aspire.Hosting.*` | App host/orchestration APIs | `src/Aspire.Hosting.*/**/*.cs` |
| `Aspire.Components.*` | Client integration libraries | `src/Components/**/*.cs` |
| `Aspire.Dashboard.*` | Dashboard APIs | `src/Aspire.Dashboard/**/*.cs` |
| `Aspire.Cli.*` | CLI tooling | `src/Aspire.Cli/**/*.cs` |

### Step 1.3: Extract public APIs

For each project, identify:

1. **Public classes** - All `public class` declarations
2. **Public interfaces** - All `public interface` declarations
3. **Extension methods** - All `public static` extension methods (especially `Add*` and `With*` patterns)
4. **Configuration options** - All classes ending in `Options` or `Settings`
5. **Resource types** - All classes implementing `IResource` or inheriting from resource base types

### Step 1.4: Generate API inventory

Create a structured inventory with the following format:

```json
{
  "namespace": "Aspire.Hosting.Redis",
  "package": "Aspire.Hosting.Redis",
  "apis": [
    {
      "name": "AddRedis",
      "type": "extension_method",
      "signature": "IResourceBuilder<RedisResource> AddRedis(this IDistributedApplicationBuilder builder, string name, int? port = null)",
      "file": "src/Aspire.Hosting.Redis/RedisBuilderExtensions.cs",
      "line": 25,
      "xmlDoc": "Adds a Redis container resource to the distributed application."
    }
  ]
}
```

## Phase 2: Documentation Audit

### Step 2.1: Inventory existing documentation pages

Scan the `src/frontend/src/content/docs/` directory and create a catalog of all documentation:

```bash
find src/frontend/src/content/docs -name "*.mdx" -o -name "*.md" | sort
```

### Step 2.2: Categorize documentation by topic

Map existing documentation to these categories:

| Category | Directory | Description |
|---|---|---|
| Getting Started | `get-started/` | Onboarding and setup guides |
| Architecture | `architecture/` | Conceptual and design documentation |
| App Host | `app-host/` | Orchestration and hosting configuration |
| Fundamentals | `fundamentals/` | Core concepts and features |
| Integrations | `integrations/` | Database, messaging, caching, cloud integrations |
| Dashboard | `dashboard/` | Dashboard features and configuration |
| Testing | `testing/` | Testing patterns and libraries |
| Deployment | `deployment/` | Deployment guides and manifests |
| Diagnostics | `diagnostics/` | Logging, tracing, metrics |
| Extensibility | `extensibility/` | Custom resources and extensions |
| Reference | `reference/` | API reference and CLI documentation |

### Step 2.3: Extract documented APIs

For each documentation page, extract:

1. **Package references** - NuGet packages mentioned
2. **API methods documented** - Extension methods, classes, interfaces covered
3. **Code samples** - APIs demonstrated in examples
4. **Configuration options** - Settings and options explained

Use these patterns to identify API references:

```regex
# Package references
\[📦\s*([^\]]+)\]
Aspire\.(Hosting|Components)\.[A-Za-z.]+

# Extension method calls
\.Add[A-Z][a-zA-Z]+\(
\.With[A-Z][a-zA-Z]+\(
builder\.[A-Z][a-zA-Z]+\(

# Configuration classes
[A-Z][a-zA-Z]+Options
[A-Z][a-zA-Z]+Settings
```

### Step 2.4: Cross-reference with integration-docs.json

Load `src/frontend/src/data/integration-docs.json` to understand the current package-to-documentation mapping:

```javascript
const mappings = require('./src/frontend/src/data/integration-docs.json');
// Each entry has { match: "Aspire.Package.Name", href: "/docs/path/" }
```

## Phase 3: Delta Analysis

### Step 3.1: Compare API inventory to documentation

For each API identified in Phase 1:

1. Check if it's documented in any page from Phase 2
2. Check if its package has a mapping in `integration-docs.json`
3. Classify as:
   - **Documented** - API is covered with examples
   - **Mentioned** - API is referenced but not fully explained
   - **Missing** - API has no documentation

### Step 3.2: Categorize documentation gaps

Group gaps by severity and type:

| Gap Type | Severity | Description | Example |
|---|---|---|---|
| Missing Integration Doc | High | No documentation page for a hosting package | `Aspire.Hosting.NewService` has no page |
| Missing Client Doc | High | No documentation for client/component package | `Aspire.NewService.Client` not documented |
| Missing API Reference | Medium | Public API not documented | `WithEnvironment()` method not explained |
| Incomplete Examples | Medium | Documentation exists but lacks code samples | Redis page missing clustering example |
| Missing Configuration | Low | Configuration options not documented | `RedisResourceOptions.Persistence` not explained |
| Outdated Content | Low | Documentation references deprecated APIs | Using old method signatures |

### Step 3.3: Generate delta report

Create a structured report:

```json
{
  "summary": {
    "total_apis": 450,
    "documented_apis": 320,
    "mentioned_apis": 80,
    "missing_apis": 50,
    "coverage_percentage": 71.1
  },
  "gaps": [
    {
      "type": "missing_integration_doc",
      "severity": "high",
      "package": "Aspire.Hosting.NewDatabase",
      "apis_affected": ["AddNewDatabase", "WithNewDatabaseConfiguration"],
      "recommended_action": "Create new integration documentation page",
      "suggested_location": "/integrations/databases/new-database/"
    }
  ]
}
```

## Phase 4: Issue Generation

### Step 4.1: Issue template for documentation gaps

Use this template for creating GitHub issues:

```markdown
---
title: "[Docs] Document {API/Feature Name}"
labels: documentation, help-wanted, good-first-issue
assignees: ''
---

## Summary

{Brief description of what needs to be documented}

## API/Feature Details

- **Package**: `{NuGet package name}`
- **Namespace**: `{.NET namespace}`
- **Type**: {Integration/Feature/API Reference}
- **Source**: [{Link to source file}]({GitHub URL})

## Documentation Requirements

- [ ] Overview of the feature/API
- [ ] Installation/setup instructions
- [ ] Basic usage example
- [ ] Configuration options
- [ ] Advanced scenarios (if applicable)
- [ ] Troubleshooting tips

## Suggested Location

`src/frontend/src/content/docs/{suggested/path}/`

## Related Documentation

- {Links to related existing docs}

## Reference Materials

- Source code: {link}
- XML documentation: {extracted XML docs}
- Related issues: {links}

## Acceptance Criteria

- [ ] Documentation follows [contributor guide](https://aspire.dev/community/contributor-guide/) style
- [ ] Code samples are tested and working
- [ ] All public APIs in the package are documented
- [ ] Page is added to sidebar navigation
- [ ] Links added to integration-docs.json mapping
```

### Step 4.2: Prioritization criteria

Prioritize issues based on:

1. **Usage frequency** - APIs with high download counts get priority
2. **Community requests** - Features mentioned in discussions/issues
3. **Complexity** - Simple APIs can be quick wins
4. **Dependencies** - Document foundational APIs before advanced features

### Step 4.3: Batch issue creation

Group related gaps into logical issues:

- One issue per integration package
- One issue per major feature area
- Separate issues for API reference vs. conceptual docs

## Phase 5: Execution Workflow

### For LLM/Agent execution

#### Step 5.1: API Discovery Script

```bash
#!/bin/bash
# Run from dotnet/aspire repository root

# Find all public API surface
find src -name "*.cs" -exec grep -l "public class\|public interface\|public static" {} \; > /tmp/api-files.txt

# Extract extension methods
grep -rh "public static.*this I.*Builder" src/ --include="*.cs" > /tmp/extension-methods.txt

# Extract resource types
grep -rh "class.*Resource\|interface.*Resource" src/ --include="*.cs" > /tmp/resource-types.txt
```

#### Step 5.2: Documentation inventory script

```bash
#!/bin/bash
# Run from microsoft/aspire.dev repository root

# List all documentation pages
find src/frontend/src/content/docs -name "*.mdx" -o -name "*.md" > /tmp/doc-pages.txt

# Extract package references from docs
grep -rh "Aspire\.\(Hosting\|Components\)\.[A-Za-z.]*" src/frontend/src/content/docs/ > /tmp/doc-packages.txt

# Count API mentions
grep -roh "\.Add[A-Z][a-zA-Z]*\|\.With[A-Z][a-zA-Z]*" src/frontend/src/content/docs/ | sort | uniq -c | sort -rn > /tmp/api-mentions.txt
```

#### Step 5.3: Comparison workflow

1. Load API inventory from dotnet/aspire
2. Load documentation inventory from aspire.dev
3. For each API:
   - Search all documentation files for mentions
   - Check integration-docs.json for package mapping
   - Classify coverage level
4. Generate delta report
5. Create prioritized issue list

## Appendix A: Package Categories

### Hosting packages (App Host)

These packages provide resource builders for the app host:

| Package | Category | Expected Doc Location |
|---|---|---|
| `Aspire.Hosting.Redis` | Caching | `/integrations/caching/redis/` |
| `Aspire.Hosting.PostgreSQL` | Databases | `/integrations/databases/postgres/` |
| `Aspire.Hosting.RabbitMQ` | Messaging | `/integrations/messaging/rabbitmq/` |
| `Aspire.Hosting.Azure.*` | Cloud | `/integrations/cloud/azure/` |
| `Aspire.Hosting.AWS.*` | Cloud | External AWS docs |

### Client packages (Components)

These packages provide client integrations:

| Package | Category | Expected Doc Location |
|---|---|---|
| `Aspire.StackExchange.Redis` | Caching | `/integrations/caching/redis/` |
| `Aspire.Npgsql` | Databases | `/integrations/databases/postgres/` |
| `Aspire.RabbitMQ.Client` | Messaging | `/integrations/messaging/rabbitmq/` |
| `Aspire.Azure.*` | Cloud | `/integrations/cloud/azure/` |

## Appendix B: Documentation Quality Checklist

For each documented API, verify:

- [ ] Clear description of purpose
- [ ] Installation instructions (NuGet package reference)
- [ ] Basic usage example with working code
- [ ] All public methods documented
- [ ] Configuration options explained
- [ ] Common use cases covered
- [ ] Error handling guidance
- [ ] Links to related documentation
- [ ] Follows aspire.dev style guide

## Appendix C: Known Documentation Gaps (Initial Assessment)

Based on initial repository analysis, these areas likely need attention:

### High Priority

1. **Extensibility** - Limited documentation on creating custom resources
2. **Advanced Networking** - Service discovery internals, custom endpoints
3. **Deployment Targets** - Non-Azure deployment scenarios
4. **Testing Patterns** - Integration testing best practices

### Medium Priority

1. **Configuration Deep Dives** - Advanced configuration scenarios
2. **Performance Tuning** - Resource limits, scaling guidance
3. **Security** - Authentication, authorization patterns
4. **Observability** - Custom telemetry, dashboard customization

### Community Toolkit

1. **CommunityToolkit.Aspire.*** packages need documentation mapping
2. Many community integrations have limited documentation

## Appendix D: Automation Opportunities

### Automated documentation checks

1. **CI Pipeline** - Validate all packages have documentation mappings
2. **Link Checker** - Ensure integration-docs.json links are valid
3. **API Drift Detection** - Alert when new APIs are added without docs
4. **Coverage Metrics** - Track documentation coverage over time

### Script templates

```javascript
// Check for undocumented packages
const integrations = require('./src/frontend/src/data/aspire-integration-names.json');
const docMappings = require('./src/frontend/src/data/integration-docs.json');

const mappedPackages = new Set(docMappings.map(d => d.match));
const undocumented = integrations.filter(pkg => !mappedPackages.has(pkg));

console.log('Undocumented packages:', undocumented);
```

## Next Steps

1. **Run Phase 1** - Clone dotnet/aspire and generate API inventory
2. **Run Phase 2** - Audit existing aspire.dev documentation
3. **Run Phase 3** - Generate delta report
4. **Run Phase 4** - Create GitHub issues for gaps
5. **Assign to Copilot** - Use labels to enable Copilot assignment
6. **Track Progress** - Monitor issue resolution and coverage metrics

## Success Metrics

- Documentation coverage > 90% of public APIs
- All integration packages have dedicated documentation pages
- All packages mapped in integration-docs.json
- Community feedback indicates documentation is comprehensive
