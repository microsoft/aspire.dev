# Live status

Real-time "are we live?" feature for aspire.dev. The header icon strobes
when the team is broadcasting on YouTube and/or Twitch, and the
`/community/videos/` page swaps to whichever stream is online so visitors
can watch immediately.

## Architecture

```
                      ┌────────────────────────────────────────┐
                      │  Twitch EventSub  ─►  /twitch/webhook ─┐
   YouTube PubSubHub ─┤                                          │
                      │  YouTube WebSub  ─►  /youtube/webhook ──┤
                      └────────────────────────────────────────┘ │
                                                                 ▼
                                                       LiveStatusBroadcaster
                                                       (in-memory + debounce)
                                                                 │
                       ┌─────────────────────────────────────────┤
                       │                                         │
                       ▼                                         ▼
              GET /api/live (JSON)                   GET /api/live/stream (SSE)
                                                                 │
                                                                 ▼
                                                  All connected aspire.dev clients
                                                  (header icon, videos-page tabs,
                                                   floating PiP player)
```

Two `BackgroundService` workers keep the state honest belt-and-braces:

| Worker                    | Push                      | Confirming poll                                   |
|---------------------------|---------------------------|---------------------------------------------------|
| `TwitchEventSubService`   | EventSub `stream.online/offline` | `/streams?user_id=` reconcile every 30 min |
| `YouTubeWebSubService`    | PubSubHubbub `videos.xml` push   | `search.list?eventType=live` every 2 min   |

Webhook handlers are pure (`bytes + headers -> StateUpdate`) and unit-
testable. Outgoing HTTP is performed by named, resilient
`HttpClient` instances (`twitch`, `twitch-id`, `youtube`,
`youtube-pubsub`) registered with `AddStandardResilienceHandler`.

## Configuration

Bind from the `Live` section of configuration. All secrets are non-fatal:
if a key is missing the corresponding worker logs a warning at startup
and the SSE endpoint returns `{ isLive: false }` until configuration
is provided.

```json
"Live": {
  "PublicBaseUrl": "https://aspire.dev",
  "CoalesceWindowMs": 750,
  "EnableDevEndpoint": true,
  "Twitch": {
    "ClientId": "",
    "ClientSecret": "",
    "WebhookSecret": "",
    "ChannelLogin": "aspiredotdev",
    "ChannelId": "",
    "ReconcileIntervalSeconds": 1800
  },
  "YouTube": {
    "ApiKey": "",
    "WebhookSecret": "",
    "ChannelHandle": "@aspiredotdev",
    "ChannelId": "",
    "PollingIntervalSeconds": 120,
    "OfflineConfirmationCount": 2
  }
}
```

In development, prefer `dotnet user-secrets`. In production, env vars
or Key Vault.

## Endpoints

| Method | Path                            | Description                                                          |
|--------|---------------------------------|----------------------------------------------------------------------|
| GET    | `/api/live`                     | Current snapshot, `Cache-Control: no-store`                          |
| GET    | `/api/live/stream`              | Server-Sent Events: `state` and `meta` events, 15s heartbeat        |
| POST   | `/api/live/twitch/webhook`      | Twitch EventSub callback. HMAC-SHA256 verified.                      |
| GET    | `/api/live/youtube/webhook`     | WebSub verification (`hub.challenge`)                                |
| POST   | `/api/live/youtube/webhook`     | WebSub notification. HMAC-SHA1 verified, then confirming poll.       |
| POST   | `/api/live/_dev/set`            | **Dev-only** override for local testing/Playwright fallback.         |

In Development the API is browseable via Scalar at `/scalar/v1`. The
custom theme lives in `wwwroot/scalar/aspire-theme.css` and matches the
Aspire brand kit (purple `#7455dd`, light `#dcd5f6`, dark `#1f1e33`).

## Mesh logic — when both fire

YouTube and Twitch usually fire near-simultaneously when a single "going
live" announcement happens. The broadcaster:

- Aggregates: `isLive = twitch.live || youtube.live`.
- Picks a sticky `primarySource` — only swaps when the current primary
  goes offline. Prevents the UI from flapping when the second platform's
  webhook arrives a few seconds late.
- Coalesces outgoing SSE events with a configurable window
  (default 750 ms). If both sources flip in that window the subscriber
  receives **one** combined update.
- Emits `state` events on real changes and `meta` events on transient
  field-only changes (e.g. `videoId` updated mid-stream); animation in
  the client only triggers on `state`.

## Local testing

```powershell
# Manually push a live state without provisioning real webhooks:
curl -Method POST http://localhost:5000/api/live/_dev/set `
  -ContentType 'application/json' `
  -Body '{ "twitch": true, "youtube": false, "twitchChannel": "aspiredotdev" }'

# Inspect the SSE stream:
curl -N http://localhost:5000/api/live/stream
```

The dev endpoint is gated on `IsDevelopment` AND
`Live:EnableDevEndpoint=true` — never enabled in production.

## Testing strategy

- **Unit**: webhook handlers (HMAC + parsing), broadcaster mesh + debounce
  using `FakeTimeProvider`, named-HttpClient clients with fake
  `HttpMessageHandler`.
- **Integration**: `WebApplicationFactory<Program>` + signed webhook
  POSTs + assertion on SSE events.
- **Frontend unit (vitest)**: SSE-mocked `live-status.ts` + PiP component
  reactions to `aspire:live-change` events.
- **E2E (Playwright)**: route-mocked `/api/live` + custom SSE handler
  drives the full UX: icon strobing, PiP appearance, tab switching,
  close-to-videos navigation, reconnect after network drop.

## Resilience

- All workers swallow exceptions in their loops and log structured.
- Standard resilience pipeline on every named `HttpClient`.
- Reconciliation timers are the safety net for missed individual webhooks.
- SSE heartbeats every 15 s defeat proxy idle-timeouts; the client uses
  exponential backoff with a `visibilitychange`-aware reconnect.
- Frontend client is re-entrant, idempotent, and survives Astro view
  transitions.
- Missing secrets ⇒ degraded but functional state — never a crash.
