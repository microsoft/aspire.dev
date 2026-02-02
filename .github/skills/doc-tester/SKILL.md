---
name: doc-tester
description: Agent for validating Aspire documentation against actual behavior. Use when auditing documentation accuracy, testing examples, or identifying discrepancies between documentation and implementation.
---

# Documentation Tester Skill

This skill provides guidelines for AI agents to systematically validate the aspire.dev documentation site against the actual behavior of Aspire. The goal is to identify discrepancies between what the documentation claims and what Aspire actually does.

## ⚠️ CRITICAL: User-Centric Testing Approach

**You are testing the documentation as if you were a new user learning Aspire.**

### Core Principles

1. **Use Playwright exclusively** to browse and interact with the documentation site
2. **Never read source code** to understand how things work - rely only on what the docs tell you
3. **Follow the documentation literally** - copy code examples exactly as shown
4. **Evaluate teaching effectiveness** - can you learn from this documentation?

### What This Means

❌ **DO NOT:**
- Read Aspire source code to understand behavior
- Check implementation details in the dotnet/aspire repository
- Look at test files to understand expected behavior
- Use internal knowledge of the codebase
- Silently fill gaps with your built-in knowledge - flag them instead

✅ **DO:**
- Use Playwright MCP tools to navigate the documentation site
- Read documentation content as displayed in the browser
- Copy code examples and run them in test projects
- Evaluate if explanations make sense without prior knowledge
- Flag when you use intrinsic knowledge to fill documentation gaps

### When You Get Stuck

If documentation is insufficient to proceed:

1. **Document the blocker** - What were you trying to do? What information was missing?
2. **Describe the gap** - What would a user need to know to succeed?
3. **Hand off to doc-writer** - Create a task for the doc-writer skill to fix it
4. **Move on** - Continue testing other areas

This is valuable feedback! Gaps in documentation are exactly what we're trying to find.

### Knowledge Source Awareness

**Be critical of the documentation by distinguishing between what you know and where that knowledge came from.**

As an AI agent, you have built-in knowledge about programming concepts, frameworks, and common patterns. When testing documentation, constantly ask yourself:

#### Documentation Takes Priority

The aspire.dev documentation covers the full spectrum of the Aspire experience - from installation and project creation to advanced scenarios. **When the documentation you're testing provides instructions for a task, follow those instructions exactly, even if this skill provides different guidance.**

For example:
- If testing a "Getting Started" page that shows how to create a project, use the commands in that documentation - not the project creation steps in this skill
- If an integration doc specifies how to add packages, follow those steps rather than the general guidance here
- The skill's instructions are defaults; the documentation being tested overrides them

This ensures you're actually testing whether the documentation works, not whether this skill's instructions work.

#### Questions to Ask

1. **"Did I learn this from the documentation, or did I already know it?"**
   - If you already knew it, would a new user know it too?
   - Is it reasonable to assume this knowledge, or should the docs explain it?

2. **"Am I filling in gaps with my own knowledge?"**
   - If you had to use prior knowledge to complete a step, the documentation may be incomplete
   - Document these gaps even if you were able to proceed

3. **"Would this make sense to someone unfamiliar with [concept]?"**
   - Aspire users come from diverse backgrounds (different languages, experience levels)
   - Don't assume familiarity with .NET, containers, cloud concepts, etc.

#### Examples

| Situation | Question to Ask | Documentation Gap? |
|-----------|-----------------|-------------------|
| You know what a connection string is | Would a Python developer know this? | Maybe - consider if it needs explanation |
| You understand dependency injection | Does the doc explain DI or assume it? | If assumed, should link to prerequisites |
| You know `aspire run` starts all resources | Did the doc say this, or did you just know? | If not stated, it should be |
| You recognize a Redis configuration pattern | Is this explained or assumed knowledge? | New users may not recognize it |

#### Reporting Knowledge Gaps

When you identify that you used intrinsic knowledge to proceed, flag it in your report:

```markdown
### Knowledge Gap: [Topic]

**What I needed to know:** [Description]
**Source of my knowledge:** Built-in/prior knowledge (NOT from documentation)
**User impact:** [Who might struggle without this knowledge?]
**Recommendation:** 
- [ ] Add explanation to this page
- [ ] Link to prerequisite documentation
- [ ] Reasonable to assume (explain why)
```

## Testing Goals

### 1. Teaching Effectiveness

Can someone learn Aspire from these docs alone?

- Are concepts introduced in a logical order?
- Are prerequisites clearly stated?
- Do examples build on each other progressively?
- Is terminology explained before being used?
- Are common mistakes or gotchas addressed?

### 2. Accuracy & Correctness

Does the documentation match reality?

- Do code examples compile and run?
- Are API signatures and parameters correct?
- Do claimed features actually exist?
- Are limitations and caveats documented?

## Environment Setup

### Installing the Aspire CLI

Before testing, ensure you have the appropriate version of the Aspire CLI installed. The version needed depends on what you're testing:

#### GA/Stable Builds (Default)

For testing documentation of released features, use the stable release:

```bash
# Linux/macOS
curl -sSL https://aspire.dev/install.sh | bash

# Windows (PowerShell)
irm https://aspire.dev/install.ps1 | iex
```

For complete installation instructions, see the [Install Aspire CLI](/get-started/install-cli/) page on the documentation site.

#### Nightly/Dev Builds

For testing documentation of features being developed on the main branch, use the dev channel:

```bash
# Linux/macOS
curl -sSL https://aspire.dev/install.sh | bash -s -- --quality dev

# Windows (PowerShell)
iex "& { $(irm https://aspire.dev/install.ps1) } -Quality 'dev'"
```

You can also find the dev channel option by clicking the download icon on the aspire.dev site and selecting "Dev" from the Channel dropdown.

<Aside type="caution">
Dev builds are the latest from the main branch and may be unstable. Only use for testing upcoming features.
</Aside>

#### PR Builds

For testing documentation of features in specific pull requests (before they're merged), you need to install the CLI from the PR artifacts:

1. Navigate to the PR in the [dotnet/aspire](https://github.com/dotnet/aspire) repository
2. Find the "Checks" or "Actions" section of the PR
3. Look for the build artifacts that contain the CLI
4. Download and install the CLI from the PR-specific build artifacts

PR builds are useful when writing documentation ahead of feature merges.

#### Staging Builds

For testing prerelease builds from the current release branch:

```bash
# Linux/macOS
curl -sSL https://aspire.dev/install.sh | bash -s -- --quality staging

# Windows (PowerShell)
iex "& { $(irm https://aspire.dev/install.ps1) } -Quality 'staging'"
```

### Aspire App Model

The aspire.dev workspace uses Aspire to orchestrate local services. The app model in `apphost.cs` defines the documentation site resources. Use `mcp_aspire_list_resources` to get the current resource states and URLs.

### Starting the Local Environment

⚠️ **CRITICAL: Terminal Isolation**

Aspire must run in an **isolated background process** to avoid interference with other terminal commands.

**Start Aspire:**

```bash
cd /path/to/aspire.dev
aspire run
```

Use the Aspire MCP tools to get the content URL:

```
# Call the MCP tool
mcp_aspire_list_resources

# Look for the frontend resource endpoint_urls
# Example output: http://frontend.dev.localhost:5000
```

**IMPORTANT**: Use the local frontend URL for all testing, not https://aspire.dev

### Creating Test Projects

To test code examples accurately, create test projects using the Aspire CLI.

```bash
# Create a test directory in the workspace
mkdir -p .doc-tester-workspace
cd .doc-tester-workspace

# Create a new Aspire project using templates
aspire new aspire-starter -n DocTest -o DocTest
cd DocTest
```

Use `aspire new --list` to see all available project templates. Choose a template that matches the documentation you're testing (e.g., Python, JavaScript, or .NET projects).

## Purpose

The doc-tester agent produces actionable feedback that can:
1. Trigger the **doc-writer** skill to correct documentation inaccuracies
2. Identify product design issues that need to be addressed in Aspire
3. Surface missing documentation for existing features
4. Find broken examples or outdated instructions

## Scope

### What to Test

| Area | Description |
|------|-------------|
| **Conceptual accuracy** | Do explanations match actual Aspire behavior? |
| **Code examples** | Do code samples compile and run as described? |
| **CLI commands** | Do Aspire CLI commands work as documented? |
| **Integration docs** | Are integration configurations accurate? |
| **Navigation & links** | Do internal links work? Are pages accessible? |
| **Feature coverage** | Are all significant features documented? |

### Documentation Structure

The documentation site includes:

```
/                           # Landing page
/get-started/               # Getting started guides
    prerequisites
    install-cli
    first-app
    app-host
    deploy-first-app
    ...
/fundamentals/             # Core concepts
    app-host
    networking-overview
    service-defaults
    ...
/integrations/             # Per-integration documentation
    databases/
    caching/
    messaging/
    ai/
    ...
/deployment/               # Deployment guides
/diagnostics/              # Diagnostics and telemetry
/dashboard/                # Dashboard documentation
/testing/                  # Testing guides
/reference/                # API and CLI reference
/whats-new/                # Release notes
```

## Testing Workflow

**All testing uses Playwright MCP tools to interact with the documentation site.**

### Phase 0: Environment Preparation

1. **Start Aspire**: Run `aspire run` from the repository root
2. **Get frontend URL**: Use `mcp_aspire_list_resources` to find the `frontend` endpoint
3. **Note the URL**: The script outputs the local development URL

### Phase 1: Navigate and Read Documentation (Playwright)

Use Playwright MCP tools to browse the documentation:

```
# Take an accessibility snapshot to read page content
mcp_playwright_browser_snapshot

# Navigate to a page
mcp_playwright_browser_click with element="Getting Started link"

# Read page content
mcp_playwright_browser_snapshot
```

For each documentation page:

1. **Navigate to the page** using Playwright click actions
2. **Take a snapshot** to read the page content
3. **Evaluate the content** - Is it clear? Complete? Accurate?
4. **Note any confusion** - What would a new user struggle with?

### Phase 2: Test CLI Commands

For CLI commands shown in the documentation:

1. **Copy the command exactly** as shown in the browser
2. **Run the command** in the terminal
3. **Verify output** - Does it match what the docs describe?
4. **Test variations** - Do optional parameters work as documented?

#### Example: Testing aspire new

```bash
# Create a test directory
cd /path/to/aspire.dev/.doc-tester-workspace
mkdir -p cli-tests && cd cli-tests

# Test the command from documentation
aspire new aspire-starter -n TestApp -o TestApp

# Verify the output matches documentation claims
ls TestApp/
```

### Phase 3: Test Code Examples

For each code example shown in the documentation:

1. **Copy the code exactly** as shown in the browser
2. **Create a test project** in the workspace directory
3. **Build the code** - does it compile without errors?
4. **Run and observe** - does it behave as documented?

#### Step 1: Create Test Project

```bash
# Navigate to workspace
cd /path/to/aspire.dev/.doc-tester-workspace

# Create a project using an appropriate Aspire template
aspire new aspire-starter -n ExampleTest -o ExampleTest
cd ExampleTest
```

Use `aspire new --list` to view available templates. Choose a template that matches the language or framework in the documentation you're testing.

#### Step 2: Add Required Packages

Based on the documentation being tested, use the Aspire CLI to add integration packages:

```bash
# Add hosting packages using Aspire CLI (preferred)
aspire add Aspire.Hosting.Redis

# Or add client packages
aspire add Aspire.StackExchange.Redis
```

<Aside type="tip">
The `aspire add` command automatically adds packages to the correct project and handles any additional configuration. Only fall back to `dotnet add package` if the Aspire CLI is not available.
</Aside>

#### Step 3: Apply Code Examples

Copy the code examples from the documentation into your test project exactly as shown. This may involve:
- Updating source files (e.g., `Program.cs`, `app.py`, `server.js`)
- Adding configuration files
- Any other steps the documentation specifies

<Aside type="note">
Aspire is polyglot and supports multiple languages (C#, Python, JavaScript, etc.). Follow the documentation's instructions for your target language. The docs should include any language-specific build steps if required.
</Aside>

#### Step 4: Run and Verify

Use `aspire run` to build and run the application:

```bash
aspire run
```

Aspire handles building and orchestrating all resources. If the documentation specifies additional build or run commands for specific languages, follow those instructions and verify they work as documented.

### Phase 4: Test Integration Documentation

For integration documentation:

1. **Verify package installation** - Does the documented package exist?
2. **Test basic usage** - Does the minimal example work?
3. **Test configuration** - Do configuration options work as described?
4. **Check health checks** - Do documented health checks function?

```bash
# Verify package exists using Aspire CLI
aspire add Aspire.Hosting.Technology

# If package not found, document as error
```

### Phase 5: Evaluate Teaching Effectiveness

As you navigate, evaluate:

1. **Concept flow** - Are ideas introduced in a logical order?
2. **Prerequisites** - Is prior knowledge clearly stated?
3. **Completeness** - Can you accomplish tasks with just the docs?
4. **Clarity** - Would a new user understand this?

**When you get stuck:**
- Document what you were trying to do
- Note what information was missing
- This becomes a doc-writer task

## Focus Area Templates

When given a focus area, use these templates to guide testing:

### Getting Started Focus

```markdown
## Focus: Getting Started Guide

### Page: /get-started/[page-name]

#### Navigation (Playwright)
- [ ] Page loads successfully
- [ ] All sections visible in snapshot
- [ ] Code examples readable
- [ ] Links to related pages work

#### CLI Command Testing
- [ ] `aspire new` commands work as shown
- [ ] Template names are correct
- [ ] Output matches documentation

#### Content Clarity
- [ ] Prerequisites are clearly stated
- [ ] Steps are in logical order
- [ ] New users can follow without prior knowledge

#### Code Example Testing
- [ ] Example 1: Compiles and runs as described
- [ ] Example 2: Compiles and runs as described
```

### Integration Documentation Focus

```markdown
## Focus: [Integration Name] Integration

### Page: /integrations/[category]/[integration]

#### Package Verification
- [ ] Hosting package exists on NuGet
- [ ] Client package exists on NuGet (if applicable)
- [ ] Package names match documentation

#### Hosting Integration
- [ ] Basic example compiles
- [ ] Resource is created correctly
- [ ] Configuration options work
- [ ] Health checks function (if documented)

#### Client Integration (if applicable)
- [ ] Client registration works
- [ ] Keyed services work
- [ ] Configuration providers work
- [ ] Connection strings work

#### Cross-References
- [ ] Links to official docs work
- [ ] Links to related Aspire docs work
- [ ] See also section is complete
```

### Fundamentals Focus

```markdown
## Focus: [Concept Name]

### Page: /fundamentals/[concept]

#### Conceptual Accuracy
- [ ] Explanations match actual behavior
- [ ] Diagrams are accurate
- [ ] Terminology is consistent

#### Code Examples
- [ ] All examples compile
- [ ] All examples run as described
- [ ] Edge cases are addressed

#### Completeness
- [ ] All major features covered
- [ ] Common use cases addressed
- [ ] Gotchas and limitations noted
```

## Output Format

After testing a focus area, produce a structured report:

```markdown
# Documentation Test Report

**Focus Area:** [Description]
**Date:** [ISO Date]
**Tester:** doc-tester agent

## Summary

| Category | Passed | Failed | Warnings |
|----------|--------|--------|----------|
| Content Accuracy | X | Y | Z |
| Code Examples | X | Y | Z |
| CLI Commands | X | Y | Z |
| Links | X | Y | Z |

## Critical Issues

Issues that make documentation misleading or incorrect.

### Issue 1: [Brief Title]

**Location:** [Page URL and section]
**Type:** [Content/Example/CLI/Link]
**Severity:** Critical

**What the documentation says:**
> [Quote from documentation]

**What actually happens:**
> [Description of actual behavior]

**Evidence:**
[Code snippet, error message, or screenshot description]

**Recommended Action:**
- [ ] Update documentation to match behavior
- [ ] Fix implementation to match documentation
- [ ] Add clarifying note

---

## Warnings

Issues that may confuse readers but aren't strictly incorrect.

### Warning 1: [Brief Title]

**Location:** [Page URL and section]
**Issue:** [Description]
**Suggestion:** [How to improve]

---

## Passed Checks

[List of items that passed validation - brief summary]

## Recommendations

1. **Priority fixes:** [List critical issues to address first]
2. **Documentation gaps:** [Missing documentation to add]
3. **Product issues:** [Implementation bugs discovered]
```

## Test Workspace Management

### Workspace Location

Use `.doc-tester-workspace/` in the repository root for all test projects. This directory is gitignored.

```bash
# Standard workspace structure
.doc-tester-workspace/
├── cli-tests/           # CLI command testing
├── integration-tests/   # Integration testing
├── example-tests/       # Code example testing
└── screenshots/         # Captured screenshots
```

### Cleanup

After testing, clean up test projects:

```bash
# Remove test workspace contents
rm -rf .doc-tester-workspace/*
```

Keep the workspace directory but remove contents to avoid cluttering the repository.

## Common Testing Scenarios

### Testing a New Integration Doc

1. Navigate to the integration page with Playwright
2. Verify package names are correct
3. Create a test AppHost project
4. Add the hosting package using `aspire add <package-name>`
5. Copy the basic usage example
6. Build and run with `aspire run`
7. Verify the resource appears in the dashboard
8. If client integration exists, add using `aspire add` and test client registration

### Testing CLI Documentation

1. Navigate to the CLI reference page
2. Copy each command example
3. Run in a fresh directory
4. Verify output matches documentation
5. Test documented options and flags

### Testing Getting Started Guide

1. Start from a completely fresh environment (new directory)
2. Follow every step exactly as written
3. Do not use prior knowledge to fill gaps
4. Document any place where you got stuck
5. Verify final result matches what's promised

## Using MCP Tools

### Aspire MCP Tools

Use for checking resource status:

```
mcp_aspire_list_resources        # Get all resources and URLs
mcp_aspire_list_console_logs     # Check resource logs
mcp_aspire_list_structured_logs  # Check structured logs
```

### Playwright MCP Tools

Use for navigating and reading documentation:

```
mcp_playwright_browser_navigate   # Go to a URL
mcp_playwright_browser_snapshot   # Read page content
mcp_playwright_browser_click      # Click elements
mcp_playwright_browser_type       # Type text
mcp_playwright_browser_screenshot # Capture screenshot
```

### Hex1b Terminal MCP Tools

The Hex1b MCP server provides tools for interacting with terminal sessions and capturing terminal output. This is particularly useful for:

- **Capturing terminal screenshots** for documentation evidence
- **Recording asciinema sessions** (`.cast` files) for documentation

#### Available Tools

First, activate the terminal tools you need:

```
activate_terminal_session_creation_tools  # Start bash/powershell sessions
activate_terminal_interaction_tools       # Screenshots, text capture, input
```

Then use the terminal tools:

```
mcp_hex1b_list_terminals          # List active terminal sessions
mcp_hex1b_start_bash_terminal     # Start a new bash session
mcp_hex1b_start_pwsh_terminal     # Start a new PowerShell session
mcp_hex1b_send_terminal_input     # Send commands to terminal
mcp_hex1b_wait_for_terminal_text  # Wait for specific output
mcp_hex1b_capture_terminal_screenshot  # Capture terminal as SVG
mcp_hex1b_capture_terminal_text   # Capture terminal text content
mcp_hex1b_record_asciinema        # Record terminal session as .cast file
```

#### Asciinema Recordings

The aspire.dev documentation uses asciinema recordings (`.cast` files) to show terminal interactions. These provide a better user experience than static screenshots.

**Existing recordings location**: `src/frontend/public/casts/`

**Examples of existing recordings**:
- `aspire-version.cast` - Shows `aspire --version` command
- `aspire-new.cast` - Shows project creation
- `aspire-run.cast` - Shows running an Aspire app
- `mcp-init.cast` - Shows MCP initialization

When testing CLI documentation, consider whether an asciinema recording would better demonstrate the command output than a static code block.

## Reporting Guidelines

### Issue Severity Levels

| Severity | Description | Examples |
|----------|-------------|----------|
| **Critical** | Documentation is wrong/misleading | Incorrect API signature, broken example |
| **High** | Major functionality undocumented | Missing required configuration step |
| **Medium** | Minor inaccuracy or unclear | Typo in package name, unclear explanation |
| **Low** | Enhancement suggestion | Could add more examples, better formatting |

### Evidence Requirements

For each issue, provide:

1. **Exact quote** from documentation
2. **Steps to reproduce** the discrepancy
3. **Actual result** observed
4. **Expected result** based on documentation
5. **Screenshot or error message** when applicable

### Hand-off to doc-writer

When creating a task for doc-writer, include:

```markdown
## Documentation Fix Required

**Page:** /path/to/page
**Section:** Section heading

**Current Content:**
> [Quoted text from docs]

**Problem:**
[Description of what's wrong]

**Suggested Fix:**
[What the documentation should say]

**Verification:**
[How to verify the fix is correct]
```

## Common Issues Checklist

Based on patterns from PR feedback, actively look for these common documentation issues:

### Writing Quality Issues

| Issue | What to Check |
|-------|---------------|
| **Grammatical errors** | "Now, that you have..." should be "Now that you have..." |
| **Spelling errors** | Watch for typos like "volumme", "dependenceies", "follwing" |
| **Unused imports** | Components imported but never used in the document |
| **Casual language** | Informal phrases like "treat yourself to a coffee" |
| **Duplicate content** | Similar Asides or explanations appearing multiple times |

### Link Verification

| Issue | What to Check |
|-------|---------------|
| **Broken internal links** | Links pointing to non-existent pages |
| **Outdated paths** | `/get-started/setup-and-tooling/` should be `/get-started/prerequisites/` |
| **Anchor links** | Links to `#section-name` where the section doesn't exist |
| **Missing redirects** | Old page paths that should redirect to new locations |

### Code Example Issues

| Issue | What to Check |
|-------|---------------|
| **Syntax errors** | `main.app` instead of `main:app` for Python uvicorn |
| **Duplicate language identifiers** | `csharp csharp` instead of just `csharp` |
| **Undefined variables** | Variables used in code but not defined earlier |
| **Wrong indentation style** | Aligned indentation instead of standard 4-space |
| **Incorrect technical descriptions** | Calling `process.env` a "method" (it's an object) |
| **Deprecated APIs** | Using deprecated APIs as primary examples |
| **Insecure defaults** | `TrustServerCertificate=true` without dev-only warnings |

### Component Issues

| Issue | What to Check |
|-------|---------------|
| **Mismatched Pivot/PivotSelector** | Pivot components missing correct `key` attribute |
| **Card text overflow** | LinkCard descriptions too long for the UI |
| **Incorrect health check links** | Links pointing to wrong technology's health check |

### Cross-Language Documentation

| Issue | What to Check |
|-------|---------------|
| **Inconsistent resource names** | Different names used across C#/Python/JavaScript examples |
| **Missing variable definitions** | Removing a section that defines variables used later |
| **Wrong environment variable format** | Using `:` vs `__` separator for different languages |

## Testing Code Examples

When testing code examples, verify:

1. **All imports/usings are present** - Code should compile without adding missing imports
2. **Variable names match** - The connection name in client code matches the resource name in AppHost
3. **Complete examples** - Code blocks show runnable examples, not just fragments
4. **Correct package names** - NuGet package names are spelled correctly
5. **Working links** - Links to external resources (GitHub, NuGet) are valid
