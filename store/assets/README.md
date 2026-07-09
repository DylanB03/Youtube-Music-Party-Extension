# Store artwork

The PNG files in this directory are temporary submission placeholders and must be reviewed or replaced before a polished public launch.

Required targets:

- `icon-128.png`: 128×128 store icon with approximately 16 px transparent padding.
- `small-promo-440x280.png`: required small promotional tile.
- `screenshot-1280x800.png`: setup flow using the real extension UI.
- `screenshot-host-controls-1280x800.png`: host controls and shared queue.
- `screenshot-guest-1280x800.png`: guest view after joining a party.

Regenerate all three screenshots against the configured production backend with:

```sh
npm run build:extension
npm run capture:store-screenshots
```

Do not use Google, YouTube, or Chrome logos in replacement artwork.
