# Getting Started

## Prerequisites

- **Node.js 22** or later
- **npm** (ships with Node.js)
- **Google Chrome** (for loading the extension)
- **Wrangler** (installed automatically as a workspace dependency)

## Install

Clone the repository and install dependencies:

```sh
git clone https://github.com/your-org/youtube-music-party.git
cd youtube-music-party
npm install
```

The project uses npm workspaces. This single `npm install` covers the extension, backend, and shared package.

## Run the Backend

Start the Cloudflare Worker locally with Wrangler:

```sh
npm run dev:backend
```

This starts the API and Durable Object room backend on `http://localhost:8787`.

## Run the Extension

In a separate terminal, start the WXT dev server:

```sh
npm run dev:extension
```

WXT builds the extension to `apps/extension/.output/chrome-mv3/` and watches for changes.

### Load in Chrome

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top right toggle).
3. Click **Load unpacked** and select `apps/extension/.output/chrome-mv3/`.
4. Navigate to [music.youtube.com](https://music.youtube.com).
5. Open the extension's side panel from the toolbar.

The extension hot-reloads during development. If you change manifest-level config in `wxt.config.ts`, you may need to reload the extension manually in `chrome://extensions`.

## Environment Configuration

The extension connects to `http://localhost:8787` by default. Override this with the `WXT_PUBLIC_PARTY_API_BASE_URL` environment variable:

```sh
WXT_PUBLIC_PARTY_API_BASE_URL=https://your-worker.workers.dev npm run dev:extension
```

## Verify Everything Works

Run type checks and unit tests:

```sh
npm run check
npm test
```

Run browser tests (requires Playwright and Chromium):

```sh
npx playwright install chromium
npm run test:browser
```

The browser test suite builds the extension, starts an isolated backend on port `8797`, and runs two-client room flows against it. See the [Testing](testing.md) page for details.

## Create Your First Party

1. Open [music.youtube.com](https://music.youtube.com) and start playing a song.
2. Open the YouTube Music Party side panel.
3. Enter a display name and click **Create party**.
4. Copy the invite link or short code.
5. In a second Chrome profile (or incognito), open the invite link.
6. The guest enters a display name, clicks **Join**, then clicks **Join playback**.
7. Both tabs should now be playing the same song at the same position.

## Project Structure

```
youtube-music-party/
├── apps/
│   ├── extension/         # Chrome MV3 extension (WXT + React)
│   └── backend/           # Cloudflare Worker + Durable Objects
├── packages/
│   └── shared/            # Shared TypeScript protocol and sync helpers
├── tests/
│   └── browser/           # Playwright E2E tests
├── docs/                  # Documentation (this site)
├── package.json           # Root workspace config
├── tsconfig.base.json     # Shared TypeScript settings
└── playwright.config.ts   # Browser test config
```
