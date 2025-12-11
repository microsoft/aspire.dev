# Documentation Migration Plan: docs-aspire to aspire.dev

## Overview

Migrate documentation content from the legacy `E:\GitHub\docs-aspire` repository to the new `aspire.dev` site, transforming content from docfx/Microsoft Learn format to Astro/Starlight format.

## Source Repository Details

- **Location**: `E:\GitHub\docs-aspire`
- **Format**: YAML frontmatter + Markdown (`.md`)
- **Build system**: docfx (Microsoft Learn)
- **Structure**: Uses snippet directories for code samples
- **Target platform**: Microsoft Learn documentation

## Target Repository Details

- **Location**: Current workspace (`E:\GitHub\aspire.dev`)
- **Format**: Frontmatter + MDX (`.mdx`)
- **Build system**: Astro + Starlight
- **Structure**: Inline code samples, custom components
- **Target platform**: aspire.dev website

## Key Differences & Transformations

### Format Changes
- **File extension**: `.md` → `.mdx`
- **Code samples**: External snippets → Inline code blocks
- **Frontmatter**: YAML structure differences (need to map fields)
- **Components**: Microsoft Learn includes → Astro/Starlight components
- **Images**: Copy from `docs-aspire/docs/{section}/media/` to `aspire.dev/src/frontend/src/assets/{section}/`
- **Excalidraw sources**: Always copy `.excalidraw` files along with image exports

### Frontmatter Transformation
- **Remove**: `ms.date`, `ms.topic`, `ms.custom`, and other Microsoft Learn-specific metadata
- **Keep**: `title`, `description`
- **Add if needed**: `tableOfContents`, `lastUpdated`
- **Simplify titles**: Remove redundant "Aspire" prefix when appropriate (e.g., "Aspire testing overview" → "Testing overview")

### Component Mapping
- **Admonitions**: `> [!NOTE]` → `<Aside type="note">`, `> [!IMPORTANT]` → `<Aside type="caution">`, `> [!WARNING]` → `<Aside type="danger">`
- **Images**: `:::image type="content" source="path" alt-text="text":::` → Import with `@assets/` alias and use `<Image src={importedImage} alt="text" />`
- **Code blocks**: Keep as-is, ensure inline (no external snippet references)
- **Links**: `xref:` links → Regular markdown links or remove if no equivalent exists, and do inline code formatting for API references
- Custom components available: `Aside`, `CardGrid`, `LinkCard`, `Steps`, `TabItem`, `Icon`, `FileTree`, `Kbd`, `LearnMore`, `PivotSelector`, `Pivot`, `ThemeImage`

Learn's zone pivots:

```md
---
title: Zone pivot example on Learn
zone_pivot_groups: unit-testing-framework
---

:::pivot="xunit"
Example xUnit content
:::
:::pivot="nunit"
Example NUnit content
:::
```

Then you'd have to look up the `docs/zones/zone-pivot-groups.yml` file to see which pivots belong to the `unit-testing-framework` group. For example:

```yml
- id: unit-testing-framework
  title: Unit testing framework
  prompt: Choose a unit testing framework
  pivots:
  - id: xunit
    title: xUnit
  - id: mstest
    title: MSTest
  - id: nunit
    title: NUnit
```

For `aspire.dev` our pivots are based on two custom components:

```mdx
---
title: Example pivot example on aspire.dev
---

import Pivot from '@components/Pivot.astro';
import PivotSelector from '@components/PivotSelector.astro';

<PivotSelector
    title="Select your testing framework"
    key="testing-framework"
    options={[
        { id: "xunit", title: "xUnit.net" },
        { id: "mstest", title: "MSTest" },
        { id: "nunit", title: "NUnit" },
    ]}
/>


<Pivot id="xunit">
Example xUnit content
</Pivot>
<Pivot id="nunit">
Example NUnit content
</Pivot>
```

### Image Handling
1. **Import statement**: Add `import { Image } from 'astro:assets';` to imports
2. **Asset import**: `import imageName from '@assets/{section}/{filename}';`
3. **Usage**: `<Image src={imageName} alt="descriptive text" />`
4. **Copy both**: Always copy `.png`, `.svg` (or other formats) AND `.excalidraw` source files
5. **Destination**: `src/frontend/src/assets/{section}/`

### Link Transformations
- **Remove**: "See also" sections entirely
- **Internal links**: Convert to site-relative with trailing slash (e.g., `/dashboard/overview/`), assume absolute links should be used when site relative links don't exist in aspire.dev, and use a base of `https://learn.microsoft.com/`, i.e.; for links that start with `/azure`, `/dotnet`, and `/aspnet`.
- **Only link if certain**: Only create internal links to content you're 100% sure exists
- **External links**: Keep as-is, prefer official documentation sources

### Content Strategy
- **Not a 1:1 port**: Restructure and improve messaging
- **Selective migration**: Only migrate articles chosen by user
- **New content exists**: Avoid overwriting existing aspire.dev content
- **One article at a time**: Iterative approach with user validation
- **Follow style guide**: Use contributor-guide.mdx writing style (clear, concise, active voice, sentence case)

### Writing Style Guidelines (from contributor-guide.mdx)
- Use clear and concise language
- Be consistent with existing conventions
- Use active voice
- Use sentence case for headings
- Be inclusive
- Provide examples where applicable
- Use proper grammar and spelling
- Structure content logically
- Link to relevant resources
- Follow formatting conventions

## Migration Workflow

### Phase 1: Article Selection
1. User identifies specific article from `docs-aspire` to migrate
2. Review source content structure and dependencies
3. Identify target location in `aspire.dev` structure
4. Check if directory exists, create if needed

### Phase 2: Content Analysis
1. Extract source content from `docs-aspire`
2. Identify code snippets and their sources (inline all snippets)
3. Identify images in media folder
4. Map frontmatter fields
5. Identify Microsoft Learn-specific syntax/components

### Phase 3: Transformation
1. Create directory structure if needed
2. Copy images (both exports and source files like .excalidraw)
3. Convert frontmatter to aspire.dev format
4. Inline code snippets from snippet directories
5. Transform Microsoft Learn syntax to Astro/Starlight components
6. Import and use Image component for all images
7. Remove "See also" sections
8. Update links to be site-relative with trailing slashes
9. Remove xref links or convert to standard links
10. Restructure content for improved messaging
11. Adapt to aspire.dev style and tone
12. When linking to NuGet packages, ensure the link name matches the package name on nuget.org and is prefixed with the 📦 emoji, i.e.; [📦 Aspire.Hosting.Testing](https://www.nuget.org/packages/Aspire.Hosting.Testing).

### Phase 4: Sidebar Integration
1. Update `src/frontend/sidebar.topics.ts`
2. Add new section or items with proper translations
3. Follow existing patterns for structure
4. Include all required language translations

### Phase 5: Review & Iteration
1. Present transformed content to user
2. Gather feedback on structure, messaging, technical accuracy
3. Iterate on improvements
4. Finalize and verify files are created correctly

## Technical Details

### Directory Structure
- **Content**: `src/frontend/src/content/docs/{section}/`
- **Assets**: `src/frontend/src/assets/{section}/`
- **Sidebar**: `src/frontend/sidebar.topics.ts`

### PowerShell Commands
Use PowerShell 7+ commands for file operations:
```powershell
New-Item -ItemType Directory -Path "path" -Force
Copy-Item "source" "destination"
```

### Import Aliases
- `@components` → `src/frontend/src/components/`
- `@assets` → `src/frontend/src/assets/`

## Expected Challenges

1. **No direct mapping**: Formats and structures are fundamentally different
2. **Component translation**: Will require understanding both component systems
3. **Code snippet location**: Need to find and inline external snippets
4. **Content improvement**: Balancing migration with messaging improvements
5. **Context switching**: Different conventions, styles, and audiences
6. **Dependency tracking**: Articles may reference other content
7. **PowerShell availability**: Environment requires PowerShell 7+ (not PowerShell 5)

> [!NOTE]
> When you encounter `snippets` assume they are dated, and use a terminal to recreate the project or code sample using the latest versions of Aspire and .NET SDKs which are already installed on your machine. Use a temp directory, and copy the code you need, then delete the temp directory when done.

## Questions to Address Per Article

1. Where is the source article located in `docs-aspire`?
2. Where should it go in the `aspire.dev` structure?
3. What snippets need to be inlined?
4. What images need to be copied (including source files)?
5. What components need translation?
6. What messaging improvements are desired?
7. Are there dependencies on other articles?
8. Does similar content already exist in aspire.dev?
9. Does the directory structure need to be created?
10. What sidebar translations are needed?

## Process Start

**Ready to begin**: Ask user which article from `E:\GitHub\docs-aspire` they want to migrate first.
