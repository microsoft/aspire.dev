---
name: dashboard-screenshots
description: One-shot recapture of Aspire dashboard screenshots for aspire.dev. Builds the dashboard from microsoft/aspire, runs a demo AppHost, drives playwright-cli to discover the existing images and capture each one in both themes, adds red callouts, and verifies framing and theme pairs. Use when the dashboard UX changed and the images under src/frontend/src/assets/dashboard need refreshing.
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

## Discovery and recipes (no committed manifest)

Every run starts with a discovery phase: it inventories `src/frontend/src/assets/dashboard`, scans the docs for who embeds each image, joins the images with the capture recipes in `scripts/recipes.ts`, and writes an ephemeral `shots.json` to the work dir (`%TEMP%\aspire-dashboard-shots\w`). The file is deleted when the run ends (kept only with `--keep`) and must never be committed. Discovery reports **UNMAPPED** images (exist, no recipe), **NEW** shots (recipe, no image yet) and **UNREFERENCED** images (no doc embeds them); resolve each before capturing. Add or fix recipes in `scripts/recipes.ts`, which holds only how to capture, not which images exist.

Viewport 1280x800 at 2x, padding 16. Each shot has `id`, `out.dark`/`out.light`, `route`, optional `steps`, `callout`, `height`, `clip`, `autoCrop`, `keepAlerts`.

Step types: `click` (text), `clickSel`, `hover`, `hoverSel`, `fill`, `press`, `wait`, `closeDialog`, `js` (raw playwright code with `page` in scope). `{{Theme}}` inside any step is replaced with `Dark` or `Light` for the current capture, so a single recipe can pick an explicit theme. Shot options: `also` (extra file names for the same capture), `thumb` (resized copy), `legacyLight` (skip the `-light` naming check when docs already use a different light filename).

Runner behaviour: the cached clone is refreshed to the tip of `--branch` on every run; `--only a,b` matches each comma-separated id as a substring; failed attempts never reuse stale PNGs; `--keep` leaves the AppHost and the `shots` browser session open; cleanup only closes the `shots` session, never other playwright-cli sessions.

## UX audit (do this BEFORE capturing)

Recapturing is not enough: the UX may have gained surfaces the docs never showed (e.g. the Help dialog now has Documentation / Keyboard shortcuts / AI agents tabs; Settings gained new options). Run the audit against the live dashboard and treat it as the source of truth for what the docs should cover:

1. `bun scripts/audit-ux.ts` writes `ux-audit.json` / `ux-audit.md` to the work dir: main tabs, header buttons, and for the Help, Settings and Recordings dialogs every tab plus its headings, switches, selects and buttons.
2. Compare against the previous release (run the audit on the old dashboard or read the old images) and list **new, removed and renamed** UI: tabs, dialog tabs, settings, toolbar buttons, graph controls.
3. For every new surface add a recipe to `scripts/recipes.ts` (one per dialog tab, one per new settings section, both themes) and a `ThemeImage` in the docs.
4. For every changed or replaced image, open the MDX that embeds it (`grep` for the filename) and re-read the surrounding prose, alt text and step lists. Fix anything that no longer matches the UI (button names, tab order, menu paths, removed features). Record each fix in the PR body under "UX changes".
5. Settings and Help are drawers/dialogs; audit tabs via `fluent-drawer-body` and `[role=tab]`/`fluent-tab`. Scroll long Settings content and capture each section.

## Rules

- **Themes**: capture every shot once per theme. Naming is `<page>-<context>.png` for dark (the default, never a `-dark` suffix) and `<page>-<context>-light.png` for light only. Docs must use `<ThemeImage dark={x} light={xLight} alt="..." />` from `@components/ThemeImage.astro`; verify flags pages that reference only one theme. Fix those in MDX.
- **Alerts**: before each capture the script dismisses banners, toasts, welcome and update messages (`.dashboard-message-bar-dismiss`). Bars can arrive late or reappear after steps, so a final dismiss pass (plus a CSS hide of the message-bar provider) runs immediately before callouts and the screenshot. Always scan contact sheets (`sheet.ts`) for leftover bars, and sidebar drag/resize applies only to Graph and telemetry pages. Set `keepAlerts: true` only when the alert is the subject. The Notifications panel is not closed by Escape; use a fresh navigation.
- **Callouts**: red (`#e8212e`, ~3px) rectangles around the selector in `callout`, matching old images that had them.
- **Framing**: avoid large blank areas. Use `autoCrop` (not a small `height`) to trim trailing blank space, `clip` for regions. Keep resolution consistent.
- **Graph view**: Settings > Overview layout > Graph, close dialog, click the Overview tab.
- Row action buttons only appear on hover; hover first.

## Windows playwright-cli quirks

- Invoke `node <npm root -g>\@playwright\cli\playwright-cli.js -s=<session> run-code "<js>"`.
- Screenshot paths must be absolute with forward slashes.
- Use `--browser=msedge`. No ffmpeg, so GIFs cannot be regenerated; report them as skipped.

## Review phase (mandatory, after capturing, before committing)

Scripted checks (`verify()`) are not enough. Look at every image and judge it:

1. Build contact sheets (`bun scripts/sheet.ts <out.png> <paths>`) and view each shot next to its original (`git show origin/release/17.0:<path>`).
2. For each, answer: Does it show the same UI the docs' alt text and surrounding prose describe (right page, dialog, menu, state)? Is it the right theme for its filename? Are all message bars dismissed? Is it framed well (no big blank areas, not squashed, similar size to the original)? Should the sidebar be collapsed to give the content room (for example traces and landing console)?
3. Adjust the manifest (steps, route, callouts, `autoCrop`, collapse step) and recapture only the failing ids with `--attach --keep --only`.
4. Repeat until every image passes. Record anything you could not make right in the report.

Review checklist per image: same subject as the original and the docs' alt text (compare against `git show origin/release/17.0:<path>`); sidebar collapsed (`"collapseSidebar": true` or an explicit collapse step) unless the sidebar is the subject; no message bars or toasts; filters, menus and selections visible when the doc describes them; content rich enough (no trivial one-span traces or empty tables); no large blank areas; correct theme; `landing/*` exactly 2560x1600.

## Rich demo telemetry

The demo AppHost's `inventoryservice` exposes `/orders/{id}` with nested redis, postgres and rabbitmq spans, and the web traffic generator calls it regularly. Trace shots must open one of those traces (click the traces-list row `inventoryservice (6)`, then select a span via a `js` step using `getByText(...).locator('visible=true')`), not the default 2-span `/weatherforecast` trace. Wait about a minute after demo start for telemetry to accumulate.

Capture-script lessons: reset `localStorage` only after navigating to the dashboard origin and before setting the theme cookie (otherwise `SecurityError` or a theme mismatch); fluent text fields cannot be `fill`ed, click then type; `--only` takes comma-separated id substrings and "trace" also matches `landing-trace-detail`, `traces-*` and `trace-view-*`.

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

## Dashboard images outside `assets/dashboard` (manual, starter-based)

These are captured ad hoc against real starters, not the demo AppHost:

- `assets/get-started/{csharp,javascript}-aspire-dashboard(-light).png`: `aspire new aspire-starter` / `aspire-ts-starter` with `--non-interactive --use-config-source false`, then `aspire run --non-interactive` (run it in the background; it blocks). Capture `/resources` at 1100x300 (C#) or 1100x400 (JS), 2x, message bars hidden.
- `assets/fundamentals/dashboard-unresolved-parameters-message(-light).png`: add `addParameter("api-key", { secret: true })` with no value; 1000x520 @2x, hide the feedback bar with `.dashboard-message-bar.intent-info{display:none!important}`.
- `assets/fundamentals/health-checks-dashboard-status(-light).png`: add `.withHttpHealthCheck({ path: "/health" })`, select the resource, clip 1100x345 so the Status card shows Health state.
- Still old UI and unrefreshed: `whats-new/dashboard-update-notification` (needs a newer-version "Update now" bar), `integrations/custom-integrations/*` (need the MailDev/MailKit sample apps), `integrations/efcore/dashboard-post-migration-*`. Version-specific `whats-new/aspire-9.x` images stay historical.

## Theme gotcha

The dashboard persists its theme in the `currentTheme` cookie (`Dark`/`Light`), which `localStorage.clear()` does not reset. `run.ts` clears cookies and sets the cookie per shot, and treats a capture as failed unless `documentElement.dataset.theme` matches the requested theme. After a run, scan mean luminance: `-light` files should be bright, all others dark.


## Do not shrink the viewport

Never set a small per-shot `height` (under ~700): the dashboard footer and layout collapse and the capture shows cut-off content. Use `autoCrop` (trims trailing blank space) or `clip` (element crop). `verify` flags any non-clip image under half the viewport height; open every flagged image and check it shows the intended UI.

## Intent lessons from review

- Quote comma lists: `--only "a,b"` (unquoted PowerShell splits it and captures nothing).
- `js` steps run in Playwright, not the page; use `page.evaluate` for DOM access.
- Notifications only appear after an action: trigger Rebuild on `webfrontend` (wait ~15s) before opening the bell or View response.
- Error logs and traces come from `apiservice` (`/forecast/unavailable`), not `webfrontend`.
- Metrics filters: use `webfrontend` > `Microsoft.AspNetCore.Hosting` > `http.server.request.duration`, and open a filter that exists (`http.response.status_code`).
- `sidebar-grayed-resources` shows dimmed resources that have no data for the current page.
- **Metrics instrument detail:** never `scrollIntoViewIfNeeded` (it scrolls the chart out of view) and do not collapse the sidebar (a wide chart leaves a blank band above Filters). Load the instrument by URL (`?meter=...&instrument=...&duration=5`), use `height: 1000` so chart + Filters + open filter menu all fit.
- **Structured logs:** errors come from `inventoryservice`; `traceId` is a URL param; row menus use `td.log-row-error fluent-button[aria-label='Actions']`; the Add filter flyout is `.filter-dialog-form`.

## Process lessons (apply on every run)

- **Judge by intent, not file existence.** Several early "successful" captures showed the wrong UI (e.g. the Add filter flyout in place of health status, empty notification flyouts). For every image, read the doc that embeds it, open the old image, and compare what it was meant to show.
- **Find every consumer before renaming.** Search `src/frontend/src` for each asset name (en and `ja` docs, `DashboardCarousel.astro`) and update imports in the same commit. Naming: bare name = dark, `-light` = light, never `-dark`.
- **Audit the whole site, not just `assets/dashboard`.** Grep all of `src/frontend/src/assets` for dashboard captures (get-started, fundamentals, integrations, whats-new) and the landing carousel; see the manual section above.
- **Add new UI to docs and carousel in the same pass.** New dashboard features (density, overview panels, metrics filters, show-empty-panels toggle) need doc prose plus shots; landing images are 2560x1600 so never `autoCrop` them.
- **Keep PRs split:** skill and manifest on one branch, generated images and MDX on another; push manifest changes first, then move the PNGs.
- **Match the product version.** Record which dashboard build was used (demo AppHost on release/17.0 vs. the installed CLI's bundled dashboard) in the PR body.
- **CI quirks:** frontend build ~9 min, E2E 10-20 min; rerun only failed jobs for flakes. Never run a local site build.
- **Tooling quirks:** `aspire run` blocks (start it hidden/background); `run-code` screenshot paths must be inline forward-slash absolute paths; the `view` tool needs a copy to a fresh temp name; the playwright session can die, so re-running `--only` reopens it.
