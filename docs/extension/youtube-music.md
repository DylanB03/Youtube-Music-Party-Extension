# YouTube Music Integration

The extension interacts with YouTube Music's web app to observe playback, apply remote commands, and inject UI for queue management. This is the most fragile part of the extension because YouTube Music owns its DOM and can change it at any time.

## DOM Selectors and Adapters

### Selector Layer

`src/youtube-music/selectors.ts` contains all DOM queries used to extract information from YouTube Music pages:

- **Track metadata** — video ID, title, artist, thumbnail URL, and duration from the player bar and song rows
- **Playback state** — current position, duration, paused state from the progress bar and video element
- **Song rows** — identifies clickable song elements in search results, albums, playlists, queues, and recommendations
- **Advertisements** — detects when an ad is playing via DOM markers
- **Unavailable tracks** — detects error states and unplayable content

### Adapter

`src/youtube-music-adapter.ts` wraps the selector layer and provides the interface the rest of the extension uses:

- `getCurrentTrack()` — read the currently playing track
- `getPlaybackState()` — read position, duration, paused, buffering, and interruption state
- `loadTrack(track, startSeconds)` — load a song and seek to a position
- `play()` / `pause()` / `seek(seconds)` — control the local player
- `observe(listener)` — subscribe to local playback events (play, pause, seek, ended, track change, buffering, progress, interruption)
- `getContextSong(target)` — identify which song was targeted by a menu interaction

## Playback Observation

The content script polls YouTube Music's DOM to detect playback changes. It emits typed `LocalPlaybackEvent` messages to the service worker:

| Event | Trigger |
|-------|---------|
| `local.play` | User or extension plays the player |
| `local.pause` | User or extension pauses the player |
| `local.seek` | Playback position jumps |
| `local.ended` | Current track finishes |
| `local.track_changed` | A different track starts playing |
| `local.buffering` | Player enters buffering state |
| `local.progress` | Periodic position update |
| `local.interruption` | Advertisement or unavailable track detected |

### Remote Event Suppression

When the extension applies a playback command (e.g., loading a track or seeking in response to a backend update), the resulting DOM changes would normally trigger local events. The adapter suppresses these "echo" events to prevent feedback loops — a remote seek should not be reported back as a local seek.

### Host Track Endings

When the host's track ends naturally, YouTube Music may attempt to auto-play the next song from its own recommendation queue. The extension suppresses this auto-next behavior until the party's queue snapshot applies, preventing YouTube Music's recommendations from becoming party state.

## Playback Commands

### Track Loading

`src/youtube-music/navigation.ts` loads tracks using two strategies:

1. **Page bridge** (preferred) — calls `playerApi.loadVideoById` through the main-world bridge for instant, in-page track loading
2. **SPA navigation** (fallback) — navigates YouTube Music's single-page app to `music.youtube.com/watch?v={videoId}` without a full page reload

The page bridge is preferred because it loads the track without disrupting the YouTube Music session or content script context. SPA navigation is used when the bridge reports the track as unavailable.

### Play, Pause, and Seek

The content script directly manipulates YouTube Music's video element for play/pause and the progress bar for seeking. These operations are synchronous within the content script's DOM access.

## Menu Injection

### Song Menu Action

`src/youtube-music/party-menu.ts` observes YouTube Music's popup menus and injects an "Add to party queue" action:

1. **Popup observation** — watches for YouTube Music's song menus to appear (three-dot menus, right-click menus)
2. **Song identification** — `src/youtube-music/track-selection.ts` captures which song the menu belongs to using composed-path traversal through YouTube Music's shadow roots
3. **Action injection** — inserts a styled button into the popup using Shadow DOM isolation
4. **Permission gating** — the action reflects the user's current permissions:
    - Enabled for the host
    - Enabled for guests when `guestsCanAddToQueue` is true
    - Disabled with explanation when the user is not in a party or lacks permission

### Anchored Fallback

When YouTube Music uses an unrecognized private popup implementation that prevents direct injection, the extension renders an anchored action button next to the menu control instead.

### Chrome Context Menu Fallback

`src/party-context-menu.ts` registers a "Add to party queue" item in Chrome's right-click context menu as a last-resort fallback. It uses the exact song captured by the content script at the time of the right-click and respects the same permission rules.

### Selection Lifecycle

Song selections have a strict lifecycle to prevent stale songs from being queued:

1. **Capture** — the content script identifies the song when a menu opens or right-click occurs
2. **Expiry** — selections expire after 2 minutes
3. **Revalidation** — at click time, the selection is revalidated against the current DOM
4. **Consumption** — once used, the selection is cleared so it cannot be accidentally reused

## Invite Flow

### Invite Link Handling

When a user opens an invite link (`/join/{code}`), the backend serves a landing page that redirects to YouTube Music with the invite code as a URL parameter.

### On-Page Invite Prompt

`src/youtube-music/invite-prompt.ts` detects the invite parameter in the YouTube Music URL and displays an isolated confirmation prompt:

- Rendered in Shadow DOM to avoid style conflicts
- Shows the invite code and an **Open party panel** button
- Clicking the button stores the invite code locally (30-minute TTL) and opens the side panel
- The side panel prefills the code — the user still needs to enter a name and explicitly click **Join**
- **No playback is changed** until the user explicitly joins and clicks **Join playback**

If the user is already in a party, the prompt explains that they need to leave their current party first.

## Fragility and Compatibility

YouTube Music does not provide a public API or stable DOM contract. The extension relies on DOM structure, CSS classes, and element attributes that YouTube Music can change without notice.

### Mitigation Strategies

- **Selector fixtures** — automated Playwright tests validate known DOM shapes for search, album, playlist, queue, and recommendation surfaces
- **Compatibility report** — `docs/youtube-music-compatibility-report.md` records dated evidence of automated and manual checks
- **Multiple fallbacks** — menu injection has three tiers (direct injection → anchored fallback → Chrome context menu)
- **Graceful degradation** — if a selector fails, the extension logs the failure and continues operating; it never crashes YouTube Music

### Manual Validation Checklist

`docs/youtube-music-selector-validation.md` provides a signed-in checklist for verifying selectors after changes:

1. Test three-dot menus across search results, albums, playlists, queue, and recommendations
2. Verify song identification (title, artist, video ID)
3. Confirm the anchored fallback appears when direct injection fails
4. Test permission states (not in a party, restricted guest)
5. Verify advertisement and unavailable track detection via `window.__ytmPartyDiagnostics()`

This manual pass is required because YouTube Music's private DOM can vary between authenticated and unauthenticated sessions, and automated tests cannot sign in to a real account.

## Diagnostics

The content script exposes `window.__ytmPartyDiagnostics()` on YouTube Music pages. This returns:

- Current track metadata and playback state
- Active interruption type (advertisement, unavailable)
- Selector coverage — which DOM selectors matched on the current page
- Party connection status

Use this for debugging selector issues, verifying ad detection, or checking extension health on live YouTube Music pages.
