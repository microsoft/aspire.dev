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

Step types: `click` (text), `clickSel`, `hover`, `hoverSel`, `fill`, `press`, `wait`, `closeDialog`, `js` (raw playwright code with `page` in scope). `{{Theme}}` inside any step is replaced with `Dark` or `Light` for the current capture, so a single recipe can pick an explicit theme. Shot options: `also` (extra file names for the same capture), `thumb` (resized copy), `legacyLight` (skip the `-light` naming check when docs already use a different light filename).

Runner behaviour: the cached clone is refreshed to the tip of `--branch` on every run; `--only a,b` matches each comma-separated id as a substring; failed attempts never reuse stale PNGs; `--keep` leaves the AppHost and the `shots` browser session open; cleanup only closes the `shots` session, never other playwright-cli sessions.

## UX audit (do this BEFORE capturing)

Recapturing is not enough: the UX may have gained surfaces the docs never showed (e.g. the Help dialog now has Documentation / Keyboard shortcuts / AI agents tabs; Settings gained new options). Run the audit against the live dashboard and treat it as the source of truth for what the docs should cover:

1. `bun scripts/audit-ux.ts` writes `ux-audit.json` / `ux-audit.md` to the work dir: main tabs, header buttons, and for the Help, Settings and Recordings dialogs every tab plus its headings, switches, selects and buttons.
2. Compare against the previous release (run the audit on the old dashboard or read the old images) and list **new, removed and renamed** UI: tabs, dialog tabs, settings, toolbar buttons, graph controls.
3. For every new surface add a shot to `shots.json` (one per dialog tab, one per new settings section, both themes) and a `ThemeImage` in the docs.
4. For every changed or replaced image, open the MDX that embeds it (`grep` for the filename) and re-read the surrounding prose, alt text and step lists. Fix anything that no longer matches the UI (button names, tab order, menu paths, removed features). Record each fix in the PR body under "UX changes".
5. Settings and Help are drawers/dialogs; audit tabs via `fluent-drawer-body` and `[role=tab]`/`fluent-tab`. Scroll long Settings content and capture each section.

## Rules

- **Themes**: capture every shot once per theme. Dark is the base name (or `-dark`), light is `-light`. Docs must use `<ThemeImage dark={x} light={xLight} alt="..." />` from `@components/ThemeImage.astro`; verify flags pages that reference only one theme. Fix those in MDX.
- **Alerts**: before each capture the script dismisses banners, toasts, welcome and update messages (`.dashboard-message-bar-dismiss`). Bars can arrive late or reappear after steps, so a final dismiss pass (plus a CSS hide of the message-bar provider) runs immediately before callouts and the screenshot. Always scan contact sheets (`sheet.ts`) for leftover bars, and sidebar drag/resize applies only to Graph and telemetry pages. Set `keepAlerts: true` only when the alert is the subject. The Notifications panel is not closed by Escape; use a fresh navigation.
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

## Known selectors and gotchas

- Console log "Download logs" lives in the log pane's settings (sliders) menu: `fluent-button.toolbar-button[aria-label='Settings']` (last). There is no toolbar Download button.
- Row actions: hover the row, then force-click `[aria-label='Actions for <name>']`; pick items with `getByRole('menuitem',{name})` and `click({force:true})`. Notifications bell is `getByRole('button',{name:'Notifications'})`.
- Resource sidebar: drag `.resource-pane-resizer`; collapse via "Collapse resource list", then use `.resource-picker-button` (Filter box, All resources, Ctrl+click multi-select, Shift+click range).
- Aspire Outage: `[aria-label='Play Aspire Outage']`; modes `.resource-graph-game-button` (Normal) / `.resource-graph-game-hardcore` (Hard); Esc exits.
- A final dismiss pass runs before every capture; message bars can reappear, so never capture without it.
- Error badge counts grow over time; recapture soon after startup.

## Not captured by this manifest

- Needs replicas (`console-logs-with-replicas`, `telemetry-resource-filter`): add `WithReplicas(2)` to the demo temporarily.
- Needs other setups: login, terminals, copilot, mcp-dialog, standalone, dashboard-run-selector, `trace-view-filter-advanced`, `trace-page-from-exemplars`, `project-graphs`, `settings-manage-telemetry`.
- Not dashboard captures: architecture diagrams, `.excalidraw` files, GIFs.

## Theme gotcha

The dashboard persists its theme in the `currentTheme` cookie (`Dark`/`Light`), which `localStorage.clear()` does not reset. `run.ts` clears cookies and sets the cookie per shot, and treats a capture as failed unless `documentElement.dataset.theme` matches the requested theme. After a run, scan mean luminance: `-light` files should be bright, all others dark.

