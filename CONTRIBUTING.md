# Contributing to `aspire.dev`

Thank you for your interest in contributing to the aspire.dev! This guide will help you get started with local development and contributing to the project.

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **[Node.js](https://nodejs.org/en/download)** (LTS version recommended) - For running the development server
- **[Visual Studio Code](https://code.visualstudio.com/)** - Recommended code editor
- **[Git](https://git-scm.com/downloads)** - For version control

## 🛠️ Local development setup

### 1. Clone the repository

```bash
git clone https://github.com/microsoft/aspire.dev.git
cd aspire.dev
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run the development server

```bash
npm run dev
```

This will:

- Start the Vite development server for the frontend
- Provide hot-reload capabilities

### 4. Access the application

- **Website**: <http://localhost:4321> (or the port shown in your terminal)

## 🏗️ Project structure

```text
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

## 📝 Making changes

### Documentation content

Documentation is written in either Markdown or [MDX](https://mdxjs.com/docs/what-is-mdx/) and located in `frontend/src/content/docs/`. The site uses [Starlight](https://starlight.astro.build) for documentation structure.

Key directories:

- `get-started/` - Getting started guides
- `integrations/` - Integration documentation
- `reference/` - API and technical references
- `architecture/` - Architectural guidance

More directories are being added to cover various topics.

### Adding new pages

1. Create a new `.md` or `.mdx` file in the appropriate directory under `frontend/src/content/docs/`
2. Add frontmatter with title and description:

```yaml
---
title: Your Page Title
description: A brief description of the page content
---
```

Write your content in [Markdown](https://starlight.astro.build/guides/authoring-content/).

## 🔧 Available scripts

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

## 📐 Code style and guidelines

### Markdown guidelines

- Use clear, concise language
- Include code examples where appropriate
- Add alt text for images
- Use proper heading hierarchy (H1 isn't needed as it's the page title, H2 for main sections, etc.)

### Git workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Commit with descriptive messages
5. Push to your fork
6. Create a pull request

## 🆘 Getting help

- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/microsoft/aspire.dev/issues)
- **Discussions**: Join conversations in [GitHub Discussions](https://github.com/microsoft/aspire.dev/discussions)
- **Discord**: Connect with the community on the [Aspire Discord](https://discord.com/invite/raNPcaaSj8)

## 📄 License

By contributing to this project, you agree that your contributions will be licensed under the same license as the project. See [LICENSE](LICENSE) for details.

## 🤝 Code of conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information, see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
