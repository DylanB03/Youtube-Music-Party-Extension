# YouTube Music Selector Validation

Use this checklist while signed into YouTube Music after selector or adapter changes.

1. Open search results and use a song's three-dot menu.
2. Open an album and use a song-row menu.
3. Open a playlist and use a song-row menu.
4. Open the player queue and use a queued-song menu.
5. Open Home recommendations and use a two-row card menu.
6. Confirm **Add to party queue** identifies the intended title, artist, and video ID.
7. Confirm the action is disabled with an explanation outside a party and for a restricted guest.
8. Confirm a permitted action adds exactly one queue item.
9. During an advertisement, inspect `window.__ytmPartyDiagnostics()` and confirm `playback.interruption` is `advertisement`.
10. For an unavailable track, confirm `playback.interruption` is `unavailable`.

Record the `selectorCoverage` object from diagnostics when a surface fails. The automated fixtures cover representative DOM shapes, but this signed-in pass is required because YouTube Music owns and can change its private DOM.
