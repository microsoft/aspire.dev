# Testing Your Documentation

Before submitting documentation:

1. **Preview locally**: Run the site locally to verify rendering and content flow
2. **Check links**: Ensure all internal and external links work
3. **Validate code**: Test all code examples compile and run using `aspire run`
4. **Review formatting**: Verify components render correctly
5. **Run relevant tests**: Do not consider documentation or component work done until the affected tests pass
6. **Check navigation**: Confirm sidebar entries are correct
7. **Check integration logos**: At desktop and mobile widths, verify the full logo is visible, uncropped, and legible in both light and dark themes

## Documentation Validation Strategy

Use the smallest set of checks that proves the change is correct:

- For MDX copy, structure, and navigation changes, verify the page locally and check the edited links.
- For custom component usage changes, run the component render tests that cover the affected behavior.
- For component prop surface changes, update and run the prop-contract coverage so editor completions and consumer typings stay intact.
- For interactive behavior changes, run targeted Playwright coverage for the scenario you changed rather than relying on unrelated broad suites.
- For browser-based local verification, use `playwright-cli` (`playwright-cli open <frontend-url>`, `playwright-cli snapshot`, `playwright-cli click <ref>`) instead of Playwright MCP tools.
- For accessibility-sensitive changes, validate both the rendered page and any focused accessibility tests that exercise the affected interaction.

## Custom Component and Test Expectations

If a documentation change adds, removes, or materially changes a custom component, you should usually update one or more of these test layers:

- `src/frontend/tests/unit/custom-components.vitest.test.ts` for runtime render coverage of custom Astro components.
- `src/frontend/tests/typecheck/component-props.contracts.ts` when component props change and the public prop contract should remain typed for MDX and other consumers.
- `src/frontend/tests/e2e/*.spec.ts` for user-visible interactions that depend on hydration, persistence, navigation, or accessibility behavior.

Examples of scenarios that often merit targeted tests:

- query-string or local-storage persistence
- cookie-consent or preference-driven behavior
- responsive behavior that changes across desktop, tablet, and mobile
- keyboard navigation, focus management, or screen-reader labeling
- repeated code examples that need distinct accessible labels or titles

- RSS, analytics, or other generated/static asset behaviors exposed through docs pages

## Recommended Frontend Test Commands

Prefer targeted validation over the slowest possible full-site build when the change does not require it.

```bash
pnpm --dir ./src/frontend run test:unit:components
pnpm --dir ./src/frontend run test:unit:contracts
pnpm --dir ./src/frontend exec playwright test tests/e2e/<relevant-spec>.spec.ts
```

If you changed custom components, docs interactions, or accessibility behavior, make sure the relevant targeted tests pass before submitting the work.

## Installing the Aspire CLI

Ensure you have the appropriate version of the Aspire CLI installed for testing. The version depends on what you're documenting:

### GA/Stable Builds (Default)

For documenting released features:

```bash
# Linux/macOS
curl -sSL https://aspire.dev/install.sh | bash

# Windows (PowerShell)
irm https://aspire.dev/install.ps1 | iex
```

For complete installation instructions, see [Install Aspire CLI](https://aspire.dev/get-started/install-cli/).

### Nightly/Dev Builds

For documenting features on the main branch that haven't been released yet:

```bash
# Linux/macOS
curl -sSL https://aspire.dev/install.sh | bash -s -- --quality dev

# Windows (PowerShell)
iex "& { $(irm https://aspire.dev/install.ps1) } -Quality 'dev'"
```

You can also access this via the download icon on aspire.dev and selecting "Dev" from the Channel selector.

### PR Builds

For documenting features in specific pull requests before they merge:

1. Go to the PR in [microsoft/aspire](https://github.com/microsoft/aspire)
2. Find the build artifacts in the Checks/Actions section
3. Download and install the CLI from the PR artifacts

This is useful for getting an early start on documentation for upcoming features.

### Staging Builds

For prerelease builds from the current release branch:

```bash
# Linux/macOS
curl -sSL https://aspire.dev/install.sh | bash -s -- --quality staging

# Windows (PowerShell)
iex "& { $(irm https://aspire.dev/install.ps1) } -Quality 'staging'"
```

## Running Locally

The documentation site can be run locally using the Aspire CLI:

```bash
aspire run
```

<Aside type="tip">
When testing code examples that add integration packages, use `aspire add <package-name>` rather than `dotnet add package`. The Aspire CLI automatically adds packages to the correct project.
</Aside>

Use the Aspire CLI output or dashboard resource list to find the `frontend` endpoint, then open it with `playwright-cli`:

```bash
playwright-cli open <frontend-url>
playwright-cli snapshot
```

Use snapshot refs with `playwright-cli click <ref>` for page interactions.
