# Changelog

All notable changes to this project are documented in this file.

## [0.1.10] - 2026-07-29

### Added

- Added a room-authoritative playback preparation barrier: connected,
  synchronized listeners preload and seek the next track, acknowledge readiness,
  and then start from a shared future timestamp, with an eight-second timeout so
  one slow or disconnected listener cannot block the room indefinitely.
- Added low-amplitude playback-rate correction for sub-half-second drift so
  listeners converge without repeated audible hard seeks.

### Changed

- Changed playback application to wait for playable media and completed seeks
  before starting, while preserving the original server timeline through player
  load time.
- Increased clock sampling and local drift-monitor frequency, and made the host
  reconcile to the same room-owned timeline used by guests.
- Isolated host buffering and interruption events from authoritative room
  playback so one listener's player cannot pause everyone else.

## [0.1.3] - 2026-07-10

### Changed

- Bumped the root package, workspace packages, and lockfile package records to
  version 0.1.3.

## [0.1.2] - 2026-07-10

### Changed

- Bumped the root package, workspace packages, and lockfile package records to
  version 0.1.2.
- Improved guest playback recovery so application verification can distinguish
  unavailable tracks from recoverable out-of-sync playback.
- Tightened playback drift handling with a dedicated apply tolerance and
  buffering-aware guest sync decisions.
- Changed YouTube Music track navigation to rely on verified page-player state
  instead of URL updates or direct page-player load commands.

### Added

- Added a host-controlled guest permission for removing queued songs, including
  protocol normalization for older room state.

### Fixed

- Fixed guest queue removal authorization so hosts can separately allow or deny
  guest song deletion.
- Fixed ad and buffering edge cases that could force unnecessary playback
  correction or out-of-sync transitions.
- Fixed stale or misleading track application checks by verifying the actual
  YouTube Music player video before accepting navigation.
- Added regression coverage for guest permissions, playback recovery, drift
  tolerance, protocol validation, room state normalization, and browser room
  flows.

## [0.1.1] - 2026-07-09

### Changed

- Bumped the root package, backend workspace, extension workspace, shared
  workspace, and lockfile package records to version 0.1.1.

## [0.1.0] - 2026-07-09

### Release preparation

- Renamed the public-facing extension to TogetherTune for YouTube Music™ and added independent-project and trademark disclosures.
- Added required manifest icons, a toolbar action, Chrome 116 compatibility, production-safe backend configuration, and reproducible ZIP packaging.
- Removed the unnecessary broad `tabs` permission.
- Added privacy, security, support, licensing, store-listing, permission-justification, and privacy-form documentation.
- Enabled backend logs and traces and refreshed release-tool dependencies.

### Added

- Built a Chrome Manifest V3 extension for YouTube Music with a content script,
  a side panel, and a Cloudflare Worker plus Durable Object backend.
- Added party creation and joining through short codes and shareable invite
  links, including validated landing pages and a YouTube Music invite prompt
  that prepares the join flow without auto-joining.
- Added authoritative realtime rooms with participant identities, persistent
  participant tokens, short-lived single-use connection tickets, hibernatable
  Durable Object WebSockets, automatic reconnect, clock sync, and session
  recovery after service worker restarts.
- Added a designated party tab model so playback commands stay bound to the
  listener's intended YouTube Music tab.
- Added host and guest roles with host-controlled guest skip and queue-add
  permissions.
- Added a shared ordered queue with host removal and drag-and-drop reordering,
  plus Arrow Up and Arrow Down keyboard fallback on the focused drag handle.
- Added shared canonical playback state for track, play or pause, position, and
  backend timestamp, with serialized mutations, operation acknowledgements,
  expected revisions, and duplicate-operation protection.
- Added guest `Join playback` and `Rejoin playback` flows, explicit
  `Navigating`, `Reconnecting`, `Out of sync`, `Track unavailable`, and
  `Ready to resume` states, and automatic correction for medium guest drift.
- Added a native-feeling `Add to party queue` action inside recognized YouTube
  Music menus, an anchored fallback for unsupported private popups, Shadow DOM
  isolation, and a Chrome context-menu fallback.
- Added strict context-song capture and revalidation, including expiry, latest
  right-click tracking, composed-path handling through shadow roots, and
  rejection of missing or ambiguous selections.
- Added host reconnect grace periods, automatic host transfer, multi-connection
  support for a single participant, inactive guest cleanup, absolute room
  expiry, abandoned-room expiry, and invite cleanup.
- Added runtime request and socket hardening through backend rate limits,
  WebSocket message-size and message-rate guards, runtime message validation,
  and configurable limits for participants, queue size, metadata, and display
  names.
- Added a main-world YouTube Music page bridge so canonical track loads use the
  page player API and verify `getVideoData()` before playback is treated as
  applied.
- Added playback and metadata reads from the page player's verified video, title,
  and artist data so stale URLs and generic app labels do not corrupt canonical
  track state.
- Added diagnostics via `window.__ytmPartyDiagnostics()`, unit and orchestration
  tests, browser smoke and flow tests, selector fixtures, a compatibility
  report, and CI coverage for type checks, tests, and production builds.
- Added compact side-panel UX for loading, actionable errors, success notices,
  host-disconnected messaging, a one-click invite-code bar, leave-party
  controls, and side-by-side guest permission toggles.

### Changed

- Replaced the originally planned Zod-based validation approach with
  dependency-free TypeScript runtime validators.
- Changed invite links to open YouTube Music first and require an explicit user
  action before opening the side panel, instead of attempting to navigate
  directly to extension UI.
- Changed side-panel availability to per-tab gating on `music.youtube.com`
  only, and removed the global manifest side-panel path so non-YouTube Music
  tabs close the panel automatically.
- Changed track loading to prefer the YouTube Music page player API first, with
  guarded in-page navigation fallback instead of full-page reload behavior.
- Changed presence updates so sync-status broadcasts do not increment the
  authoritative room revision.
- Changed host external track handling so manual mid-song navigation clears
  shared playback, requeues the canonical track to the front, and exposes a
  `Resume` recovery path rather than promoting the clicked local song to party
  state.
- Changed empty-party behavior so local YouTube Music auto-next is actively
  paused instead of becoming new shared playback by accident.

### Fixed

- Fixed synchronization feedback loops by suppressing remote playback echoes and
  ignoring stale room lifecycle events, snapshots, and errors after room
  replacement.
- Fixed host song-end handling so YouTube Music auto-next is not mistaken for a
  deliberate host track change, using deferred classification, near-end latches,
  max-position tracking, duration thresholds, and natural-advance heuristics.
- Fixed duplicate queue advancement during natural song endings by suppressing
  transient native playback events until the authoritative queued track is
  applied.
- Fixed host resume behavior so the controller stays in `Navigating` until
  read-back confirms the canonical video ID, play state, and drift, rather than
  trusting command completion alone.
- Fixed cases where a page command throws after the correct song already loaded:
  verified player state is now accepted, while wrong-track outcomes surface as
  `Track unavailable`.
- Fixed the temporary empty-playback snapshot created during host requeue so it
  does not overwrite the host's intentionally local playback before `Resume`.
- Fixed canonical end-of-track evidence handling so stale song-end markers are
  cleared before resume and retained independently from transient native-next
  events.
- Fixed direct seeks into the last three seconds of a song so natural-end
  evidence is latched on both `seeking` and `seeked`, without depending on a
  later `timeupdate`.
- Fixed mismatch handling so recurring host progress on a non-canonical song
  advances the authoritative queue instead of leaving the room silently
  divergent.
- Fixed guest mismatch detection so progress on the wrong song immediately marks
  the guest out of sync even if the playback position happens to be similar.
- Fixed queue actions so stale menu selections cannot be reused and permission
  checks wait for the first authoritative room snapshot, including across
  multiple YouTube Music tabs.
- Fixed metadata quality by reading verified player metadata and allowing host
  requeue mutations to repair stale canonical titles for the same authoritative
  video ID.
- Fixed expired-room behavior so saved credentials are cleared instead of
  reconnecting forever.

### Security

- Hardened room access with participant tokens, one-use connection tickets, and
  retained operation acknowledgements for safe reconnect replay.
- Hardened public APIs with approximate fixed-window KV-backed rate limiting and
  bounded request parsing.
- Hardened realtime messaging with runtime client and server validation plus
  bounded acknowledgement waits that request fresh room snapshots on timeout.

### Testing

- Added automated coverage for permissions, queue behavior, revisions, presence,
  host transfer, synchronization, natural-end classification, resume recovery,
  stale revision handling, reconnect recovery, participant limits, and room
  lifecycle expiry.
- Added browser coverage for extension loading on the live YouTube Music origin,
  menu injection, invite preparation, signed-in selector fixtures, interruption
  selectors, and two-client realtime room flows against local Wrangler.
- Added production-oriented verification commands for type checks, unit tests,
  extension builds, backend builds, and Playwright browser regressions.

### Known Gaps

- Track detection covers current page URLs, row links, row video IDs, and
  player-bar metadata, but not every live YouTube Music variant can be
  guaranteed yet.
- Advertisement handling and unavailable-track handling rely on DOM and media
  heuristics that still need broader live validation.
- Large guest drift and guest-initiated playback changes intentionally require
  manual rejoin instead of automatic correction.
- Signed-in manual validation across every current YouTube Music surface and ad
  variant is still pending.
- User accounts, profiles, friends, direct friend invitations, queue voting, and
  guest removal of their own submissions are not implemented yet.
