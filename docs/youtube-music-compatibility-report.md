# YouTube Music Compatibility Report

## Validation Date

June 13, 2026

## Automated Results

The production Manifest V3 extension was loaded in Chromium 148 on the live
`https://music.youtube.com` origin. The following checks passed:

- Content-script startup and diagnostics messaging.
- Search-result song extraction.
- Album-row song extraction.
- Playlist-row song extraction.
- Player-queue song extraction.
- Recommendation-card song extraction.
- Modern action-menu song extraction.
- Shadow DOM party-menu insertion without `innerHTML`.
- Anchored queue-action fallback when no recognized popup is available.
- Disabled queue-action explanation outside a party.
- Advertisement selector detection using a representative page state.
- Unavailable-track selector detection using a representative error renderer.
- Invite preparation, side-panel prefill, explicit joining boundary, and invite dismissal.

These checks use representative signed-in DOM fixtures injected onto the live
origin. They verify selector contracts and extension isolation without claiming
that YouTube Music's private DOM will remain stable.

## Manual Validation Still Required

This environment does not contain an authenticated YouTube Music profile and
cannot force Google to serve a natural advertisement or region-restricted
track. Before publishing a release, complete
`docs/youtube-music-selector-validation.md` in a signed-in Chrome profile and
record any failing `selectorCoverage` diagnostics.
