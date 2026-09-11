# Live status

Real-time "are we live?" feature for aspire.dev. The header icon strobes
when the team is broadcasting on YouTube and/or Twitch, and the
`/community/videos/` page swaps to whichever stream is online so visitors
can watch immediately.

## Architecture

```
 Twitch EventSub --+
 YouTube WebSub ---+--> any aspiredev worker
 Browser requests -+            |
                                v
                         Azure Managed Redis
                    canonical state, locks, leases,
                         replay keys, and pub/sub
                                |
                                v
                    per-worker SSE fan-out + coalescing
```

The App Service can use its normal horizontal scaling. Every worker can serve
snapshot, SSE, and webhook requests because Redis holds the canonical state and
coordination data. Redis pub/sub replicates each versioned snapshot to the
per-process broadcaster that serves that worker's SSE clients.

Two `BackgroundService` workers keep the state current:

| Worker                    | Push                      | Confirming poll                                   |
|---------------------------|---------------------------|---------------------------------------------------|
| `TwitchEventSubService`   | EventSub `stream.online/offline` | `/streams?user_id=` reconcile every 30 min |
| `YouTubeWebSubService`    | PubSubHubbub `videos.xml` push   | `videos.list` every 2 min while live; `search.list` every 30 min while idle |

Webhook signature and parsing logic remains separate and unit-testable.
Outgoing HTTP is performed by named, resilient
`HttpClient` instances (`twitch`, `twitch-id`, `youtube`,
`youtube-pubsub`) registered with `AddStandardResilienceHandler`.

## Configuration

Bind from the `Live` section of configuration. In unconfigured local runs,
the corresponding worker logs a warning at startup and remains idle.
The SSE endpoint reports offline unless a local simulation sets live state.

```json
"Live": {
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
deployment parameters. It provisions an empty, shared `siteconfig` Azure Key
Vault for credentials and signing secrets, plus an Azure Managed Redis
instance for live state and coordination.

The scalable StaticHost receives the vault connection and the **Key Vault
Secrets User** role. At startup, it loads the vault through
`AddAzureKeyVaultSecrets`. Neither the AppHost nor StaticHost creates, updates,
or deletes secret values, and the AppHost does not accept secret-value
deployment parameters.

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
not the Aspire resource name. The default Key Vault configuration provider
maps `--` in a secret name to `:` in a .NET configuration key, so use these
names exactly.

| Secret name | Value to supply |
| --- | --- |
| `Live--Twitch--ClientSecret` | Twitch application client secret |
| `Live--Twitch--WebhookSecret` | Independently generated EventSub signing secret |
| `Live--YouTube--ApiKey` | YouTube Data API key |
| `Live--YouTube--WebhookSecret` | Independently generated WebSub signing secret |

The production deployment creates one horizontally scalable `aspiredev` App
Service website. Aspire provisions Azure Managed Redis with Microsoft Entra
authentication and access keys disabled. `WithReference(livecache)` grants the
website's managed identity the Redis data access it needs; no Redis password is
stored in Key Vault.

Redis stores only live-status and coordination data:

- The complete versioned Twitch and YouTube snapshot.
- Provider leadership leases and state-update locks.
- Twitch replay-detection keys with an 11-minute expiry.
- The pending and active YouTube WebSub subscription state.
- A short-lived YouTube confirmation coalescing key.

API keys, OAuth client secrets, and webhook signing secrets remain in Key
Vault. Every StaticHost worker loads the same configuration because any worker
can accept and verify a webhook callback.

StaticHost loads Key Vault configuration at startup; it does not contact Key
Vault for each snapshot, SSE connection, or provider request. Missing provider
credentials leave that provider idle, and missing signing secrets cause its
webhook endpoint to reject requests. After changing a value, restart the App
Service so its bound configuration is reloaded. Rotating webhook signing
secrets also requires recreating the corresponding provider subscriptions.

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
live" announcement happens. A Redis-backed state store:

- Aggregates: `isLive = twitch.live || youtube.live`.
- Serializes updates under a short distributed lock and fences the Redis write
  against lock ownership, so simultaneous or delayed callbacks cannot
  overwrite newer state.
- Scopes each monotonic version sequence to a random state epoch. Workers use
  the epoch and version, rather than clocks that may differ between App Service
  instances, to ignore duplicate or out-of-order pub/sub messages and recover
  safely if the canonical state key is recreated.
- Picks a sticky `primarySource` — only swaps when the current primary
  goes offline. Prevents the UI from flapping when the second platform's
  webhook arrives a few seconds late.
- Publishes the complete versioned snapshot through Redis pub/sub.

Each worker's local broadcaster:

- Coalesces outgoing SSE events with a configurable window
  (default 750 ms). If both sources flip in that window the subscriber
  receives **one** combined update.
- Serializes each published snapshot into one UTF-8 `state` frame, shared by
  existing and newly connected subscribers. Unchanged snapshots do not
  allocate another frame or restart the coalescing timer.
- Uses one periodic heartbeat timer per SSE connection and retains the
  outstanding channel read between ticks, rather than cancelling a read
  for every idle heartbeat.
- Reloads canonical state before seeding a new SSE subscriber and every 30
  seconds, recovering updates missed during a Redis reconnect.

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
pushes state through Redis.

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

- Redis is a required dependency and participates in the application's health
  checks. There is no silent in-memory production fallback that could let
  workers diverge.
- Each provider worker competes for its own renewable Redis leadership lease,
  so only one worker polls or reconciles Twitch and only one independently
  polls or renews YouTube. A worker stops its leader loop as soon as it loses
  the lease.
- Canonical state writes fail the webhook request when Redis is unavailable, so
  Twitch or YouTube can retry instead of receiving a false success.
- Twitch message IDs use separate processing and completed states. Concurrent
  deliveries receive a retryable response while the owner is still processing;
  failed owners release their reservation, and abandoned reservations expire.
- A YouTube subscription is marked as awaiting verification only after the hub
  request is sent. A short pre-send reservation lets another leader recover
  quickly if the original worker exits first.
- If state persistence succeeds but pub/sub publication fails, the writer logs
  the failure. Other workers recover from canonical state during their
  periodic resynchronization.
- Existing SSE connections retain the last local snapshot during a temporary
  Redis interruption. New snapshot and SSE requests require canonical Redis
  state.
- Provider loops log failures and retry on their configured intervals.
- Standard resilience pipeline on every named `HttpClient`.
- Reconciliation timers are the safety net for missed individual webhooks.
- SSE heartbeats every 15 s defeat proxy idle-timeouts; the client uses
  exponential backoff with a `visibilitychange`-aware reconnect.
- Frontend client is re-entrant, idempotent, and survives Astro view
  transitions.
- Missing secrets ⇒ degraded but functional state — never a crash.
