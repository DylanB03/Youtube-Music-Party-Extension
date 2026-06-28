# Side Panel UI

The side panel is the extension's only UI surface. It is a React application rendered in Chrome's side panel API and provides all party management controls.

## Components

### `main.tsx`

The root component. Manages the overall panel state and renders the appropriate view based on the user's party status:

- **Not in a party** — shows the setup card (create or join)
- **In a party** — shows invite info, sync status, participant list, queue, and host controls

Communicates with the service worker through `ExtensionRequest` messages and receives state updates.

### `party-setup-card.tsx`

Handles party creation and joining:

- Display name input
- **Create party** button — sends `party.create` to the service worker
- **Join by code** — short code input field, sends `party.join`
- Prefills the invite code when a pending invite exists (from an invite link flow)
- Shows an explanation when the user is already in a different party and has a pending invite

### `queue-card.tsx`

Renders the shared queue and provides management controls:

- Ordered list of queued songs with title, artist, and who added them
- **Skip** button (visible to host, or guests when `guestsCanSkip` is enabled)
- **Remove** button per item (host only)
- **Reorder** controls (host only) — move items up/down in the queue
- Empty state when no songs are queued

### `permission-toggle.tsx`

Reusable toggle component for host permission controls:

- **Allow guests to skip** — toggles `guestsCanSkip`
- **Allow guests to add songs** — toggles `guestsCanAddToQueue`

Only rendered for the host. Sends `party.updatePermissions` on toggle.

## Hooks

### `use-party-session.ts`

The primary hook for side panel state management:

- Sends requests to the service worker and tracks pending/loading state
- Handles error display and auto-clearing
- Manages success notices (e.g., "Party created", "Song added to queue")
- Polls for state updates via `party.getState`

### `use-pending-invite.ts`

Manages prepared invite state:

- Loads any pending invite code from storage on mount
- Tracks invite expiry (30-minute TTL)
- Clears the invite after the user joins or dismisses it
- Handles the case where the user is already in a party when an invite arrives

## User States

The side panel communicates the user's current status with distinct visual states:

| Status | Meaning | Available Actions |
|--------|---------|-------------------|
| **Not in a party** | No active session | Create party, join by code |
| **Ready to join** | Joined the room but not listening yet | Join playback |
| **Navigating** | Loading the party's current track | Wait |
| **In sync** | Playback matches the party | All party actions |
| **Out of sync** | Local playback differs from the party | Rejoin playback |
| **Track unavailable** | Current song can't be played locally | Rejoin when playback resumes |
| **Reconnecting** | WebSocket reconnecting to the backend | Wait |
| **Host disconnected** | Waiting for host to return or transfer | Wait |

## User Flows

### Create a Party

1. User enters a display name.
2. User clicks **Create party**.
3. The service worker captures current playback from the content script.
4. The backend creates the room and returns invite info.
5. The panel switches to the party view showing the invite link/code, participant list, and host controls.

### Join a Party

1. User enters a display name and invite code (or the code is prefilled from an invite link).
2. User clicks **Join**.
3. The backend validates the code and issues guest credentials.
4. The panel shows the party's current song and a **Join playback** button.
5. User clicks **Join playback** — the content script loads the track and syncs position.

### Rejoin Playback

When the user falls out of sync (local pause, ad, drift), the panel shows **Out of sync** with a **Rejoin playback** button. Clicking it reapplies the latest room snapshot — loading the correct track, seeking to the current position, and matching the play state.

The keyboard shortcut `Alt+Shift+R` also triggers rejoin from any context.

### Manage the Queue

- **Add songs** from YouTube Music's song menus (see [YouTube Music Integration](youtube-music.md)).
- **Skip** the current song to advance to the next queued item.
- **Remove** a queued song (host only).
- **Reorder** the queue by moving items up or down (host only).

### Leave a Party

The user clicks **Leave party** to disconnect. Stored credentials are cleared and the panel returns to the setup view.
