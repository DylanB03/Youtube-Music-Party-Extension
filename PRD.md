# YouTube Music Party Extension

## Product Summary

The extension lets people listen together while each participant uses their own YouTube Music browser tab. A host creates a party, shares a link or short code, and manages a shared playback session and queue. Participants hear the same song at approximately the same time without audio being streamed between users.

## Goals

- Make it quick to create or join a listening party from YouTube Music.
- Keep participants synchronized to the party's current song and playback position.
- Let the host decide how much control guests have over playback and the queue.
- Add party actions directly to familiar YouTube Music interactions.
- Recover gracefully when a participant pauses locally, encounters an ad, or otherwise falls out of sync.

## Core Experience

### Open The Party Panel

The user opens the extension's party side panel while browsing YouTube Music. The panel shows the current party, participants, playback sync status, session controls, invite options, and shared queue.

### Create A Party

The user selects **Create party** in the side panel. They become the host and receive:

- A shareable party link.
- A short join code.
- Host controls for guest permissions.

### Join A Party

A guest joins by opening a party link or entering a short code in the side panel. The panel shows the party's current song and a **Join playback** button.

Selecting **Join playback** changes the guest's YouTube Music tab to the party's current song and seeks to the current shared playback position. Joining never changes playback until the guest explicitly selects this button.

### Listen In Sync

The party has one shared current song, playback position, playback state, and ordered queue. Queue items play automatically in order when the current song ends or the party skips forward.

The host's play and pause actions update playback for the entire party. The host can always seek within the current song, skip to the next queued song, add songs, remove songs, and reorder the queue.

### Manage Guest Permissions

The host changes guest permissions using toggles in the side panel:

- **Allow guests to skip:** guests can advance the party to the next queued song.
- **Allow guests to add songs:** guests can add songs to the shared queue.

Only the host can play, pause, or seek within the current song for the party. Guest fast-forward and rewind actions are local only and do not update the shared session. Guests can always control their own volume because volume is local and does not affect synchronization.

### Add Songs To The Queue

The extension adds an **Add to party queue** action to the existing menu that appears when a user right-clicks a song or selects its three-dot menu in YouTube Music.

If the user is the host, the selected song is appended to the shared queue. If the user is a guest, the action is available only when the host has enabled **Allow guests to add songs**.

The side panel displays the ordered queue. The host can remove items and reorder songs from this list. Guests can view the queue.

### Recover From Desynchronization

If a guest pauses, resumes, fast-forwards, or rewinds locally, their action affects only their own tab. The panel marks them as **Out of sync** and shows a **Rejoin playback** button.

Selecting **Rejoin playback** returns the guest to the party's current song, playback state, and position.

The same recovery flow applies when a participant encounters an ad, buffering issue, unavailable song, or other local interruption. The extension does not attempt to bypass ads or playback restrictions.

### Handle Host Departure

If the host disconnects, the party remains available briefly so they can return. If they do not return, host status transfers to the longest-connected guest. The new host gains access to the host controls and permission toggles.

## User-Facing States

The side panel clearly communicates:

- **Not in a party:** create or join a party.
- **Ready to join playback:** the user joined the room but has not started synchronized listening.
- **In sync:** the user's tab is following party playback.
- **Out of sync:** the user's local playback differs from the party; rejoin playback is available.
- **Host disconnected:** the party is waiting briefly for the host or transferring host status.
- **Track unavailable:** the current song cannot be played for this participant; rejoin is available when playback can resume.

## MVP Scope

- Create and join parties using links and short codes.
- Synchronize current song, position, host play, host pause, host seek, and permitted skip actions.
- Automatically play the shared queue in order.
- Expose host-managed guest permission toggles.
- Add songs from the existing YouTube Music song menu.
- View, remove, and reorder queue items from the side panel.
- Show participants and local sync state.
- Rejoin playback after local interruptions.
- Transfer host status after a brief reconnection window.

## Future Scope

- User accounts and persistent profiles.
- Friend lists and direct party invitations.
- Single-use or expiring invite links.
- Queue voting and collaborative moderation options.
- Additional queue actions for guests, such as removing their own submissions.

## Non-Goals

- Streaming or relaying audio between participants.
- Bypassing advertisements, subscription restrictions, regional restrictions, or unavailable tracks.
- Synchronizing each participant's local volume.
- Replacing or modifying YouTube Music's native queue.
