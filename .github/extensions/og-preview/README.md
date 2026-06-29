# OpenGraph Preview canvas

A GitHub Copilot App **canvas extension** that loads any URL — including local dev
servers like `http://localhost:3000` — and shows how it unfurls across social
platforms, alongside a raw OpenGraph metadata view and a diagnostics checklist.

## Features

- **Platform previews** — OpenGraph/Facebook, X (Twitter, both `summary` and
  `summary_large_image` layouts), LinkedIn, Slack, and Discord.
- **Raw metadata** — every `og:*`, `twitter:*`, and other `<meta>` tag, grouped,
  with a one-click **Copy JSON**.
- **Diagnostics** — checks for the required/recommended OpenGraph tags.
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

## Agent actions

- **`preview_url`** `{ url }` — load a URL into the open canvas and return its
  resolved preview fields.
- **`get_metadata`** `{ url }` — fetch + parse a URL and return all raw metadata
  as JSON, without opening the canvas.

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
