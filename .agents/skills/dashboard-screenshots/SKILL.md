---
name: dashboard-screenshots
description: One-shot recapture of Aspire dashboard screenshots for aspire.dev. Builds the dashboard from microsoft/aspire, runs a demo AppHost, drives playwright-cli to capture every shot in shots.json in both themes, adds red callouts, and verifies framing and theme pairs. Use when the dashboard UX changed and the images under src/frontend/src/assets/dashboard need refreshing.
---

# Dashboard screenshots

Regenerates dashboard images in place (same file names) so MDX needs no changes except for fixes reported by the verify step.

## Run it

```powershell
cd .agents\skills\dashboard-screenshots
bun install
bun scripts/run.ts
```

Prerequisites: git, bun, node, Edge, and `@playwright/cli` installed globally (`npm i -g @playwright/cli`). The script clones microsoft/aspire into `%TEMP%\aspire-dashboard-shots`, builds the demo AppHost in `demo\`, starts it, captures, verifies, writes a report, and tears everything down.

Flags:

| Flag | Meaning |
| --- | --- |
| `--branch <name>` | aspire branch to build. Default `main`: release branches may show an older dashboard UX. Confirm visually (e.g. the resources table has no left "Select all" pane). |
| `--only <id[,id]>` | capture only these shot ids |
| `--attach` | reuse an already running dashboard at http://localhost:17170 |
| `--keep` | do not tear down the dashboard or browser |
| `--inventory` | only write `inventory.csv` of existing images (size, theme, name) |

## Manifest (`shots.json`)

Viewport 1280x800 at 2x, padding 16. Each shot has `id`, `out.dark`/`out.light`, `route`, optional `steps`, `callout`, `height`, `clip`, `autoCrop`, `keepAlerts`.

Step types: `click` (text), `clickSel`, `hover`, `fill`, `press`, `wait`, `closeDialog`.

## Rules

- **Themes**: capture every shot once per theme. Dark is the base name (or `-dark`), light is `-light`. Docs must use `<ThemeImage dark={x} light={xLight} alt="..." />` from `@components/ThemeImage.astro`; verify flags pages that reference only one theme. Fix those in MDX.
- **Alerts**: before each capture the script dismisses banners, toasts, welcome and update messages (`.dashboard-message-bar-dismiss`). Set `keepAlerts: true` only when the alert is the subject. The Notifications panel is not closed by Escape; use a fresh navigation.
- **Callouts**: red (`#e8212e`, ~3px) rectangles around the selector in `callout`, matching old images that had them.
- **Framing**: avoid large blank areas. Use `height` for short pages, `autoCrop` to trim trailing blank space, `clip` for regions. Keep resolution consistent.
- **Graph view**: Settings > Overview layout > Graph, close dialog, click the Overview tab.
- Row action buttons only appear on hover; hover first.

## Windows playwright-cli quirks

- Invoke `node <npm root -g>\@playwright\cli\playwright-cli.js -s=<session> run-code "<js>"`.
- Screenshot paths must be absolute with forward slashes.
- Use `--browser=msedge`. No ffmpeg, so GIFs cannot be regenerated; report them as skipped.

## Report

The run prints captured/failed counts and lists unreproducible or skipped images (old UX concepts, terminals, Copilot/MCP dialogs, GIFs). Review captured images visually before committing. Never run `bun run build`; `git restore` any `.starlight-icons` churn.
