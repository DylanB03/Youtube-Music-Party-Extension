# Extension Overview

The Chrome extension is built with [WXT](https://wxt.dev/) and uses Manifest V3 with a service worker, content scripts, and a React side panel. There is no popup or options page — the side panel is the sole UI surface.

## Entrypoint Map

| Entrypoint | World | Purpose |
|------------|-------|---------|
| `entrypoints/background.ts` | Service worker | Extension coordinator and backend connection |
| `entrypoints/content.ts` | Isolated | YouTube Music DOM observation and control |
| `entrypoints/page-bridge.content.ts` | Main | YouTube Music `playerApi` access via event bridge |
| `entrypoints/sidepanel/` | Side panel | React UI for party management |

## Service Worker

The service worker (`background.ts`) is the extension's central coordinator. It wires together several modules:

### PartyController (`src/party-controller.ts`)

Orchestrates user actions (create, join, leave, skip, queue) through two extracted services:

- **PartyMutationCoordinator** (`src/party-mutation-coordinator.ts`) — serializes mutations against acknowledged room revisions, ensuring operations are sent in order and each waits for the previous to be acknowledged.
- **PlaybackSynchronizer** (`src/playback-synchronizer.ts`) — calculates canonical playback positions, decides whether to reconcile, and handles guest drift decisions.

### PartyClient (`src/party-client.ts`)

Manages the WebSocket connection to the backend:

- Obtains single-use connection tickets via `PartyApi`
- Reconnects with exponential backoff on disconnection
- Tracks pending operations and resends them after reconnect
- Measures server clock offset via `clock.ping` / `clock.pong` messages
- Validates inbound server messages before dispatching

### PartyApi (`src/party-api.ts`)

HTTP client for the backend REST endpoints:

- `POST /rooms` — create a room
- `POST /rooms/join` — join a room by invite code
- `GET /rooms/resolve/{code}` — resolve an invite code to a room ID
- `POST /rooms/{id}/tickets` — obtain a WebSocket connection ticket

### SessionStorage (`src/session-storage.ts`)

Persists room credentials and local sync state in `chrome.storage.local`. After a MV3 service worker restart, the controller reads stored state and reconnects to the room automatically.

### TabGateway (`src/tab-gateway.ts`)

Encapsulates communication with content scripts running in YouTube Music tabs. Handles tab discovery and message routing.

### Context Menu (`src/party-context-menu.ts`)

Registers a Chrome context menu item ("Add to party queue") as a fallback when YouTube Music's DOM prevents direct menu injection. The menu action uses the exact song captured by the content script at right-click time and respects party permissions.

## Content Script

The isolated content script (`entrypoints/content.ts`) runs on `music.youtube.com` pages and handles:

- **Playback observation** — polls YouTube Music's DOM for the current track, position, play/pause state, and buffering.
- **Playback commands** — loads tracks, seeks, plays, and pauses the local player in response to backend commands.
- **Menu injection** — adds an "Add to party queue" action to YouTube Music's song menus using Shadow DOM.
- **Context capture** — identifies which song was right-clicked or had its three-dot menu opened.
- **Invite prompt** — displays an isolated invite confirmation when the user arrives via an invite link.
- **Diagnostics** — exposes `window.__ytmPartyDiagnostics()` for debugging.

The content script communicates with the service worker through Chrome's `runtime.sendMessage` API using typed `ExtensionRequest` / `ExtensionResponse` messages.

## Page Bridge

The main-world content script (`entrypoints/page-bridge.content.ts`) runs at `document_start` in YouTube Music's JavaScript context. It exists because the YouTube Music player API (`playerApi.loadVideoById`, `playerApi.getVideoData()`) is only accessible from the page's own global scope.

The bridge communicates with the isolated content script through a `CustomEvent` bridge:

```
Isolated content script  →  CustomEvent  →  Main-world bridge  →  playerApi
                          ←  CustomEvent  ←                     ←
```

This keeps the security boundary intact — the isolated content script never gains direct access to YouTube Music's JavaScript globals, and the bridge only exposes a narrow set of safe operations.

## MV3 Lifecycle

Chrome's Manifest V3 terminates the service worker after periods of inactivity. The extension handles this by:

1. Storing session state (`roomId`, `participantId`, `participantToken`, sync status) in `chrome.storage.local`.
2. On service worker wake-up, reading stored state and reconnecting to the room.
3. Resending any pending operations that were not acknowledged before the shutdown.
4. Requesting a fresh `room.snapshot` to reconcile local state.

The WebSocket connection itself keeps the service worker alive while a party is active. If Chrome terminates it anyway (e.g., during extended background periods), the reconnection flow recovers transparently.

## File Map

### Service Worker Layer

| File | Role |
|------|------|
| `src/party-controller.ts` | User action orchestration |
| `src/party-mutation-coordinator.ts` | Serialized revision-based mutations |
| `src/playback-synchronizer.ts` | Canonical position calculation and reconciliation |
| `src/party-client.ts` | WebSocket management, reconnection, clock sync |
| `src/party-api.ts` | HTTP REST client |
| `src/session-storage.ts` | `chrome.storage.local` persistence |
| `src/session-types.ts` | Session, connection, and mutation type definitions |
| `src/tab-gateway.ts` | Content script communication |
| `src/party-context-menu.ts` | Chrome context menu fallback |
| `src/server-message.ts` | Inbound WebSocket message validation |
| `src/pending-operations.ts` | Operation ack tracking, timeout, and resend |
| `src/queue-access.ts` | Host/guest queue-add availability logic |
| `src/invite-code.ts` | Invite code normalization |
| `src/pending-invite-storage.ts` | Prepared invite code storage with TTL |
| `src/invite-coordinator.ts` | Invite preservation when side panel can't open |
| `src/playback-policy.ts` | Pure guest drift and reconciliation decisions |
| `src/playback-application.ts` | Playback application outcome types |

### YouTube Music Layer

| File | Role |
|------|------|
| `src/youtube-music-adapter.ts` | Coordinates observation, commands, capture, and diagnostics |
| `src/youtube-music/selectors.ts` | DOM selectors for tracks, playback, ads, unavailability |
| `src/youtube-music/navigation.ts` | Track loading via page bridge or SPA navigation |
| `src/youtube-music/page-bridge.ts` | Event bridge for `playerApi` calls |
| `src/youtube-music/playback-transition.ts` | Natural track end vs. deliberate host change |
| `src/youtube-music/party-menu.ts` | YouTube Music popup observation and queue action injection |
| `src/youtube-music/party-menu-selection.ts` | Menu selection revalidation and consumption |
| `src/youtube-music/party-menu-styles.ts` | Injected menu action styles |
| `src/youtube-music/track-selection.ts` | Right-click and three-dot song capture with expiry |
| `src/youtube-music/invite-link.ts` | Invite URL parameter parsing |
| `src/youtube-music/invite-prompt.ts` | On-page invite confirmation prompt |
| `src/youtube-music/invite-prompt-styles.ts` | Invite prompt Shadow DOM styles |
