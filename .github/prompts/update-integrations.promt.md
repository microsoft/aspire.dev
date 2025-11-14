# Update Integration Documentation Links

## Task Overview

Update the integration documentation links by synchronizing package names from the NuGet catalog with their corresponding documentation URLs.

## Steps

1. **Run the update script**

    ```bash
    node src/frontend/scripts/update-integrations.js
    ```

2. **Read the updated package data**
    - Load `src/frontend/src/data/aspire-integrations.json`
    - Extract all package names from the `title` field

3. **Update integration documentation mappings**
    - Load `src/frontend/src/data/integration-docs.json`
    - For each package in `aspire-integrations.json`:
      - Check if a matching entry exists in `integration-docs.json` (where `match` equals the package `title`)
      - If an entry exists, verify the `href` is correct
      - If no entry exists, determine the appropriate documentation URL based on:
         - Package name patterns (e.g., `Aspire.Hosting.X` → `/integrations/*/x/`)
         - Existing similar package mappings
         - Technology category (databases, messaging, caching, ai, etc.)
      - Add or update the entry with the package name as `match` and site-relative path as `href`

4. **Ensure consistency**
    - Remove any entries from `integration-docs.json` that reference packages no longer in `aspire-integrations.json`
    - Maintain alphabetical or logical ordering
    - Preserve existing correct mappings

## Output

Save the updated `integration-docs.json` with all current packages properly mapped to their documentation pages.

## Example Entry Format

```json
{
  "match": "Aspire.Hosting.Redis",
  "href": "/integrations/caching/redis/"
}
```
