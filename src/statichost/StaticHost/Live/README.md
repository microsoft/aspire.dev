# Live status

Real-time "are we live?" feature for aspire.dev. The header icon strobes
when the team is broadcasting on YouTube and/or Twitch, and the
`/community/videos/` page swaps to whichever stream is online so visitors
can watch immediately.

## Architecture

```
 Twitch EventSub ─┐
 YouTube WebSub ──┼──► aspire.dev /api/live/* ──► scalable StaticHost proxy
 Browser SSE ─────┘                                      │
                                                        ▼
                                             single-worker live coordinator
                                             (webhooks, provider workers,
                                              in-memory state + SSE)
```

Two `BackgroundService` workers keep the state honest belt-and-braces:

| Worker                    | Push                      | Confirming poll                                   |
|---------------------------|---------------------------|---------------------------------------------------|
| `TwitchEventSubService`   | EventSub `stream.online/offline` | `/streams?user_id=` reconcile every 30 min |
| `YouTubeWebSubService`    | PubSubHubbub `videos.xml` push   | `videos.list` every 2 min while live; `search.list` every 30 min while idle |

Webhook handlers are pure (`bytes + headers -> StateUpdate`) and unit-
testable. Outgoing HTTP is performed by named, resilient
`HttpClient` instances (`twitch`, `twitch-id`, `youtube`,
`youtube-pubsub`) registered with `AddStandardResilienceHandler`.

## Configuration

Bind from the `Live` section of configuration. In unconfigured local runs,
the corresponding worker logs a warning at startup and remains idle.
The SSE endpoint reports offline unless a local simulation sets live state.

```json
"Live": {
  "BackendUrl": "",
  "PublicBaseUrl": "https://aspire.dev",
  "CoalesceWindowMs": 750,
  "EnableDevEndpoint": false,
  "DevCommandSecret": "",
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
    "DiscoveryPollingIntervalSeconds": 1800,
    "OfflineConfirmationCount": 2
  }
}
```

### Production configuration and secrets

In publish mode, the AppHost passes non-sensitive settings as ordinary
deployment parameters and provisions an empty, shared `siteconfig` Azure Key
Vault for credentials and signing secrets. The vault is not limited to live
streaming. StaticHost receives read-only references to the four `live-*`
secrets and the **Key Vault Secrets User** role. Neither the AppHost nor
StaticHost creates, updates, or deletes secret values, and the AppHost does not
accept secret-value deployment parameters.

The following non-sensitive deployment parameters configure the production
feature. Parameters with a default can be overridden. Supply the Twitch client
ID and both channel IDs when deploying.

| Parameter name | Default or value to supply |
| --- | --- |
| `live-public-base-url` | `https://aspire.dev` |
| `live-coalesce-window-ms` | `750` |
| `live-twitch-client-id` | Twitch application client ID |
| `live-twitch-channel-login` | `aspiredotdev` |
| `live-twitch-channel-id` | Numeric Twitch broadcaster ID |
| `live-twitch-reconcile-interval-seconds` | `1800` |
| `live-youtube-channel-handle` | `@aspiredotdev` |
| `live-youtube-channel-id` | YouTube channel ID |
| `live-youtube-polling-interval-seconds` | `120` |
| `live-youtube-discovery-polling-interval-seconds` | `1800` |
| `live-youtube-offline-confirmation-count` | `2` |

An authorized operator must populate the following secrets separately in the
provisioned vault. Use the actual Azure vault name from deployment outputs,
not the Aspire resource name. Keep unrelated site secrets under their own
names; the live feature references only this list.

| Secret name | Value to supply |
| --- | --- |
| `live-twitch-client-secret` | Twitch application client secret |
| `live-twitch-webhook-secret` | Independently generated EventSub signing secret |
| `live-youtube-api-key` | YouTube Data API key |
| `live-youtube-webhook-secret` | Independently generated WebSub signing secret |

The production deployment creates two App Service websites in the same
per-site-scaling plan:

- `aspiredev` remains the public, horizontally scalable website. It receives
  only `Live__BackendUrl` and proxies `/api/live/*` without buffering through
  YARP.
- `aspiredev-live` receives the deployment parameters and read-only Key Vault
  references. It is limited to one worker because live snapshots, SSE
  subscribers, replay detection, provider subscription state, and renewal
  workers are coordinated in memory.

This keeps the process-local correctness requirement isolated to the
non-critical live-status coordinator instead of reducing the worker ceiling or
availability of the main site. If the coordinator is unavailable, static site
traffic continues normally and live-status requests fail independently.

The coordinator resolves the Key Vault references at startup; it does not
contact Key Vault for each snapshot, SSE connection, or provider request.
Populate all referenced secrets before using the production feature: an
unresolved reference is not equivalent to an absent setting. After changing
values, refresh the coordinator App Service references and restart it so its
bound configuration is reloaded. Rotating webhook signing secrets also
requires recreating the corresponding provider subscriptions.

`EnableDevEndpoint` and `DevCommandSecret` are intentionally excluded from the
vault. The AppHost creates those values only for local dashboard-command
testing, and the production host never enables the dev endpoint.

## Endpoints

| Method | Path                            | Description                                                          |
|--------|---------------------------------|----------------------------------------------------------------------|
| GET    | `/api/live`                     | Current snapshot, `Cache-Control: no-store`                          |
| GET    | `/api/live/stream`              | Server-Sent Events: `state` events, 15s heartbeat        |
| POST   | `/api/live/twitch/webhook`      | Twitch EventSub callback. HMAC-SHA256 verified.                      |
| GET    | `/api/live/youtube/webhook`     | WebSub verification (`hub.challenge`)                                |
| POST   | `/api/live/youtube/webhook`     | WebSub notification. HMAC-SHA1 verified, then confirming poll. In AppHost dev mode without a YouTube API key, signed local notifications update from the Atom payload. |
| POST   | `/api/live/_dev/set`            | **Dev-only** override for local dashboard commands/Playwright fallback. |

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
- Serializes each published snapshot into one UTF-8 `state` frame, shared by
  existing and newly connected subscribers. Unchanged snapshots do not
  allocate another frame or restart the coalescing timer.
- Uses one periodic heartbeat timer per SSE connection and retains the
  outstanding channel read between ticks, rather than cancelling a read
  for every idle heartbeat.

The videos page autoplays only the selected provider. Idle embeds are not
reloaded when the initial snapshot arrives, and an unchanged PiP source reuses
its existing iframe. Chooser event listeners are removed before client-side
page swaps so repeated navigation does not retain old dialogs.

## Local testing

Start the site from the AppHost to enter live-status dev mode:

```powershell
aspire start --isolated --apphost .\src\apphost\Aspire.Dev.AppHost\Aspire.Dev.AppHost.csproj
```

When the AppHost is running locally, the `aspiredev` resource has dashboard
commands that fake live-status events without any real Twitch or YouTube
credentials:

- **Live: all offline** - clears both sources via `/api/live/_dev/set`.
- **Fake Twitch online webhook** - invokes the real `/api/live/twitch/webhook` endpoint with a locally signed `stream.online` EventSub notification.
- **Fake Twitch offline webhook** - invokes the real `/api/live/twitch/webhook` endpoint with a locally signed `stream.offline` EventSub notification.
- **Fake YouTube WebSub webhook** - invokes the real `/api/live/youtube/webhook` endpoint with a locally signed Atom notification. If no YouTube API key is configured, dev mode trusts the Atom `yt:videoId` so the UI can still light up.
- **Live: YouTube offline** - turns off only YouTube via `/api/live/_dev/set`.
- **Live: both online** - turns on both sources directly via `/api/live/_dev/set`.

The provider workers remain idle when their API credentials are missing, so
the feature is effectively off until a dashboard command (or manual HTTP call)
pushes local state.

The dashboard commands follow the documented Aspire custom HTTP command
security pattern: the AppHost creates a per-run secret parameter, passes it to
StaticHost as `Live__DevCommandSecret`, and sends it on command requests as
`X-Aspire-Live-Dev-Command-Key: Key: <secret>`. StaticHost validates the header
before accepting `/api/live/_dev/set` and before trusting local fake webhook
commands in no-provider-credential dev mode.

```powershell
# Manually push a live state without provisioning real webhooks.
# Requires the same X-Aspire-Live-Dev-Command-Key header that the AppHost
# dashboard commands send.
curl -Method POST http://localhost:5000/api/live/_dev/set `
  -Headers @{ 'X-Aspire-Live-Dev-Command-Key' = 'Key: <Live__DevCommandSecret value>' } `
  -ContentType 'application/json' `
  -Body '{ "twitch": { "live": true, "channel": "aspiredotdev", "title": "Local test" }, "youtube": { "live": false, "videoId": null } }'

# Inspect the SSE stream:
curl -N http://localhost:5000/api/live/stream
```

The dev endpoint is gated on `IsDevelopment` AND
`Live:EnableDevEndpoint=true` — never enabled in production. The AppHost
sets `Live__EnableDevEndpoint=true`, `Live__DevCommandSecret`, and local-only
webhook signing secrets for the dashboard commands; standalone StaticHost runs
must opt in explicitly.

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
