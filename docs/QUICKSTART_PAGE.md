# Try Aspire in Browser - Quickstart Page

## Overview

The `/quickstart` page is a streamlined Starlight documentation page that helps users explore Aspire using GitHub Codespaces samples without installing anything locally.

**Location:** `src/frontend/src/content/docs/quickstart.mdx`

## Features

### Sample Cards

Each sample is presented as a card showing:

- **Title** - Clear name of the sample
- **Perfect for** - Target audience
- **What you'll learn** - Key concepts covered
- **Tech stack** - Technologies used
- **Time estimate** - How long it takes
- **Launch button** - Direct link to open in Codespaces
- **Expandable details** - Additional information

### Integrated Documentation

The page uses standard Starlight components:

- `<Card>` and `<CardGrid>` for sample presentation
- `<Steps>` for usage instructions
- `<Code>` for terminal commands
- `<Aside>` for tips and notes
- `<LinkButton>` for navigation

### No Custom State Management

- No localStorage or progress tracking
- No complex JavaScript interactions
- Users explore at their own pace
- Fits naturally into the documentation flow

## Available Samples

### 1. Full-Stack JavaScript

- **Repo:** `IEvangelist/fullstack-js`
- **Stack:** ASP.NET Core API + React + TypeScript
- **Time:** ~10 minutes
- **Focus:** Understanding Aspire with familiar technologies

### 2. Aspire Starter (C#)

- Links to existing `/get-started/first-app` tutorial
- **Stack:** Blazor + Minimal APIs
- **Time:** ~5 minutes
- **Focus:** Creating apps with `aspire new`

### 3. Aspire Starter (Python)

- Links to existing `/get-started/first-app?lang=python` tutorial
- **Stack:** FastAPI + React
- **Time:** ~8 minutes
- **Focus:** Python developers trying Aspire

### 4. More Samples

- Links to `github.com/dotnet/aspire-samples`
- Encourages exploring additional scenarios

## User Flow

1. User visits `/quickstart` from sidebar (under "Get started")
2. Reads overview and tip about Codespaces
3. Browses sample cards to find interesting scenario
4. Clicks Codespaces button to launch sample
5. Follows steps in the "How to use" section:
   - Wait for setup
   - Start CodeTour
   - Run `aspire run`
   - Explore dashboard
   - Make changes
6. Reviews key takeaways
7. Chooses next step (install locally, explore integrations, etc.)

## Components

### CodespacesButton.astro

**Location:** `src/frontend/src/components/CodespacesButton.astro`

Simple component that renders the GitHub Codespaces badge:

- Takes `owner` and `repo` props
- Links to `https://codespaces.new/{owner}/{repo}`
- Uses localized title text
- Displays official GitHub badge image

**Usage:**

```mdx
<CodespacesButton owner="IEvangelist" repo="fullstack-js" />
```

## Navigation

**Sidebar location:** Under "Get started" section

- Positioned after "Install CLI"
- Before "Build your first app"
- Label: "Try in browser"
- Translated to 16 languages

## Content Guidelines

### Writing Sample Cards

Each sample card should include:

```mdx
<Card title="Sample Name" icon="icon-name">
  **Perfect for:** Target audience description
  
  **What you'll learn:**
  - Concept 1
  - Concept 2
  - Concept 3
  
  **Tech stack:** Technologies used
  
  **Time:** ~X minutes
  
  <CodespacesButton owner="username" repo="repo-name" />
  
  <details>
  <summary>What's included</summary>
  
  - Feature 1
  - Feature 2
  - Feature 3
  
  </details>
</Card>
```

### Adding New Samples

To add a new Codespaces sample:

1. Ensure the repository has:
   - `.devcontainer/devcontainer.json` with Aspire CLI installed
   - `.tours/` folder with CodeTour files
   - Comprehensive README.md

2. Add a new card to `quickstart.mdx`:

   ```mdx
   <Card title="Your Sample" icon="appropriate-icon">
     **Perfect for:** ...
     **What you'll learn:** ...
     **Tech stack:** ...
     **Time:** ~X minutes
     <CodespacesButton owner="your-org" repo="your-repo" />
   </Card>
   ```

3. Test the Codespaces launch and experience

## Design Principles

### Lightweight

- No custom components beyond CodespacesButton
- No JavaScript state management
- Fast page load and simple maintenance

### Integrated

- Looks and feels like other documentation pages
- Uses standard Starlight styling
- Consistent with site navigation

### Self-Service

- Users explore independently
- No forced linear flow
- Multiple entry points based on interest

### Informative

- Clear expectations (time, tech stack, outcomes)
- Comprehensive usage guide
- Links to next steps

## Benefits Over Previous Approach

### Before (Heavy Implementation)

- ❌ Custom standalone page with unique styling
- ❌ Complex progress tracking system
- ❌ Multiple custom components (5+)
- ❌ Forced linear flow
- ❌ Heavy JavaScript
- ❌ Difficult to maintain

### After (Streamlined)

- ✅ Standard MDX documentation page
- ✅ Uses existing Starlight components
- ✅ Minimal custom code (1 simple component)
- ✅ Self-directed exploration
- ✅ Fits site design perfectly
- ✅ Easy to add/update samples

## Maintenance

### Updating Sample Information

Edit `src/frontend/src/content/docs/quickstart.mdx` directly.

### Adding Translations

Update the sidebar label in `sidebar.topics.ts`:

```typescript
{
  label: 'Try in browser',
  translations: {
    // Add new language here
  },
  slug: 'quickstart'
}
```

### Linking New Samples

Just add a new card with a `<CodespacesButton>` component.

## Future Enhancements

Potential improvements while staying lightweight:

- **Difficulty badges** - Beginner/Intermediate/Advanced
- **Category filters** - Frontend, Backend, Full-stack, AI, etc.
- **Video previews** - Embed quick overview videos
- **Community samples** - Section for user-contributed samples
- **Time tracking** - Simple analytics on which samples are most popular

All can be done with Starlight components and minimal custom code.
