# TogetherTune for YouTube Music™

An independent Chrome extension and realtime backend for synchronized listening sessions on YouTube Music.

TogetherTune is not affiliated with, endorsed by, or sponsored by Google LLC. YouTube and YouTube Music are trademarks of Google LLC.

## Privacy and support

- Read the [privacy policy](PRIVACY.md) before creating or joining a party.
- Report bugs through [GitHub Issues](https://github.com/DylanB03/Youtube-Music-Party-Extension/issues).
- Report vulnerabilities according to [SECURITY.md](SECURITY.md).

## Current Implementation

- Shared TypeScript protocol and sync helpers in `packages/shared`.
- WXT extension scaffold in `apps/extension`.
- Cloudflare Worker and Durable Object room backend in `apps/backend`.

## Architecture

[![TogetherTune client/server interaction and workflow](assets/client-server-workflow.svg)](assets/client-server-workflow.drawio)

The preview links to the editable two-page [draw.io source](assets/client-server-workflow.drawio), which shows the extension contexts, Cloudflare backend, room setup and WebSocket synchronization loop. Open it with [diagrams.net](https://app.diagrams.net/) or the draw.io editor integration in your IDE.

## Local Development

Install dependencies first:

```sh
npm install
```

Run the backend:

```sh
npm run dev:backend
```

Run the extension:

```sh
npm run dev:extension
```

Run type checks and automated regression tests:

```sh
npm run check
npm test
```

Pull requests and pushes to `main` run the same checks, production builds, and
Playwright browser suite through `.github/workflows/ci.yml`.

Run the live Chrome extension smoke test:

```sh
npx playwright install chromium
npm run test:browser
```

The browser command builds the extension, starts an isolated local Wrangler backend, runs two-client room flows, validates selector fixtures on the YouTube Music origin, and checks extension loading.
Browser tests use `http://127.0.0.1:8797` so they do not reuse or disturb the normal development backend.

Development defaults to `http://localhost:8787`. Production builds load the public backend URL from `apps/extension/.env.production`. That value is compiled into the extension JavaScript and scopes the generated manifest's `host_permissions` to that backend origin plus `music.youtube.com`.

The backend uses two provisioned KV namespaces: `INVITES` for invite-code mappings and `RATE_LIMITS` for short-lived fixed-window request counters. Their bindings and the Durable Object migration live in `apps/backend/wrangler.jsonc`.

After changing backend bindings or compatibility flags, regenerate the checked-in runtime and binding types with `npm --workspace apps/backend run types`.

## Create a Chrome Web Store archive

Run the verified production packager:

```sh
npm run release:extension
npm run verify:extension
```

To publish against a different backend, either update the non-secret `WXT_PUBLIC_PARTY_API_BASE_URL` in `apps/extension/.env.production`, or override it for one Bash build:

```sh
WXT_PUBLIC_PARTY_API_BASE_URL=https://api.example.com npm run release:extension
```

Chrome Web Store does not receive or inject environment variables. Upload the ZIP produced by the command; the selected URL is already compiled into it. Run `npm run verify:extension` after a normal `.env.production` build. If you use a one-command override, inspect the ZIP manifest because the verifier intentionally compares it with the committed production environment.

WXT writes the uploadable ZIP under `apps/extension/.output`. Before submitting, inspect its generated `manifest.json`, confirm that the backend host is HTTPS, and complete the listing using the drafts in `store/`.

For automatic releases, follow the one-time
[Chrome Web Store CI setup](docs/chrome-web-store-ci.md). After setup, pushing a
version tag builds, verifies, uploads, and submits the extension through Chrome
Web Store API v2; Google publishes it after the normal review passes.
