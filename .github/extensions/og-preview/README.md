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
- **Prompt composer** — a **Prompt** tab that turns the page into a
  ready-to-paste AI prompt: a full JSON snapshot of its SEO and social metadata
  plus task modules you can mix and match. See
  [Prompt composer](#prompt-composer).
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
| `GET /build-prompt.mjs` | Prompt composer module, shared with `get_prompt` |
| `GET /api/fetch?u=` | Fetch + parse the target, return metadata JSON |
| `GET /api/img?u=` | Image proxy fallback |
| `GET /events` | Server-Sent Events; agent-driven loads are pushed here |

The target page is fetched and parsed server-side (no external dependencies),
which sidesteps browser CORS and lets it reach `localhost`. Page and resource
fetches are capped at 6 MiB: an oversized HTML page is truncated rather than
rejected (its metadata lives in the head), while oversized scripts, styles,
images, and other files fail to load. The Browse tab runs the whole document,
and large API reference pages put their interactive content after several MB of
inline data, so the page it loads gets a 16 MiB cap; past that it is cut off.

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
- **`get_prompt`** `{ url, modules?, instructions?, includeAgentReadiness? }`
  *(canvas action)* — build the composed prompt and its JSON payload for a URL,
  without loading the page into the canvas. It returns the `prompt`, the JSON
  `payload`, the final `url`, and the `modules` used. See
  [Prompt composer](#prompt-composer).

## Prompt composer

The **Prompt** tab (and the `get_prompt` action) turns the loaded page into one
prompt for any AI assistant: a short context block, the tasks you pick, your own
notes, and a JSON snapshot of the page's SEO and social metadata. Page content is
untrusted, so the prompt tells the assistant to treat the JSON as data and never
follow instructions found inside it.

In the tab you can:

- **Pick tasks** — the selection only changes the task text; the JSON is always
  the same. Audit and Fix head tags are on by default.
- **Add instructions** — optional notes (up to 8,000 characters) that are added
  to the prompt. Your tasks and notes are remembered in the browser.
- **Check the size** — the prompt's length in characters and an estimated token
  count.
- **Copy prompt** or **Copy JSON** — the JSON is the same snapshot that ends the
  prompt.
- **Open in Copilot** or **Create issue** — shown when the page links to its
  source GitHub repository (for example, an "Edit this page" link). They send
  the current prompt to a new Copilot session or to an issue in that repository,
  like the Diagnostics tab's actions.

The agent-readiness checks run after the page loads and join the snapshot when
they finish; until then `agentReadiness` is `null`.

| Task module | Tab label | What it asks for |
| --- | --- | --- |
| `audit` | Audit | Find SEO and social-sharing issues |
| `fix-tags` | Fix head tags | Exact markup for the issues found |
| `copy` | Rewrite copy | Better title and description options |
| `social-image` | Share image | Review `og:image` and the Twitter card |
| `structured-data` | Structured data | Review and fix JSON-LD |
| `agent-readiness` | Agent readiness | AI crawler and agent discovery |
| `implement` | Implement | Make the edits in the source repo |
| `verify` | Verify | Re-check the page after the change |

`get_prompt` takes `url` plus optional `modules` (the ids above; defaults to
`audit` and `fix-tags`, and an empty list returns only the context and the JSON),
`instructions` (up to 8,000 characters), and `includeAgentReadiness` (defaults to
`true`; set it to `false` to skip about 17 extra requests).

The JSON payload is versioned with `schemaVersion` and bounded. Whatever was cut
is named in `truncated`, so a clipped value is never mistaken for a complete one:

- Every string outside JSON-LD `data` is clipped at 1,000 characters (meta tag
  values at 500, tag names at 100).
- Lists are capped: 200 other meta tags, 60 Open Graph and 60 Twitter tags, 20
  icons, 50 alternate links, 5 `h1` headings, and 10 JSON-LD blocks.
- A JSON-LD block's `data` is included when it is at most 6,000 characters and 8
  levels deep, and while the included blocks total at most 20,000 characters. Any
  other valid block is marked `dataOmitted: true` and is judged by its `types`
  and `size` alone.

The text above the JSON names only the URL you asked for. Redirect targets, the
canonical URL, and the detected repository appear only inside the JSON, which the
prompt marks as untrusted.

A page that pushes every limit at once can still produce a large prompt. Copying
always works, but **Open in Copilot** and **Create issue** requests are limited to
512 KB, and a GitHub issue body to 65,536 characters.

| Field | Contents |
| --- | --- |
| `url` | Input and final URL, whether it redirected, canonical URL, origin, hostname |
| `http` | Status, content type, `bodyTruncated`, and the `x-robots-tag`, `link`, `content-language`, and `last-modified` headers |
| `seo` | Title and description with their lengths, `lang`, robots (meta, googlebot, `x-robots-tag`), viewport, `h1` headings, hreflang `alternates`, JSON-LD `structuredData` (each block's types and size, plus its data when small enough) |
| `social` | The `resolved` card fields plus the raw `openGraph` and `twitter` tags |
| `otherMeta`, `icons` | Every other meta tag as found, and the declared icons |
| `diagnostics` | The same checks as the Diagnostics tab |
| `agentReadiness` | The agent-readiness checks, or `null` when they weren't run |
| `repository`, `document` | The detected source repository (or `null`) and the tag count |

## Files

```
og-preview/
  extension.mjs        wiring: server, routes, canvas declaration + actions
  lib/http-fetch.mjs   dependency-free http/https fetch (redirects, timeout)
  lib/parse-og.mjs     meta-tag parser -> resolved fields, groups, diagnostics
  lib/build-prompt.mjs JSON payload + composable prompt (server and canvas UI)
  ui/index.html        renderer markup
  ui/styles.css        platform-styled cards + app-theme chrome
  ui/app.js            client logic (fetch, render, tabs, SSE)
```
