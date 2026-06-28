# Current Implementation

## Purpose

This document describes the current feature set, user and system workflows, differences from `PRD.md` and `layout.md`, and each source file's role. It is a current-state reference, not a changelog.

## Feature Status

### Implemented

- Chrome Manifest V3 extension with a YouTube Music content script and side panel.
- Party creation and joining through shareable invite links and short codes.
- Validated invite landing pages that open YouTube Music with the party code.
- An isolated YouTube Music invite prompt that prepares and opens the side panel without joining automatically.
- Pending invite expiry, prefilled join forms, and explicit handling when the user is already in another party.
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
- Native-feeling **Add to party queue** action injected into recognized YouTube Music song menus.
- An anchored on-page queue action when YouTube Music uses an unrecognized private popup implementation.
- Shadow DOM isolation for the injected menu action so YouTube Music styles cannot corrupt it.
- Permission-aware menu states that explain when the user is not in a party or guest additions are disabled.
- Chrome context-menu fallback using the exact latest right-clicked song and matching party permissions.
- Menu selections expire and are revalidated at click time so stale songs cannot be queued.
- Menu permission checks wait for the first authoritative room snapshot and work correctly with multiple YouTube Music tabs.
- Composed-path song capture for menu controls rendered through YouTube Music shadow roots.
- Targeted popup observation plus bounded delayed scans for added, reused, or asynchronously populated menus.
- Strict rejection of missing or ambiguous context-song selections.
- Host reconnection grace period and automatic host transfer.
- Multiple simultaneous connections for one participant without false disconnects.
- Removal of inactive non-host participants and their stored credentials.
- Extension session recovery after a Manifest V3 service worker restart.
- Runtime backend message validation and request rate limits.
- Runtime client validation for inbound WebSocket messages with protocol-error recovery.
- Bounded operation waits that request a fresh room snapshot after timeout.
- Configurable participant, queue, WebSocket message-size, message-rate, display-name, and track-metadata limits.
- Absolute room expiration and abandoned-room idle expiration with invite and Durable Object cleanup.
- Terminal expired-room handling that clears saved extension credentials instead of reconnecting forever.
- Remote playback event suppression to prevent synchronization feedback loops.
- Host playback application remains active during slow YouTube Music route changes so programmatic track loads cannot be mistaken for local host actions.
- Host natural track endings suppress YouTube Music's native auto-next events until a newer party queue snapshot applies.
- Empty party playback actively pauses local YouTube Music auto-next instead of letting recommendations become party state.
- A main-world YouTube Music page bridge loads canonical tracks through the real `playerApi.loadVideoById` and verifies `playerApi.getVideoData()` before declaring playback unavailable.
- Automatic correction of medium playback drift for in-sync guests.
- Canonical playback reapplication after room changes, navigation, or page reload.
- Adapter diagnostics through `window.__ytmPartyDiagnostics()`.
- Unit and orchestration tests for permissions, queue behavior, revisions, presence, host transfer, synchronization, and controller behavior.
- Playwright smoke test that launches the production extension on the live YouTube Music origin and verifies content-script diagnostics.
- Continuous integration for type checks, unit tests, production builds, and browser regressions.
- Two-client local Durable Object tests for queueing, permissions, playback, stale revisions, reconnect recovery, host transfer, participant limits, and lifecycle expiry.
- Recorded selector fixtures for search, album, playlist, queue, and recommendation surfaces.
- A dated live-origin compatibility report separating automated evidence from authenticated manual checks.
- Side-panel loading states, actionable errors, success notices, host-disconnected notice, clipboard feedback, and leave-party control.

### Partially Implemented

- Track detection reads page URLs, row links, row video IDs, and player-bar metadata, but every live YouTube Music variant still cannot be guaranteed.
- Track loading uses YouTube Music's page player API first and falls back to in-page navigation without reloading the tab.
- Advertisement and unavailable-track handling uses DOM and media-error heuristics that require broader live validation.
- Large drift and guest playback changes intentionally require manual rejoin.

### Not Yet Implemented

- Signed-in manual validation across every current YouTube Music page and advertisement variant.
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
2. Opening a valid link displays the code and an **Open YouTube Music** action.
3. YouTube Music displays an isolated invite prompt; selecting **Open party panel** stores the code locally for up to 30 minutes and pre-fills the side panel.
4. The guest chooses a display name and explicitly selects **Join**. A short code can also be entered directly in the panel.
5. The backend validates the code and issues a guest identity and participant token.
6. The extension obtains a one-use connection ticket and connects to the room.
7. The guest explicitly selects **Join playback**.
8. The content script loads the canonical track, seeks to the calculated position, and matches the shared play state.

Preparing an invite never joins a room or changes playback. If the user is already in a party, the panel keeps the pending invite visible and requires them to leave before joining it.

### Synchronize Playback

1. The content script observes host playback events.
2. The service worker serializes each event behind earlier room mutations.
3. The request includes an operation ID and expected room revision.
4. The backend validates authority and revision, applies its own timestamp, and acknowledges the accepted revision.
5. The backend broadcasts the updated snapshot.
6. In-sync participants apply changed canonical playback automatically.

Only the host changes shared play, pause, and current-track position. Guests may skip the whole song when permitted, but guest fast-forward, rewind, play, or pause remains local and marks that guest out of sync.

### Add And Manage Queue Items

1. A user selects a song's three-dot menu or right-clicks a YouTube Music song.
2. The content script resolves the containing song row and stores the track for up to two minutes.
3. Recognized YouTube Music menus receive an isolated **Add to party queue** action; Chrome's context menu remains the fallback.
4. The action is enabled for the host or a permitted guest and otherwise displays the reason it is unavailable.
5. Selecting the action consumes the stored song so it cannot be reused accidentally.
6. The backend validates the same permission, acknowledges the mutation, and broadcasts the updated queue.

The host can remove or reorder queue items from the side panel. A permitted skip or host track-ended event advances to the first queued song.

### Recover Synchronization

1. A guest pauses, plays, seeks, drifts significantly, encounters an advertisement, or cannot load a track.
2. The extension marks the guest **Out of sync** or **Track unavailable** without changing shared playback.
3. The guest selects **Rejoin playback**.
4. The service worker calculates the current canonical position using backend time and clock offset.
5. The content script reapplies the track, position, and play state while suppressing feedback events.

Track changes use YouTube Music's in-page navigation path, preserving the current tab and content-script session.

### Recover A Connection

The extension stores room credentials and local sync state in `chrome.storage.local`. After a service worker restart or unexpected socket close, it requests a fresh connection ticket, reconnects with exponential backoff, and resends unresolved operations. Repeated operations return their stored acknowledgement rather than executing twice.

If the host remains disconnected beyond the grace period, authority transfers to the longest-connected guest. Disconnected non-host participants are removed after the retention period.

Rooms have an absolute lifetime and an abandoned idle lifetime. Expiration closes remaining sockets, removes the invite-code mapping, and deletes Durable Object storage.

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
- The page menu action uses Shadow DOM rather than inheriting YouTube Music's internal styles.
- Direct menu insertion is implemented for recognized menu containers, with Chrome's context menu retained because YouTube Music controls and may change its private DOM.
- Invite links open YouTube Music with a query parameter because websites cannot directly navigate to a Chrome extension page. The content script then requires an explicit click before opening the side panel.
- Cloudflare Durable Objects store room state and KV stores invite mappings and rate-limit counters.
- Authentication tokens, one-use tickets, operation acknowledgements, reconnect recovery, rate limits, inactive participant cleanup, strict context selection, event suppression, and diagnostics were added as hardening beyond the original planning documents.
- Explicit room caps, socket guards, room lifecycle cleanup, detailed side-panel feedback, selector fixtures, and local two-client integration tests were added beyond the original planning documents.

## File Map

### Documentation And Workspace

- `PRD.md`: Defines intended product behavior and scope.
- `layout.md`: Defines the planned architecture, stack, data model, and phases.
- `iteration.md`: Documents the current implementation.
- `README.md`: Provides repository and local-development instructions.
- `package.json`: Defines workspaces and root development, verification, and build commands.
- `package-lock.json`: Locks dependency versions.
- `playwright.config.ts`: Configures browser smoke tests and failure traces.
- `.github/workflows/ci.yml`: Runs type, unit, build, and browser verification for pull requests and `main`.
- `docs/youtube-music-selector-validation.md`: Provides the signed-in selector and interruption validation checklist.
- `docs/youtube-music-compatibility-report.md`: Records automated live-origin results and remaining authenticated checks.
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
- `apps/backend/src/party-room.ts`: Coordinates Durable Object HTTP routes, room persistence, lifecycle alarms, sockets, and extracted domain services.
- `apps/backend/src/domain/room-state.ts`: Contains pure permission, playback, queue, revision, presence, cleanup, and host-transfer rules.
- `apps/backend/src/domain/room-state.test.ts`: Verifies backend domain behavior.
- `apps/backend/src/domain/connection-guard.ts`: Measures message bytes and enforces per-socket burst limits.
- `apps/backend/src/domain/connection-guard.test.ts`: Verifies message-size and rate-window behavior.
- `apps/backend/src/domain/room-lifecycle.ts`: Calculates absolute and abandoned-idle room expiration.
- `apps/backend/src/domain/room-lifecycle.test.ts`: Verifies lifecycle deadlines.
- `apps/backend/src/domain/room-limits.ts`: Reads configurable room limits and validates display names.
- `apps/backend/src/domain/room-auth.ts`: Owns participant tokens, connection tickets, and retained operation acknowledgements.
- `apps/backend/src/domain/room-connections.ts`: Tracks active sockets, connected participants, broadcasts, and room-wide closure.
- `apps/backend/src/domain/room-message-processor.ts`: Validates socket traffic and applies limits, mutations, acknowledgements, and snapshots.
- `apps/backend/src/domain/room-presence.ts`: Calculates participant-cleanup and room-lifecycle alarm deadlines.
- `apps/backend/src/lib/http.ts`: Builds JSON responses and parses request bodies.
- `apps/backend/src/lib/invite-page.ts`: Renders valid and expired invite landing pages with the YouTube Music deep link.
- `apps/backend/src/lib/invite-page.test.ts`: Verifies invite deep links and expired-link responses.
- `apps/backend/src/lib/config.ts`: Reads bounded backend and room configuration values.
- `apps/backend/src/lib/ids.ts`: Generates IDs, invite codes, and secure tokens.
- `apps/backend/src/lib/rate-limit.ts`: Applies approximate KV-backed fixed-window request limits.
- `apps/backend/src/types.ts`: Defines Worker bindings and stored authentication/session records.
- `apps/backend/package.json`, `apps/backend/tsconfig.json`, and `apps/backend/wrangler.toml`: Configure backend dependencies, types, and Cloudflare resources.
- `apps/backend/wrangler.e2e.toml`: Supplies short, isolated limits and lifecycle timings for local browser tests.

### Extension

- `apps/extension/entrypoints/background.ts`: Registers extension listeners and wires API, storage, tabs, controller, and realtime client.
- `apps/extension/entrypoints/content.ts`: Starts observation, context capture, diagnostics, and playback command handling.
- `apps/extension/entrypoints/sidepanel/main.tsx`: Implements create/join, invite, status, permission, queue, and participant interactions.
- `apps/extension/entrypoints/sidepanel/party-setup-card.tsx`: Owns display-name, create-party, invite-prefill, and explicit join interactions.
- `apps/extension/entrypoints/sidepanel/use-party-session.ts`: Centralizes side-panel requests, pending state, errors, and success notices.
- `apps/extension/entrypoints/sidepanel/use-pending-invite.ts`: Loads, updates, expires, and clears prepared invite state for the panel.
- `apps/extension/entrypoints/sidepanel/queue-card.tsx`: Owns queue rendering, skipping, removal, and reordering controls.
- `apps/extension/entrypoints/sidepanel/permission-toggle.tsx`: Provides reusable permission controls.
- `apps/extension/entrypoints/sidepanel/styles.css`: Defines side-panel presentation.
- `apps/extension/src/party-api.ts`: Calls room, join, and connection-ticket HTTP endpoints.
- `apps/extension/src/party-context-menu.ts`: Registers and permission-gates Chrome's queue fallback action.
- `apps/extension/src/invite-code.ts`: Normalizes invite codes independently of browser storage.
- `apps/extension/src/pending-invite-storage.ts`: Stores prepared invite codes locally with a 30-minute lifetime.
- `apps/extension/src/pending-invite-storage.test.ts`: Verifies invite-code normalization.
- `apps/extension/src/invite-coordinator.ts`: Preserves prepared invites even when Chrome cannot open the side panel.
- `apps/extension/src/invite-coordinator.test.ts`: Verifies side-panel failure does not discard an invite.
- `apps/extension/src/party-client.ts`: Manages ticket-authenticated sockets, reconnects, pending operations, snapshots, and clock pings.
- `apps/extension/src/server-message.ts`: Parses and validates backend frames before the realtime client consumes them.
- `apps/extension/src/server-message.test.ts`: Verifies malformed and valid backend frame handling.
- `apps/extension/src/pending-operations.ts`: Owns acknowledgement waits, timeout recovery, reconnect resends, and rejection.
- `apps/extension/src/pending-operations.test.ts`: Verifies acknowledgement, timeout, and resend behavior.
- `apps/extension/src/party-controller.ts`: Coordinates sessions and user actions through extracted mutation and playback services.
- `apps/extension/src/party-mutation-coordinator.ts`: Serializes mutations against acknowledged room revisions.
- `apps/extension/src/playback-synchronizer.ts`: Owns canonical playback calculation, reconciliation, and guest drift decisions.
- `apps/extension/src/party-controller.test.ts`: Verifies controller permissions, serialization, and playback reconciliation.
- `apps/extension/src/playback-policy.ts`: Contains pure guest drift and reconciliation decisions.
- `apps/extension/src/playback-policy.test.ts`: Verifies drift and interruption decisions.
- `apps/extension/src/playback-application.ts`: Defines applied-versus-navigating playback outcomes.
- `apps/extension/src/queue-access.ts`: Centralizes host and guest queue-add availability and explanations.
- `apps/extension/src/queue-access.test.ts`: Verifies queue-add access for hosts, guests, and users outside a party.
- `apps/extension/src/session-storage.ts`: Persists room credentials and local sync state.
- `apps/extension/src/session-types.ts`: Defines active, stored, view, connection, and mutation types.
- `apps/extension/src/tab-gateway.ts`: Encapsulates content-script communication.
- `apps/extension/src/youtube-music-adapter.ts`: Coordinates playback application, observation, context capture, suppression, and diagnostics.
- `apps/extension/entrypoints/page-bridge.content.ts`: Runs in YouTube Music's main world and exposes safe player commands to the isolated content script.
- `apps/extension/src/youtube-music/navigation.ts`: Loads tracks through the main-world player bridge or guarded YouTube Music SPA navigation without full-page fallback.
- `apps/extension/src/youtube-music/page-bridge.ts`: Defines the event bridge used to call YouTube Music's page-owned player API and verify active video IDs.
- `apps/extension/src/youtube-music/playback-transition.ts`: Distinguishes natural track endings from deliberate host track changes.
- `apps/extension/src/youtube-music/invite-link.ts`: Reads and removes party invite parameters from YouTube Music URLs.
- `apps/extension/src/youtube-music/invite-link.test.ts`: Verifies invite URL parsing and cleanup.
- `apps/extension/src/youtube-music/invite-prompt.ts`: Builds the isolated invite confirmation prompt without using page HTML injection.
- `apps/extension/src/youtube-music/invite-prompt-styles.ts`: Defines the prompt's Shadow DOM presentation.
- `apps/extension/src/youtube-music/party-menu.ts`: Observes legacy and modern YouTube Music popups, coordinates injected queue actions, and provides the anchored fallback.
- `apps/extension/src/youtube-music/party-menu-selection.ts`: Revalidates and consumes menu selections immediately before queue mutation.
- `apps/extension/src/youtube-music/party-menu-selection.test.ts`: Verifies stale or replaced menu selections are rejected.
- `apps/extension/src/youtube-music/party-menu-styles.ts`: Defines the isolated injected action appearance.
- `apps/extension/src/youtube-music/selectors.ts`: Extracts tracks, playback, advertisements, and unavailable state.
- `apps/extension/src/youtube-music/track-selection.ts`: Captures, expires, peeks, and consumes right-click and three-dot song selections.
- `apps/extension/src/youtube-music/track-selection.test.ts`: Verifies one-use and expiration behavior for selected tracks.
- `apps/extension/src/browser.ts`, `config.ts`, `env.d.ts`, and `extension-messaging.ts`: Provide browser, URL, environment, and typed-message utilities.
- `apps/extension/package.json`, `tsconfig.json`, and `wxt.config.ts`: Configure the extension build and manifest.

### Browser Tests

- `tests/browser/extension-smoke.spec.ts`: Loads the unpacked production extension in Chromium, verifies diagnostics, and exercises three-dot selection plus Shadow DOM menu injection on the YouTube Music origin.
- `tests/browser/invite-link-flow.spec.ts`: Verifies the backend landing page, YouTube Music prompt, prepared code, panel prefill, and absence of automatic joining.
- `tests/browser/party-room-flow.spec.ts`: Runs two realtime clients against local Wrangler and verifies room behavior and lifecycle.
- `tests/browser/selector-fixtures.spec.ts`: Validates known signed-in surface shapes and interruption selectors on the YouTube Music origin.
- `tests/browser/fixtures/youtube-music-surfaces.ts`: Records representative song-row structures without bypassing YouTube Music Trusted Types.
- `tests/browser/support/party-test-client.ts`: Provides the HTTP, ticket, WebSocket, and message-waiting test client.

## Current Verification

The source currently passes:

```sh
npm run check
npm test
npm run build:extension
env XDG_CONFIG_HOME=/tmp npm run build:backend
env PLAYWRIGHT_BROWSERS_PATH=/tmp/playwright-browsers npm run test:browser
```

The suite contains 61 unit and orchestration tests plus six browser/integration scenarios. Browser coverage proves production extension loading, shadow-retargeted menu capture, modern popup insertion, anchored menu fallback, invite preparation and dismissal without automatic joining, six signed-in surface fixtures, ad and unavailable selectors, two-client realtime room behavior, reconnect recovery, host transfer, and abandoned-room expiry. The authenticated checklist remains necessary because YouTube Music can change private DOM variants independently of this project.

`npm audit` reports six advisories in WXT's local `web-ext-run` development chain, for which npm currently offers no patched WXT path. The critical Vitest advisory was removed by upgrading to Vitest 4.1.8. The remaining affected tools are used during local extension development and are not included in the built extension or Worker bundle.
