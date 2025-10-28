# GitHub Copilot Instructions

This file provides context and instructions for GitHub Copilot when working on the Aspire documentation website.

## Repository Overview

This repository contains the source code for the official [Aspire documentation website](https://aspire.dev). Aspire is a modern application orchestration framework for building cloud-native distributed applications with .NET.

## Project Architecture

### Technology Stack
- **Frontend**: Astro + Starlight (TypeScript-based static site generator)
- **Orchestration**: .NET 9.0 with Aspire AppHost
- **Styling**: CSS with Catppuccin themes (light/dark mode support)
- **Content**: Markdown-based documentation with frontmatter

### Project Structure
```
src/
├── apphost/                    # Aspire orchestration
│   └── Aspire.Dev.AppHost/     # .NET project for development orchestration
├── frontend/                   # Astro documentation site
│   ├── src/
│   │   ├── components/         # Reusable Astro components
│   │   ├── content/docs/       # Main documentation (Markdown)
│   │   ├── data/               # JSON data files (integrations, testimonials)
│   │   ├── styles/             # CSS styling
│   │   └── assets/             # Static assets (images, videos)
│   ├── scripts/                # Build and data update scripts
│   └── public/                 # Static public assets
```

## Development Workflow

### Local Development
Always use Aspire orchestration for development:
```bash
cd src/apphost/Aspire.Dev.AppHost
dotnet run
```

This automatically:
- Installs Node.js dependencies
- Starts the Vite development server
- Provides hot-reload capabilities
- Opens the Aspire dashboard

### Build Process
- **Frontend**: `npm run build` (in src/frontend/)
- **AppHost**: `dotnet build` (in src/apphost/Aspire.Dev.AppHost/)

## Content Guidelines

### Documentation Structure
- Use **Starlight** conventions for documentation
- Content lives in `src/frontend/src/content/docs/`
- Follow the existing directory structure:
  - `get-started/` - Getting started guides
  - `integrations/` - Integration documentation
  - `reference/` - API and technical references
  - `architecture/` - Architectural guidance
  - `community/` - Community resources

### Markdown Conventions
- Use **clear, concise language**
- Include **code examples** where appropriate
- Add **alt text** for images
- Use **proper heading hierarchy** (H1 for page title, H2 for main sections)
- Include **frontmatter** for all pages:
  ```yaml
  ---
  title: Page Title
  description: Brief description of the page content
  ---
  ```

### Component Development
- Use **TypeScript** for new components
- Follow **Astro component guidelines**
- Ensure components are **accessible and responsive**
- Place components in `src/frontend/src/components/`

## Styling Guidelines

### Theme System
- Uses **Catppuccin themes** (light: latte, dark: mocha)
- Supports **automatic theme switching**
- Custom CSS in `src/frontend/src/styles/`

### CSS Conventions
- Use **CSS custom properties** for theming
- Follow **responsive design principles**
- Maintain **accessibility standards**
- Use **semantic HTML** elements

### Fonts
- Primary: **Outfit** (variable font)
- Secondary: **Rubik** (variable font)

## Code Style

### TypeScript/JavaScript
- Use **TypeScript** for type safety
- Follow **Astro conventions**
- Use **meaningful variable names**
- Include **JSDoc comments** for complex functions

### .NET/C#
- Follow **standard .NET conventions**
- Use **meaningful class and method names**
- Include **XML documentation** for public APIs
- Target **.NET 9.0**

### Markdown
- Use **fenced code blocks** with language specification
- Include **proper alt text** for images
- Use **descriptive link text**
- Follow **consistent heading structure**

## Integration Data

### Automated Updates
- Integration data is pulled from **NuGet API**
- Updated via scripts: `npm run update:integrations`
- GitHub stats updated via: `npm run update:github-stats`
- Combined update: `npm run update:all`

### Data Structure
- Integration data stored in `src/frontend/src/data/aspire-integrations.json`
- Contains package information, descriptions, download counts, versions

## Common Tasks

### Adding New Documentation
1. Create `.mdx` file in appropriate `src/frontend/src/content/docs/` subdirectory
2. Add frontmatter with title and description
3. Write content following markdown conventions
4. Test locally using Aspire orchestration

### Creating Components
1. Create `.astro` file in `src/frontend/src/components/`
2. Use TypeScript for props and logic
3. Follow accessibility guidelines
4. Test responsive behavior

### Updating Styles
1. Modify files in `src/frontend/src/styles/`
2. Use CSS custom properties for theme compatibility
3. Test in both light and dark modes
4. Ensure responsive design

## Testing

### Local Validation
- Run `dotnet run` in AppHost directory
- Verify changes in browser
- Test responsive design
- Check both light/dark themes

### Build Validation
- Frontend: `npm run build` should complete successfully
- AppHost: `dotnet build` should complete without errors
- CI will validate both builds automatically

## Terminology

### Preferred Terms
- Use **"Aspire"** (not ".NET Aspire")
- **"Integration"** for NuGet packages
- **"Component"** for Astro components
- **"AppHost"** for the orchestration project

### Avoid
- Don't use deprecated API patterns
- Avoid hard-coded URLs (use relative paths)
- Don't include sensitive information in code

## File Naming Conventions

### Documentation Files
- Use **kebab-case** for file names: `getting-started.mdx`
- Match directory structure to navigation
- Use descriptive, clear names

### Component Files
- Use **PascalCase** for component names: `IntegrationCard.astro`
- Include component type in name when helpful
- Group related components in subdirectories

### Asset Files
- Use **descriptive names** with appropriate extensions
- Optimize images before committing
- Use appropriate formats (WebP for photos, SVG for graphics)

## Dependencies

### Key Frontend Dependencies
- `astro` - Core framework
- `@astrojs/starlight` - Documentation theme
- `@catppuccin/starlight` - Color theme
- `mermaid` - Diagram support
- `asciinema-player` - Terminal recording playback

### Key .NET Dependencies
- `Aspire.Hosting.AppHost` - Core Aspire hosting
- `Aspire.Hosting.NodeJs` - Node.js integration
- `CommunityToolkit.Aspire.Hosting.NodeJS.Extensions` - Enhanced Node.js support

## Accessibility

### Requirements
- Maintain **WCAG 2.1 AA compliance**
- Include **proper alt text** for images
- Use **semantic HTML** elements
- Ensure **keyboard navigation** works
- Test with **screen readers**

### Implementation
- Use Astro's built-in accessibility features
- Include **focus management** in interactive components
- Provide **skip links** where appropriate
- Use **sufficient color contrast**

## Performance

### Optimization Guidelines
- Use **static site generation** where possible
- Optimize **images and videos**
- Minimize **JavaScript bundle size**
- Implement **lazy loading** for heavy content
- Use **appropriate caching strategies**

This repository demonstrates Aspire's capabilities by using Aspire itself for development orchestration - it's a great example of "dogfooding" the technology we're documenting.