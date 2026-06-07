# Project Layout And Flow

## Recommended Stack

### Extension

- **WXT** for the browser extension project structure, Manifest V3 output, dev server, and extension entrypoints.
- **TypeScript** across the extension, backend, and shared message contracts.
- **React** for the side panel UI.
- **Plain TypeScript content scripts** for YouTube Music page integration, with small DOM adapters instead of React-heavy page injection.
- **Shadow DOM** for any injected page UI so extension controls do not inherit or break YouTube Music styles.

### Backend

- **Cloudflare Workers** as the public backend entrypoint for invite links, short-code resolution, HTTP actions, and WebSocket upgrades.
- **Cloudflare Durable Objects** as the authoritative realtime party rooms. Each active party gets one room object that owns playback state, queue state, permissions, participants, and host transfer.
- **Durable Object storage, D1, KV, or Postgres** for persistent room metadata, invite-code lookup, and future user/friend data. For the MVP, keep persistence minimal.
- **Zod** for validating all client-to-server and server-to-client messages.

### Testing

- **Vitest** for shared logic, reducers, sync calculations, and message validation.
- **Playwright** for browser-level extension testing.
- **Wrangler/Miniflare-style local backend tests** for room behavior and WebSocket message flow.

## High-Level Architecture

```text
YouTube Music page
  |
  | DOM, media element, song menus
  v
Content script
  |
  | extension messages
  v
Service worker <-------- WebSocket --------> Party room backend
  |                                             |
  | extension messages                         | durable room state
  v                                             v
Side panel UI                              Queue, playback, permissions,
                                           participants, host transfer
```

## Extension Responsibilities

### Side Panel UI

The side panel is the user's main control surface. It shows whether the user is in a party, the current song, the queue, participant sync states, invite link/code, host controls, permission toggles, and rejoin actions.

User actions performed from the side panel:

- Create a party.
- Enter a short code to join a party.
- Copy the party link or code.
- Select **Join playback** after entering a party.
- Select **Rejoin playback** when out of sync.
- View the shared queue.
- Host: remove songs from the queue.
- Host: reorder songs in the queue.
- Host: toggle guest skip permission.
- Host: toggle guest queue-add permission.

### Content Script

The content script is the YouTube Music adapter. It should know how to observe and control the existing page, while the rest of the app treats it through a small interface.

Core responsibilities:

- Detect the active YouTube Music track.
- Read the local playback position, duration, paused state, and buffering state.
- Apply backend playback commands by loading a song, seeking, playing, or pausing.
- Detect local play, pause, seek, skip, ended, and buffering events.
- Detect when local playback is out of sync with the party state.
- Capture song metadata when the user opens a right-click or three-dot song menu.
- Add or surface an **Add to party queue** action for the selected song.

Suggested adapter shape:

```ts
interface YouTubeMusicAdapter {
  getCurrentTrack(): Track | null;
  getPlaybackState(): LocalPlaybackState;
  loadTrack(track: Track, startSeconds: number): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  observe(listener: (event: LocalPlaybackEvent) => void): () => void;
  getContextSong(target: EventTarget): Track | null;
}
```

### Service Worker

The service worker is the extension coordinator. It should avoid knowing YouTube Music DOM details.

Core responsibilities:

- Register extension context-menu actions.
- Open or update the side panel when appropriate.
- Maintain the party WebSocket connection when a user is in a party.
- Route messages between the side panel, content script, and backend.
- Store lightweight local session state, such as room ID, participant ID, display name, and latest snapshot.
- Reconnect to the backend and request the latest room snapshot after service worker restarts.

## Backend Responsibilities

### API Worker

The public worker handles non-room-specific entrypoints.

Core responsibilities:

- Create a new party room.
- Generate party links and short codes.
- Resolve a short code to a party room.
- Upgrade authenticated room connections to WebSockets.
- Provide basic health checks and version endpoints.

### Party Room

The party room is authoritative. Clients request actions; the room validates permissions, applies accepted actions, increments a revision, and broadcasts a new snapshot or command.

Core responsibilities:

- Track participants and presence.
- Track host identity and host reconnection grace period.
- Transfer host status if the host does not return.
- Store current track, playback position, play/pause state, and effective timestamp.
- Store ordered queue items.
- Validate host-only actions.
- Validate guest actions against current permission toggles.
- Broadcast state changes to all connected participants.
- Reject stale or invalid events.

## Core Data Model

```ts
type RoomPermissions = {
  guestsCanSkip: boolean;
  guestsCanAddToQueue: boolean;
};

type Track = {
  videoId: string;
  title?: string;
  artist?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
};

type QueueItem = {
  id: string;
  track: Track;
  addedByParticipantId: string;
  addedAtMs: number;
};

type PartyPlaybackState = {
  track: Track | null;
  paused: boolean;
  positionSeconds: number;
  effectiveAtMs: number;
};

type PartyRoomState = {
  roomId: string;
  revision: number;
  hostParticipantId: string;
  permissions: RoomPermissions;
  playback: PartyPlaybackState;
  queue: QueueItem[];
  participants: ParticipantState[];
};
```

## General Project Flow

### Phase 1: YouTube Music Control Spike

Goal: prove the extension can reliably interact with the live YouTube Music page.

Build and test:

- Detect current track ID and metadata.
- Read playback state from the page.
- Pause, play, and seek the local player.
- Load a new track by ID.
- Detect track end.
- Capture a song from right-click or three-dot menu interaction.
- Trigger an **Add to party queue** action for the captured song.

Exit criteria:

- The extension can load and synchronize one known track in one local browser.
- The extension can identify a song selected from the page menu.
- Known fragile selectors and failure cases are documented.

### Phase 2: Extension Shell

Goal: build the user-facing extension flow without realtime sync complexity.

Build:

- Side panel layout and states.
- Create-party button.
- Join-by-code form.
- Invite link/code display.
- Queue list UI.
- Host permission toggles.
- Local-only **Join playback** and **Rejoin playback** flows.

Exit criteria:

- The side panel can drive the local YouTube Music adapter.
- The page menu can add a song to a local mock queue.

### Phase 3: Authoritative Room Backend

Goal: create the backend that owns room state.

Build:

- Create-room endpoint.
- Short-code resolution.
- WebSocket join.
- Room snapshot broadcast.
- Participant presence.
- Host-only action validation.
- Guest permission validation.
- Queue add, remove, and reorder mutations.
- Host transfer after disconnect grace period.

Exit criteria:

- Two extension clients can join the same party and see the same queue and participant list.
- Unauthorized guest actions are rejected by the backend.

### Phase 4: Playback Sync

Goal: synchronize party playback across multiple browser instances.

Build:

- Host play and pause propagation.
- Host seek propagation.
- Host skip propagation.
- Automatic queue advancement when the current song ends.
- Client clock-offset estimation.
- Drift detection.
- Rejoin playback behavior.
- Snapshot recovery after reconnect.

Exit criteria:

- Two clients can join, start the same song, and stay close enough in time for comfortable listening.
- A paused or locally interrupted guest is marked out of sync and can rejoin.

### Phase 5: Page Menu And Queue Polish

Goal: make song queueing feel native.

Build:

- Add **Add to party queue** to right-click song interactions.
- Add **Add to party queue** to the three-dot song menu where feasible.
- Fall back to a Chrome extension context-menu item when direct insertion into YouTube Music's internal menu is unreliable.
- Add queue reorder controls in the side panel.
- Add permission-aware disabled states and explanations for guests.

Exit criteria:

- Host can add songs from common YouTube Music song surfaces.
- Guests can add songs only when permission is enabled.
- Queue order updates for all participants.

### Phase 6: Hardening

Goal: handle real-world YouTube Music behavior.

Build:

- Buffering detection.
- Ad/interruption out-of-sync detection.
- Track-unavailable state.
- Duplicate event suppression.
- Stale revision rejection.
- Reconnection and snapshot reconciliation.
- Basic abuse prevention for party codes.
- Error messages that tell users what action to take.

Exit criteria:

- Party state recovers after reloads, reconnects, local pauses, and common playback interruptions.
- The extension never attempts to bypass ads or playback restrictions.

## User And System Interaction Flows

### Create Party

1. User opens YouTube Music.
2. User opens the extension side panel.
3. User selects **Create party**.
4. Side panel asks the content script for the current track and playback state.
5. Service worker sends `createRoom` to the backend.
6. Backend creates a room, assigns the user as host, and returns a room ID, link, and short code.
7. Side panel displays invite options, participant list, queue, and host permission toggles.

### Join Party

1. Guest opens a party link or enters a short code in the side panel.
2. Service worker resolves the code and connects to the room.
3. Backend adds the guest as a participant and sends the latest room snapshot.
4. Side panel shows the current song and **Join playback**.
5. Guest selects **Join playback**.
6. Content script loads the party's current track, seeks to the calculated current position, and starts playback if the party is playing.
7. Backend and participants receive the guest's updated sync status.

### Host Play Or Pause

1. Host presses play or pause in YouTube Music.
2. Content script detects the local playback event.
3. Service worker sends a host playback action to the backend.
4. Backend validates that the sender is host.
5. Backend updates canonical playback state and broadcasts the new revision.
6. Guest clients apply the play or pause command.

### Guest Local Pause

1. Guest pauses YouTube Music locally.
2. Content script detects the pause.
3. Because guests cannot control party play/pause, no party pause action is sent.
4. Side panel marks the guest **Out of sync**.
5. Guest selects **Rejoin playback** when ready.
6. Content script reapplies the latest room snapshot.

### Add Song From YouTube Music

1. User right-clicks a song or opens its three-dot menu.
2. Content script identifies the selected song.
3. User selects **Add to party queue**.
4. Service worker sends `queue.add` to the backend.
5. Backend validates that the user is host or that guests may add songs.
6. Backend appends the song and broadcasts the updated queue.
7. Side panels update for all participants.

### Reorder Queue

1. Host drags or moves a queue item in the side panel.
2. Side panel sends `queue.reorder` to the backend.
3. Backend validates host authority and the current queue revision.
4. Backend applies the new order and broadcasts the queue.
5. All side panels render the same queue order.

### Skip Or Track End

1. Host skips, a permitted guest skips, or the current song ends.
2. Content script reports the event to the backend.
3. Backend validates the event and advances to the next queue item.
4. Backend removes the played queue item and broadcasts the new current track.
5. Each client loads the next track and seeks to the calculated start position.

### Host Leaves

1. Host disconnects.
2. Backend starts a reconnection grace period and broadcasts **Host disconnected**.
3. If the host returns, they resume host status.
4. If the host does not return, backend transfers host status to the longest-connected guest.
5. The new host's side panel shows host controls.

## Sync Strategy

- Every accepted backend state change increments a room revision.
- Every playback command includes the canonical track, paused state, position, and server effective timestamp.
- Clients estimate server clock offset with periodic ping/pong messages.
- Clients calculate the expected current position from `positionSeconds` and `effectiveAtMs`.
- Small drift is ignored.
- Medium drift can be corrected on rejoin or by a gentle seek.
- Large drift marks the participant out of sync and offers **Rejoin playback**.
- Local volume is never synchronized.

## Permission Rules

- Host can always play, pause, seek, skip, add songs, remove songs, and reorder songs.
- Guests can never play or pause the party.
- Guests can never seek, fast-forward, or rewind the party.
- Guests can skip only when **Allow guests to skip** is enabled.
- Guests can add songs only when **Allow guests to add songs** is enabled.
- Guests can always control local volume.
- Guests who make unauthorized local playback changes become out of sync locally.

## Suggestions And Open Questions

- "Add to the existing three-dot menu" may not be fully reliable because YouTube Music owns that internal menu. Recommendation: attempt a native-feeling insertion where feasible, but keep a Chrome extension context-menu fallback and a side-panel **Add current song** fallback.
- Decide whether guests should be able to remove their own queued songs. Recommendation: defer this until after host-only queue management works.
- Decide whether parties should require display names for anonymous guests. Recommendation: require a temporary display name before joining so participant lists are readable.
- Decide short-code lifetime. Recommendation: codes expire when the party ends or after 24 hours, whichever comes first.
- Decide whether the host's current song should automatically seed the party when they create it. Recommendation: yes, if a song is currently loaded.

## Reference Docs

- Chrome content scripts can read and modify page DOM: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Chrome side panel API: https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- Chrome context menu API: https://developer.chrome.com/docs/extensions/reference/api/contextMenus
- Chrome extension service worker WebSocket lifecycle note: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- WXT extension framework: https://wxt.dev/
- Cloudflare Durable Objects WebSockets: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
