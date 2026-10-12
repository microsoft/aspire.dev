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

## Network access and isolation

Select a localhost URL in the address form or through a canvas action to authorize
that exact origin (scheme, hostname, and port). Links and resources discovered in
the page cannot authorize another local origin. Public-to-local redirects are
blocked, even if the local origin was previously selected.

Private-network destinations beyond loopback require `OG_ALLOW_PRIVATE_NETWORK=1`
in addition to explicit selection. This setting does not grant arbitrary private
access to fetched pages. Selecting a different origin invalidates the previous
browse capability; resources on additional local ports must be previewed separately.

Every connection validates all DNS answers and pins the validated addresses to
the request, including redirect hops. IPv4-mapped IPv6 addresses are checked
against the same policy as IPv4. The original hostname remains in use for HTTP
Host and TLS certificate verification.

The host-provided canvas URL contains a private UI capability in its fragment.
The renderer uses it for API calls and events; do not share that URL. Sandboxed
pages receive a separate, revocable resource-only capability and cannot select
origins or invoke session/issue actions. Public errors omit exception details.
The browse frame continues to run scripts without `allow-same-origin`; module
import rewriting is a preview transform, not an HTML sanitizer.

Run the dependency-free regression suite with Node.js 24:

```powershell
node --test .github\extensions\og-preview\tests\*.test.mjs
```

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
