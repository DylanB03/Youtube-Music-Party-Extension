# Store artwork

The PNG files in this directory form the TogetherTune Chrome Web Store artwork set. The visual system uses a warm, nocturnal palette and a two-listener pulse emblem. It is intentionally distinct from speech-bubble and music-note branding used by other listening-party extensions.

Submission assets:

- `icon-source-v3.svg`: exact flat-vector source for the brand mark.
- `icon-128.png`: 128×128 store icon with transparent padding.
- `small-promo-440x280.png`: 440×280 promotional tile.
- `screenshot-1280x800.png`: create-party flow.
- `screenshot-guest-1280x800.png`: invite-code and guest flow.
- `screenshot-queue-1280x800.png`: shared queue.
- `screenshot-sync-1280x800.png`: synchronized playback.
- `screenshot-host-controls-1280x800.png`: host permissions.

Regenerate the icon set, screenshots, and promotional tile with:

```sh
npm run build:store-icon
npm run build:extension
npm run capture:store-screenshots
```

The capture script uses fictional song names and original geometric cover art so the screenshots do not depend on third-party album artwork. Do not add Google, YouTube, Chrome, or competitor logos to the artwork.
