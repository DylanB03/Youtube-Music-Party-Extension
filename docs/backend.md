# Backend

The backend runs on Cloudflare Workers with Durable Objects for realtime room state and KV for invite code mapping. There is no separate database, Node server, or auth provider.

## API Routes

The Worker (`apps/backend/src/api-worker.ts`) handles all HTTP traffic:

| Method | Path | Purpose | Rate Limit |
|--------|------|---------|------------|
| `GET` | `/health` | Health check | None |
| `GET` | `/join/{code}` | Invite landing page (HTML) | None |
| `POST` | `/rooms` | Create a new room | 10/min |
| `POST` | `/rooms/join` | Join a room by invite code | 30/min |
| `GET` | `/rooms/resolve/{code}` | Resolve invite code to room ID | 60/min |
| `POST` | `/rooms/{id}/tickets` | Issue a WebSocket connection ticket | 60/min |
| `*` | `/rooms/{id}/connect` | Proxied to Durable Object (WebSocket upgrade) | None |

### Create Room (`POST /rooms`)

Request:

```json
{
  "displayName": "Alice",
  "initialPlayback": {
    "track": { "videoId": "dQw4w9WgXcQ", "title": "..." },
    "paused": false,
    "positionSeconds": 42.5,
    "effectiveAtMs": 1719500000000
  }
}
```

Response (`201`):

```json
{
  "roomId": "room_abc123",
  "inviteCode": "XKCD42",
  "inviteUrl": "https://backend.workers.dev/join/XKCD42",
  "participantId": "participant_def456",
  "participantToken": "tok_..."
}
```

The creator becomes the host. If `initialPlayback` is omitted, the room starts with no track and paused state.

### Join Room (`POST /rooms/join`)

Request:

```json
{
  "inviteCode": "XKCD42",
  "displayName": "Bob"
}
```

Response (`201`):

```json
{
  "roomId": "room_abc123",
  "inviteCode": "XKCD42",
  "participantId": "participant_ghi789",
  "participantToken": "tok_..."
}
```

The invite code is resolved via KV. If the code is expired or the room is gone, the endpoint returns `404` or `410`.

### Connection Tickets (`POST /rooms/{id}/tickets`)

The extension authenticates with its `participantToken` (Bearer token) and receives a single-use, short-lived ticket:

```json
{
  "ticket": "tkt_...",
  "expiresAtMs": 1719500060000
}
```

The ticket is exchanged for a WebSocket connection at `/rooms/{id}/connect`. This two-step auth flow prevents token exposure in WebSocket URLs and enables ticket revocation.

### Invite Landing Page (`GET /join/{code}`)

Returns a server-rendered HTML page with the invite code and a link to YouTube Music. If the code has expired, returns an expired-invite page instead. The landing page deep-links to YouTube Music with the invite code as a URL parameter, triggering the in-page invite prompt flow.

## Durable Object: PartyRoom

Each party room is a single `PartyRoom` Durable Object instance (`apps/backend/src/party-room.ts`). It is the authoritative source of truth for all room state.

### State

The room maintains:

- **Room identity** — room ID, invite code, creation time
- **Participants** — IDs, display names, roles (host/guest), sync status, connection timestamps
- **Playback** — current track, paused state, position, effective timestamp
- **Queue** — ordered list of `QueueItem`s with track metadata and who added them
- **Permissions** — `guestsCanSkip` and `guestsCanAddToQueue` toggles
- **Revision** — monotonically increasing counter, incremented on every state change
- **Operation acknowledgements** — stored results for duplicate operation detection

State is persisted in the Durable Object's SQLite storage and survives restarts.

### Domain Modules

Room logic is organized into focused modules under `apps/backend/src/domain/`:

| Module | Responsibility |
|--------|---------------|
| `room-state.ts` | Permission checks, playback mutations, queue mutations, revision management, presence tracking, host transfer |
| `room-auth.ts` | Participant tokens, connection ticket generation and validation, operation ack storage |
| `room-connections.ts` | Active WebSocket tracking, per-participant connections, broadcast to all sockets |
| `room-message-processor.ts` | Inbound message validation, mutation application, snapshot responses |
| `room-presence.ts` | Participant cleanup scheduling, lifecycle alarm calculation |
| `room-lifecycle.ts` | Absolute and idle room expiration deadlines |
| `room-limits.ts` | Configurable caps (participants, queue size, display name length, track metadata) |
| `connection-guard.ts` | Per-socket message size and rate enforcement |

### WebSocket Lifecycle

1. Client sends `POST /rooms/{id}/tickets` with their participant token → receives a one-use ticket.
2. Client sends a WebSocket upgrade to `/rooms/{id}/connect?ticket={ticket}`.
3. The Worker proxies to the Durable Object, which validates the ticket and accepts the connection.
4. The DO sends an initial `room.snapshot` with the full room state.
5. The client and server exchange `ClientMessage` / `ServerMessage` frames.
6. On disconnect, the DO marks the participant as disconnected and schedules a presence check alarm.

Multiple simultaneous connections from the same participant are supported without triggering false disconnect events.

### Connection Guards

Each WebSocket connection is monitored by `connection-guard.ts`:

- **Message size** — messages exceeding the configured maximum are rejected
- **Message rate** — a fixed-window burst limit prevents message flooding

Violations close the socket with an error.

## Rate Limiting

The Worker applies approximate fixed-window rate limits using KV (`apps/backend/src/lib/rate-limit.ts`). Limits are scoped per endpoint and keyed by client IP. Rate-limited requests receive a `429` response.

## Host Transfer

When the host disconnects:

1. The room records `hostDisconnectedAtMs` and broadcasts a `room.snapshot` with this field set.
2. A Durable Object alarm fires after the grace period.
3. If the host has reconnected, the alarm is cancelled.
4. If not, the longest-connected guest becomes the new host.
5. A new `room.snapshot` is broadcast with the updated `hostParticipantId`.

## Participant Cleanup

Disconnected non-host participants are removed after a retention period. Their stored credentials (tokens, operation acks) are also cleaned up. This prevents abandoned participants from accumulating.

## Room Expiration

Rooms have two expiration mechanisms:

- **Absolute lifetime** — rooms expire after a maximum duration regardless of activity
- **Idle lifetime** — rooms with no connected participants expire after an idle period

When a room expires:

1. All remaining WebSocket connections are closed
2. The invite code is deleted from KV
3. Durable Object storage is cleared
4. The extension receives a terminal error and clears stored credentials instead of reconnecting

## Wrangler Configuration

```toml
name = "youtube-music-party-backend"
main = "src/index.ts"
compatibility_date = "2026-06-02"

[[durable_objects.bindings]]
name = "PARTY_ROOMS"
class_name = "PartyRoom"

[[kv_namespaces]]
binding = "INVITES"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["PartyRoom"]
```

!!! note "Production KV IDs"
    The `wrangler.toml` in the repository uses placeholder KV namespace IDs. Replace `replace-with-production-kv-id` and `replace-with-preview-kv-id` with real values before deploying to production.

## Deployment

The backend is deployed with Wrangler:

```sh
npx wrangler deploy
```

CI runs `wrangler deploy --dry-run` to validate the bundle without actually deploying. Production deployment is currently manual.

### E2E Configuration

`wrangler.e2e.toml` provides a separate configuration for browser tests:

- Port `8797` (avoids conflicts with the dev server on `8787`)
- Isolated KV namespace
- Short lifecycle TTLs and low participant limits for fast test execution
