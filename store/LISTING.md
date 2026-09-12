# Chrome Web Store listing draft

## Product name

TogetherTune for YouTube Music™

## Summary

Start a YouTube Music™ listening party, share a short code, and keep every browser on the same track. No account required.

## Category

Entertainment

## Single purpose

TogetherTune creates temporary YouTube Music listening rooms with synchronized playback, a shared queue, and host-controlled guest permissions.

## Detailed description

Pass the aux without passing a thing.

TogetherTune turns YouTube Music into a shared listening room. Create a party, send the short room code, and listen from separate browsers without making an account.

HEAR THE SAME MOMENT

The current track, play or pause state, and playback position stay synchronized across the room.

BUILD THE QUEUE TOGETHER

Add songs directly from YouTube Music. Everyone sees one ordered queue, and listeners with permission can rearrange it.

SET THE HOUSE RULES

The host chooses whether guests can add songs, remove songs, or skip. If the host disconnects and does not return, TogetherTune can pass host controls to another connected listener.

JOIN ON YOUR TERMS

New listeners see what is playing before choosing Join playback. Reconnect and rejoin controls help everyone recover when a tab or connection drops.

NO ACCOUNT REQUIRED

TogetherTune does not request your Google account identity, email, password, payment information, or general browsing history.

TogetherTune only runs on `music.youtube.com` and uses its dedicated Cloudflare-hosted service to operate each temporary party. Your chosen display name and the room's playback, queue, role, permission, and synchronization details are shared with the other people in that room. Read the privacy policy for full details.

TogetherTune is an independent project and is not affiliated with, endorsed by, or sponsored by Google LLC.

YouTube and YouTube Music are trademarks of Google LLC. Use of these trademarks is subject to Google Permissions.

## URLs

- Homepage: https://github.com/DylanB03/Youtube-Music-Party-Extension
- Support: https://github.com/DylanB03/Youtube-Music-Party-Extension/issues
- Privacy policy: https://github.com/DylanB03/Youtube-Music-Party-Extension/blob/main/PRIVACY.md

## Permission justifications

- `storage`: keeps temporary party credentials and a prepared invite so users can reconnect after the service worker restarts.
- `contextMenus`: provides an explicit “Add to party queue” fallback on YouTube Music.
- `sidePanel`: hosts the party setup, queue, participant, and synchronization controls.
- `https://music.youtube.com/*`: reads the current track and applies user-requested party playback on YouTube Music only.
- Production backend origin: creates and joins rooms and maintains the secure party WebSocket.

## Reviewer notes

1. Open `https://music.youtube.com/`.
2. Click the TogetherTune toolbar action to open the side panel.
3. Enter a display name and create a party.
4. In a second Chrome profile with the extension installed, open YouTube Music and join with the displayed code.
5. Use a YouTube Music song menu or the context menu to add a track, then test playback and permissions.

No Google sign-in is required by TogetherTune, although YouTube Music itself may vary its available surfaces based on the user's account and region.
