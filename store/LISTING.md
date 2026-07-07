# Chrome Web Store listing draft

## Product name

TogetherTune for YouTube Music™

## Summary

Create synchronized listening parties with a shared queue on YouTube Music™.

## Category

Fun

## Single purpose

TogetherTune lets people who intentionally join the same temporary room synchronize YouTube Music playback and manage one shared party queue.

## Detailed description

Listen together without passing the aux cord around.

TogetherTune adds temporary listening parties to YouTube Music. Create a party, share its short invite code, and let friends join from their own browsers. The host controls synchronized playback while the group can share a queue. Hosts can decide whether guests may add songs or skip.

Features include:

- synchronized track, play/pause, and playback position;
- a shared ordered queue;
- short invite codes and links;
- host-controlled guest permissions;
- reconnect and manual rejoin controls; and
- controls integrated into YouTube Music menus and a focused Chrome side panel.

TogetherTune only runs on `music.youtube.com` and communicates with its dedicated Cloudflare-hosted synchronization service. Creating or joining a party shares the display name you choose and party playback/queue information with other people in that party. Read the full privacy policy before installing.

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
