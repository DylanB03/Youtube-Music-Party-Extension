# TogetherTune Privacy Policy

Last updated: July 6, 2026

TogetherTune for YouTube Music™ ("TogetherTune") synchronizes YouTube Music playback between people who intentionally join the same temporary listening party. This policy explains what the extension and its supporting service handle.

## Data TogetherTune handles

When you create or join a party, TogetherTune handles:

- the display name you enter;
- the YouTube Music video ID, song title, artist, playback state, playback position, queue entries, and synchronization status needed to operate the party;
- party role and permission settings;
- generated room, participant, invite, operation, and short-lived connection identifiers;
- a randomly generated participant token stored in Chrome local storage so the extension can reconnect to your party; and
- your network address for short-lived abuse-prevention rate limits. Cloudflare also processes normal request metadata when it delivers the service.

TogetherTune does not request your Google account identity, password, email, payment information, contacts, general browser history, or activity on websites other than `music.youtube.com`. It does not sell data, use data for advertising, or use analytics or advertising SDKs.

## How data is used and shared

Party data is used only to create rooms, authenticate participants, synchronize playback, manage the shared queue, enforce party permissions, prevent abuse, and diagnose service failures. Display names, playback details, the queue, roles, permissions, and synchronization status are shared with other people who possess the same party invite.

The backend runs on Cloudflare Workers, Durable Objects, and KV. Cloudflare processes data as the infrastructure service provider needed to deliver TogetherTune. See [Cloudflare's Privacy Policy](https://www.cloudflare.com/privacypolicy/).

We do not transfer user data for advertising, credit decisions, data brokerage, or unrelated purposes. Human access is limited to cases where a user requests support, access is necessary to investigate abuse or a security incident, access is required by law, or data has been aggregated and anonymized for internal operations.

## Storage and retention

- Active party room data and participant tokens are deleted no later than 24 hours after room creation. An abandoned room normally expires after one hour of inactivity.
- Invite mappings expire within 24 hours and are deleted when the corresponding room expires.
- Application rate-limit records derived from network addresses expire after approximately two minutes.
- Reconnection credentials and pending invite codes remain in Chrome local storage until you leave, the extension detects expiration and clears them, you clear extension data, or you uninstall the extension.
- Cloudflare may retain operational request logs according to the Cloudflare account configuration and its applicable policies.

Data is encrypted in transit using HTTPS and secure WebSockets for the production service. No internet service can guarantee absolute security.

## Your choices

Joining a party is optional. You can use a nickname rather than a real name. Leaving a party clears its reconnection credentials from the extension. You can also remove all locally stored extension data through Chrome or uninstall the extension.

To ask a privacy question or request deletion of an active room's data, open a private or public support request through the project's [GitHub issue tracker](https://github.com/DylanB03/Youtube-Music-Party-Extension/issues). Do not include participant tokens or other credentials in a public issue.

## Chrome Web Store Limited Use disclosure

TogetherTune's use and transfer of information obtained through Chrome and YouTube Music is limited to providing and improving its prominently described, user-facing listening-party functionality. TogetherTune complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

YouTube and YouTube Music are trademarks of Google LLC. TogetherTune is an independent project and is not affiliated with, endorsed by, or sponsored by Google LLC.
