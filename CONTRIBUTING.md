# Contributing to Aspire Documentation

Thank you for your interest in contributing to the Aspire documentation website! This guide will help you get started with local development and contributing to the project.

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **[.NET 9.0 SDK](https://dotnet.microsoft.com/download/dotnet/9.0)** - Required for the Aspire AppHost
- **[Aspire CLI](https://aspire.dev/get-started/install-cli/)** - For running Aspire
- **[Node.js](https://nodejs.org/en/download)** (LTS version recommended) - For frontend development
- **[Git](https://git-scm.com/downloads)** - For version control

## 🛠️ Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/microsoft/aspire.dev.git
cd aspire.dev
```

### 2. Run the Development Environment

Use Aspire's orchestration to manage the entire development environment:

```bash
aspire run
```

This will:

- Start the Aspire dashboard
- Automatically install Node.js dependencies
- Launch the Vite development server for the frontend
- Provide hot-reload capabilities
- Open your browser to the local site

### 3. Access the Application

- **Website**: <http://localhost:4321> (or the port shown in your terminal)
- **Aspire Dashboard**: <https://localhost:17154> (when using AppHost)

## 🏗️ Project Structure

```text
└───📂 src
   ├───📂 apphost
   │    └───📂 Aspire.Dev.AppHost    # AppHost (Aspire orchestration)
   └───📂 frontend                   # Astro + Starlight documentation site
      ├───📂 src
      │    ├───📂 components         # Reusable Astro components
      │    ├───📂 content
      │    │    ├───📂 docs          # Markdown / MDX documentation pages
      │    │    └───📂 i18n          # Component translation locales
      │    ├───📂 data               # JSON integration & metadata
      │    ├───📂 styles             # Global & theme CSS
      │    └───📂 assets             # Images, videos, media
      ├───📂 scripts                 # Build & data update scripts
      └───📂 public                  # Static assets served as-is
```

## 📝 Making Changes

### Documentation Content

Documentation is written in either Markdown or [MDX](https://mdxjs.com/docs/what-is-mdx/) and located in `src/frontend/src/content/docs/`. The site uses [Starlight](https://starlight.astro.build) for documentation structure.

Key directories:

- `get-started/` - Getting started guides
- `integrations/` - Integration documentation
- `reference/` - API and technical references
- `architecture/` - Architectural guidance

### Adding New Pages

1. Create a new `.md` or `.mdx` file in the appropriate directory under `src/frontend/src/content/docs/`
2. Add frontmatter with title and description:

```yaml
---
title: Your Page Title
description: A brief description of the page content
---
```

Write your content in [Markdown](https://starlight.astro.build/guides/authoring-content/).

## 🔧 Available Scripts

All scripts should be run from the root directory:

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## 🧪 Testing

Currently, this project focuses on content and doesn't include automated tests. However, you should verify your changes by:

1. **Local Testing**: Run the development server and verify your changes work correctly
2. **Build Testing**: Ensure the production build completes successfully:

   ```bash
   npm run build
   ```

3. **Link Validation**: The build process includes link validation to catch broken links
4. **Visual Review**: Check that your changes look correct across different screen sizes

## 📐 Code Style and Guidelines

### Markdown Guidelines

- Use clear, concise language
- Include code examples where appropriate
- Add alt text for images
- Use proper heading hierarchy (H1 isn't needed as it's the page title, H2 for main sections, etc.)

### Git Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Commit with descriptive messages
5. Push to your fork
6. Create a pull request

## 🆘 Getting Help

- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/microsoft/aspire.dev/issues)
- **Discussions**: Join conversations in [GitHub Discussions](https://github.com/microsoft/aspire.dev/discussions)
- **Discord**: Connect with the community on the [Aspire Discord](https://discord.com/invite/raNPcaaSj8)

## 📄 License

By contributing to this project, you agree that your contributions will be licensed under the same license as the project. See [LICENSE](LICENSE) for details.

## 🤝 Code of Conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information, see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
