# Current Implementation

## Purpose

This document describes the current feature set, user and system workflows, differences from `PRD.md` and `layout.md`, and each source file's role. It is a current-state reference, not a changelog.

## Feature Status

### Implemented

- Chrome Manifest V3 extension with a YouTube Music content script and side panel.
- Party creation and joining through shareable invite links and short codes.
- Authoritative realtime rooms backed by Cloudflare Durable Objects.
- Room-scoped participant identities and persistent participant tokens.
- Short-lived, single-use WebSocket connection tickets.
- Automatic WebSocket reconnection with exponential backoff.
- Host and guest roles with host-controlled guest skip and queue-add permissions.
- Shared ordered queue, automatic queue advancement, and host removal/reordering controls.
- Shared track, play state, position, and backend timestamp.
- Serialized mutations with operation IDs, expected revisions, acknowledgements, and duplicate-operation protection.
- Host-only shared play, pause, and seek control.
- Guest **Join playback** and **Rejoin playback** actions.
- Guest out-of-sync detection after local pause, play, seek, large drift, advertisements, or unavailable tracks.
- Explicit **Navigating** and **Reconnecting** states.
- Independent local volume that is never synchronized.
- Chrome context-menu **Add to party queue** action using the exact latest right-clicked song.
- Strict rejection of missing or ambiguous context-song selections.
- Host reconnection grace period and automatic host transfer.
- Multiple simultaneous connections for one participant without false disconnects.
- Removal of inactive non-host participants and their stored credentials.
- Extension session recovery after a Manifest V3 service worker restart.
- Runtime backend message validation and request rate limits.
- Remote playback event suppression to prevent synchronization feedback loops.
- Automatic correction of medium playback drift for in-sync guests.
- Canonical playback reapplication after room changes, navigation, or page reload.
- Adapter diagnostics through `window.__ytmPartyDiagnostics()`.
- Unit and orchestration tests for permissions, queue behavior, revisions, presence, host transfer, synchronization, and controller behavior.
- Playwright smoke test that launches the production extension on the live YouTube Music origin and verifies content-script diagnostics.

### Partially Implemented

- Track detection reads page URLs and player-bar metadata, but all YouTube Music variants have not been validated.
- Track loading clicks an existing matching link when possible and otherwise navigates to a watch URL.
- Advertisement and unavailable-track handling uses DOM and media-error heuristics that require broader live validation.
- Invite links display the code and joining instructions instead of automatically opening YouTube Music and the extension.
- Large drift and guest playback changes intentionally require manual rejoin.

### Not Yet Implemented

- Direct insertion into YouTube Music's internal three-dot menu.
- Two-browser end-to-end tests for synchronized playback and queue mutations.
- Verified selectors for every YouTube Music page and advertisement variant.
- User accounts, profiles, friends, and direct friend invitations.
- Queue voting or guest removal of their own submissions.

## User Workflow

### Create A Party

1. The user opens YouTube Music and the extension side panel.
2. The user enters a display name and selects **Create party**.
3. The service worker asks the content script for current playback.
4. The backend creates the room, invite code, host identity, and participant token.
5. The extension exchanges the participant token for a short-lived connection ticket.
6. The extension opens a WebSocket and receives the authoritative room snapshot.
7. The side panel displays the invite, queue, participants, and host controls.

### Join A Party

1. A guest receives an invite link or short code.
2. The guest opens YouTube Music, opens the side panel, and enters the code.
3. The backend validates the code and issues a guest identity and participant token.
4. The extension obtains a one-use connection ticket and connects to the room.
5. The guest selects **Join playback**.
6. The content script loads the canonical track, seeks to the calculated position, and matches the shared play state.

### Synchronize Playback

1. The content script observes host playback events.
2. The service worker serializes each event behind earlier room mutations.
3. The request includes an operation ID and expected room revision.
4. The backend validates authority and revision, applies its own timestamp, and acknowledges the accepted revision.
5. The backend broadcasts the updated snapshot.
6. In-sync participants apply changed canonical playback automatically.

Only the host changes shared play, pause, and current-track position. Guests may skip the whole song when permitted, but guest fast-forward, rewind, play, or pause remains local and marks that guest out of sync.

### Add And Manage Queue Items

1. A user right-clicks a YouTube Music song.
2. The content script stores the track associated with that menu event.
3. The user selects **Add to party queue** from Chrome's extension context menu.
4. The content script consumes the stored selection so it cannot be reused accidentally.
5. The backend permits the host, or a guest when guest additions are enabled, to add it.
6. The backend acknowledges the mutation and broadcasts the updated queue.

The host can remove or reorder queue items from the side panel. A permitted skip or host track-ended event advances to the first queued song.

### Recover Synchronization

1. A guest pauses, plays, seeks, drifts significantly, encounters an advertisement, or cannot load a track.
2. The extension marks the guest **Out of sync** or **Track unavailable** without changing shared playback.
3. The guest selects **Rejoin playback**.
4. The service worker calculates the current canonical position using backend time and clock offset.
5. The content script reapplies the track, position, and play state while suppressing feedback events.

When a track application requires page navigation, the extension displays **Navigating** until the reloaded content script completes synchronization.

### Recover A Connection

The extension stores room credentials and local sync state in `chrome.storage.local`. After a service worker restart or unexpected socket close, it requests a fresh connection ticket, reconnects with exponential backoff, and resends unresolved operations. Repeated operations return their stored acknowledgement rather than executing twice.

If the host remains disconnected beyond the grace period, authority transfers to the longest-connected guest. Disconnected non-host participants are removed after the retention period.

## System Workflow

```text
Side panel
  |
  | typed extension messages
  v
Background service worker
  |                         |
  | tab messages            | HTTP ticket + WebSocket
  v                         v
YouTube Music content    Cloudflare Worker
script                      |
  | DOM/media                | invite KV + rate limits
  v                          v
YouTube Music player     Durable Object room
```

The content script owns YouTube Music DOM and media interaction. The background service worker owns stored session state, backend connections, mutation ordering, and routing. The Worker owns public HTTP routing, invite lookup, and approximate fixed-window rate limits. The Durable Object owns room state, permissions, queue order, revisions, operation acknowledgements, connection tickets, presence, and host transfer.

## Changes From Planning

- `layout.md` proposed Zod; the implementation uses dependency-free TypeScript runtime validators.
- `layout.md` mentioned Shadow DOM, but no page UI is injected yet.
- The PRD requests a YouTube Music three-dot menu action; the current reliable implementation uses Chrome's context menu.
- Invite links currently show the code and instructions rather than opening the extension automatically.
- Cloudflare Durable Objects store room state and KV stores invite mappings and rate-limit counters.
- Authentication tokens, one-use tickets, operation acknowledgements, reconnect recovery, rate limits, inactive participant cleanup, strict context selection, event suppression, and diagnostics were added as hardening beyond the original planning documents.

## File Map

### Documentation And Workspace

- `PRD.md`: Defines intended product behavior and scope.
- `layout.md`: Defines the planned architecture, stack, data model, and phases.
- `iteration.md`: Documents the current implementation.
- `README.md`: Provides repository and local-development instructions.
- `package.json`: Defines workspaces and root development, verification, and build commands.
- `package-lock.json`: Locks dependency versions.
- `playwright.config.ts`: Configures browser smoke tests and failure traces.
- `tsconfig.base.json`: Supplies shared strict TypeScript settings.
- `.gitignore`: Excludes dependencies, generated output, Wrangler state, and local configuration.

### Shared Package

- `packages/shared/src/protocol.ts`: Defines room data, messages, operation acknowledgements, connection-ticket responses, defaults, and validators.
- `packages/shared/src/sync.ts`: Calculates canonical positions, clock offsets, drift policy, and synchronization status.
- `packages/shared/src/sync.test.ts`: Verifies synchronization math and thresholds.
- `packages/shared/package.json` and `packages/shared/tsconfig.json`: Configure the shared workspace.

### Backend

- `apps/backend/src/index.ts`: Exposes Worker and Durable Object entrypoints.
- `apps/backend/src/api-worker.ts`: Routes health, invite, room, join, ticket, and WebSocket requests and applies rate limits.
- `apps/backend/src/party-room.ts`: Persists rooms, authenticates tickets, manages sockets and presence, dispatches mutations, and stores operation results.
- `apps/backend/src/domain/room-state.ts`: Contains pure permission, playback, queue, revision, presence, cleanup, and host-transfer rules.
- `apps/backend/src/domain/room-state.test.ts`: Verifies backend domain behavior.
- `apps/backend/src/lib/http.ts`: Builds JSON responses, parses bodies, and renders invite pages.
- `apps/backend/src/lib/ids.ts`: Generates IDs, invite codes, and secure tokens.
- `apps/backend/src/lib/rate-limit.ts`: Applies approximate KV-backed fixed-window request limits.
- `apps/backend/src/types.ts`: Defines Worker bindings and stored authentication/session records.
- `apps/backend/package.json`, `apps/backend/tsconfig.json`, and `apps/backend/wrangler.toml`: Configure backend dependencies, types, and Cloudflare resources.

### Extension

- `apps/extension/entrypoints/background.ts`: Registers extension listeners and wires API, storage, tabs, controller, and realtime client.
- `apps/extension/entrypoints/content.ts`: Starts observation, context capture, diagnostics, and playback command handling.
- `apps/extension/entrypoints/sidepanel/main.tsx`: Implements create/join, invite, status, permission, queue, and participant interactions.
- `apps/extension/entrypoints/sidepanel/styles.css`: Defines side-panel presentation.
- `apps/extension/src/party-api.ts`: Calls room, join, and connection-ticket HTTP endpoints.
- `apps/extension/src/party-client.ts`: Manages ticket-authenticated sockets, reconnects, pending operations, snapshots, and clock pings.
- `apps/extension/src/party-controller.ts`: Orchestrates sessions, serialized mutations, synchronization, navigation, and user actions.
- `apps/extension/src/party-controller.test.ts`: Verifies controller permissions, serialization, and playback reconciliation.
- `apps/extension/src/playback-policy.ts`: Contains pure guest drift and reconciliation decisions.
- `apps/extension/src/playback-policy.test.ts`: Verifies drift and interruption decisions.
- `apps/extension/src/playback-application.ts`: Defines applied-versus-navigating playback outcomes.
- `apps/extension/src/session-storage.ts`: Persists room credentials and local sync state.
- `apps/extension/src/session-types.ts`: Defines active, stored, view, connection, and mutation types.
- `apps/extension/src/tab-gateway.ts`: Encapsulates content-script communication.
- `apps/extension/src/youtube-music-adapter.ts`: Coordinates playback application, observation, context capture, suppression, and diagnostics.
- `apps/extension/src/youtube-music/navigation.ts`: Loads tracks through matching links or controlled navigation.
- `apps/extension/src/youtube-music/selectors.ts`: Extracts tracks, playback, advertisements, and unavailable state.
- `apps/extension/src/browser.ts`, `config.ts`, `env.d.ts`, and `extension-messaging.ts`: Provide browser, URL, environment, and typed-message utilities.
- `apps/extension/package.json`, `tsconfig.json`, and `wxt.config.ts`: Configure the extension build and manifest.

### Browser Tests

- `tests/browser/extension-smoke.spec.ts`: Loads the unpacked production extension in Chromium, opens YouTube Music, and verifies content-script diagnostics.

## Current Verification

The source currently passes:

```sh
npm run check
npm test
npm run build:extension
env XDG_CONFIG_HOME=/tmp npm run build:backend
env PLAYWRIGHT_BROWSERS_PATH=/tmp/playwright-browsers npm run test:browser
```

The suite contains 20 unit and orchestration tests plus one live-origin browser smoke test. The smoke test proves that the production extension and content script load on YouTube Music; it does not yet prove every selector, advertisement flow, menu variant, or two-client synchronization path.

`npm audit` reports six advisories in WXT's local `web-ext-run` development chain, for which npm currently offers no patched WXT path. The critical Vitest advisory was removed by upgrading to Vitest 4.1.8. The remaining affected tools are used during local extension development and are not included in the built extension or Worker bundle.
