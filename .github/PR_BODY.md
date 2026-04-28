# Live status header icon + redesigned videos page

Adds a real-time **live indicator** to the aspire.dev site header (left of the cookie-preferences button) that strobes whenever the team is broadcasting on YouTube and/or Twitch, and replaces the legacy `/community/videos/` curated list with a focused two-tab page (YouTube / Twitch) whose embed lights up when the corresponding stream goes live.

While live, a small floating "PiP" player follows the visitor across the site (closing it returns them to the videos page). State is pushed in real time over Server-Sent Events from a resilient ASP.NET Core background worker that combines Twitch EventSub + YouTube WebSub webhooks with confirming polls.

## What's added

### Frontend

- `src/frontend/src/assets/icons/live.svg` — broadcast/radio-waves motif that matches `cookies.svg` shape so it inherits accent color via `currentColor`.
- `src/frontend/src/components/starlight/Header.astro` — new `.live-btn` rendered before `.cookie-consent-btn` in **both** desktop and mobile right-groups, with `live-pulse` keyframes and a `prefers-reduced-motion` fallback. Globally mounts `LivePip` and imports the live-status client.
- `src/frontend/src/components/live-status.ts` — singleton SSE client (re-entrant, exponential backoff, `visibilitychange`-aware reconnect). Dispatches typed `aspire:live-change` `CustomEvent`s on `document`.
- `src/frontend/src/components/LivePip.astro` — custom floating panel (deliberately **not** the Document PiP API — cross-origin embeds don't survive transfer). Hidden until live; closes back to the videos page; remembers per-session dismissal until the next live cycle.
- `src/frontend/src/content/docs/community/videos.mdx` — replaces the giant curated `aspireifridays`/`dotnetConf2025`/`communityVideos` arrays with two tabs. The active tab auto-switches to whichever source is primary, embeds get a `LIVE` badge + glow, and tab clicks become sticky (no auto-yanking once the user has chosen).

### Backend (`src/statichost/StaticHost/Live/`)

- `LiveStatusOptions.cs` + `LiveStatus.cs` — strongly-typed options + records (with `JsonSerializerContext` source generation).
- `LiveStatusBroadcaster.cs` — singleton state + `Channel<T>` fan-out + 750 ms coalesce window. Sticky `primarySource` so the UI doesn't flap.
- `LiveEndpoints.cs` — `MapLiveStatus()` extension. Mounts `GET /api/live`, `GET /api/live/stream` (SSE), the Twitch + YouTube webhooks, and a Dev-only `POST /api/live/_dev/set` for local testing.
- `LiveStatusServiceCollectionExtensions.cs` — `builder.AddLiveStatus()`: options binding, named resilient HttpClients (`twitch`, `twitch-id`, `youtube`, `youtube-pubsub`), both background services.
- `Twitch/` — Helix client + app-token provider (proactive 5-min refresh) + EventSub reconcile worker + pure HMAC-SHA256 webhook handler.
- `YouTube/` — Data API client + WebSub subscribe/renew worker (5-day lease, renew at 4 days) + pure HMAC-SHA1 webhook handler with a confirming-poll guard so VOD uploads don't fake a live state.

### AppHost / Scalar

- `Aspire.Dev.AppHost/AppHost.cs` — labelled custom dashboard URLs for the live API + the Scalar reference, surfaced on the `aspiredev` resource.
- Adds `Microsoft.AspNetCore.OpenApi` + `Scalar.AspNetCore`. In Development, `MapScalarApiReference("/scalar/v1")` is wired with a custom Aspire-brand theme at `wwwroot/scalar/aspire-theme.css`.

## How to test locally

The Twitch/YouTube credentials are non-fatal: if they're missing, the workers log a warning and stay idle, and the SSE endpoint returns `{ isLive: false }` — the site ships in any state. To exercise the UI without provisioning real webhooks, use the Dev-only override (gated on `IsDevelopment` AND `Live:EnableDevEndpoint=true`):

```powershell
# Force "live on Twitch" (header icon strobes, PiP appears):
curl -Method POST http://localhost:5000/api/live/_dev/set `
  -ContentType 'application/json' `
  -Body '{ "twitch": true, "twitchChannel": "aspiredotdev" }'

# Watch the stream:
curl -N http://localhost:5000/api/live/stream
```

A Playwright spec exercises the full UX with mocked `/api/live` + streamed SSE chunks.

## Configuration

```json
"Live": {
  "Twitch":  { "ClientId": "", "ClientSecret": "", "WebhookSecret": "", "ChannelLogin": "aspiredotdev" },
  "YouTube": { "ApiKey": "",   "WebhookSecret": "", "ChannelHandle": "@aspiredotdev" }
}
```

User-secrets in dev, env vars / Key Vault in prod. See `src/statichost/StaticHost/Live/README.md` for the full architecture overview, mesh logic, and ops runbook.

## Screenshots

_TODO: drop in once final icon CSS is reviewed._

## Resilience checklist

- Named `HttpClient` instances with `AddStandardResilienceHandler`.
- Workers swallow + log exceptions in their loops; never crash the host.
- Webhook idempotency (Twitch message-id LRU; YouTube confirming poll).
- Reconciliation timers are the safety net for missed webhooks.
- SSE 15 s heartbeat defeats proxy idle-timeouts.
- Client uses exponential backoff + `visibilitychange`-aware reconnect.
- `prefers-reduced-motion` honored throughout.
- Missing secrets ⇒ degraded but functional state.
