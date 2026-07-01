# OpenGraph Preview canvas

A GitHub Copilot App **canvas extension** that loads any URL — including local dev
servers like `http://localhost:3000` — and shows how it unfurls across social
platforms, alongside a raw OpenGraph metadata view and a diagnostics checklist.

## Features

- **Platform previews** — OpenGraph/Facebook, X (Twitter, both `summary` and
  `summary_large_image` layouts), LinkedIn, Slack, and Discord.
- **Raw metadata** — every `og:*`, `twitter:*`, and other `<meta>` tag, grouped,
  with per-value quick **copy buttons** and a one-click **Copy JSON**.
- **Diagnostics** — checks for the required/recommended OpenGraph tags.
- **Collapsible page-info footer** — final URL, HTTP status, tag count, and
  diagnostics summary; expanded/collapsed state is remembered.
- **Quick examples** — one-tap chip to preview `aspire.dev`.
- **Auto scheme** — bare domains are completed automatically (`https://`, or
  `http://` for localhost).
- **Native look & feel** — chrome is built on the documented app theme tokens
  (shadcn-flavored controls, on-theme accent) and adapts to light/dark.
- **Loading UX** — shaped skeletons that mirror the real layout, shimmer, and
  View-Transition cross-fades (respecting `prefers-reduced-motion`).
- **localhost support** — fetches are made by the extension process over plain
  `http`/`https`, so loopback URLs work.
- **Image proxy fallback** — preview images that block hotlinking are retried
  through a local proxy.

## How it works

Each open canvas instance runs a small loopback HTTP server (`127.0.0.1`, random
port) that serves the static UI from `ui/` and a JSON API:

| Route | Purpose |
| --- | --- |
| `GET /` | Renderer page (auto-loads `?u=<url>`) |
| `GET /api/fetch?u=` | Fetch + parse the target, return metadata JSON |
| `GET /api/img?u=` | Image proxy fallback |
| `GET /events` | Server-Sent Events; agent-driven loads are pushed here |

The target page is fetched and parsed server-side (no external dependencies),
which sidesteps browser CORS and lets it reach `localhost`.

## Agent actions & tools

- **`open_og_preview`** `{ url?, instanceId? }` *(tool)* — open or focus the
  canvas in the side panel, optionally loading a URL immediately. Lets the agent
  bring up the preview on command (e.g. "open the OG preview for aspire.dev").
- **`preview_url`** `{ url }` *(canvas action)* — load a URL into the open canvas
  and return its resolved preview fields.
- **`get_metadata`** `{ url }` *(canvas action)* — fetch + parse a URL and return
  all raw metadata as JSON, without opening the canvas.

## Files

```
og-preview/
  extension.mjs        wiring: server, routes, canvas declaration + actions
  lib/http-fetch.mjs   dependency-free http/https fetch (redirects, timeout)
  lib/parse-og.mjs     meta-tag parser -> resolved fields, groups, diagnostics
  ui/index.html        renderer markup
  ui/styles.css        platform-styled cards + app-theme chrome
  ui/app.js            client logic (fetch, render, tabs, SSE)
```
