---
on:
  workflow_dispatch:
  schedule: weekly

description: "Records asciinema terminal sessions for all documented Aspire CLI commands using hex1b and proposes a PR with updated cast files."

engine:
  id: copilot
  agent: cli-cast-recorder

permissions:
  contents: read

runtimes:
  dotnet:
    version: "10.0"

strict: false

network:
  allowed:
    - defaults
    - dotnet
    - github
    - "aspire.dev"

tools:
  edit:
  bash: [":*"]
  web-fetch:
  github:
    toolsets: [repos]

safe-outputs:
  create-pull-request:
    title-prefix: "[cli-casts] "
    labels: [automation, documentation]

timeout-minutes: 60
---

# Update CLI Cast Recordings

Record asciinema terminal sessions for every documented Aspire CLI command and save them to `src/frontend/public/casts/`.

## Setup

1. Install the Aspire CLI:

```bash
curl -sSL https://aspire.dev/install.sh | bash
export PATH="$HOME/.aspire/bin:$PATH"
```

2. Install hex1b for terminal recording:

```bash
dotnet tool install -g Hex1b.Tool
```

3. Verify both tools are available:

```bash
aspire --version
dotnet hex1b --help
```

## Recording Process

1. Read the list of CLI command documentation files from `src/frontend/src/content/docs/reference/cli/commands/` to identify all commands that need recordings.
2. For each command, use hex1b to:
   - Start a bash terminal (width=120, height=30) with recording enabled
   - Type the command with `--help` flag
   - Wait for the output to render
   - Pause briefly for readability
   - Stop the recording
3. For `aspire --version` and `aspire doctor`, record live execution output instead of `--help`.
4. Save all `.cast` files to `src/frontend/public/casts/`.

## Recording conventions

- Terminal size: 120 columns × 30 rows
- Idle time limit: 2.0 seconds
- File naming: `aspire-<subcommand>.cast` (e.g., `aspire-add.cast`)
- Overwrite existing cast files when re-recording

## Output

Create a pull request with all new and updated `.cast` files. In the PR description, list which commands were recorded and note any commands that failed to record.
