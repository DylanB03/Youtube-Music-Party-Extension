# Testing

The project has three testing layers: Vitest unit tests, Playwright browser tests, and a manual validation checklist. All automated tests run in CI on every pull request and push to `main`.

## Unit Tests (Vitest)

Unit and integration tests use [Vitest](https://vitest.dev/) and run across all three workspaces.

```sh
npm test
```

### Shared Package

| Test file | Coverage |
|-----------|----------|
| `packages/shared/src/sync.test.ts` | Playback position calculation, clock offset estimation, drift thresholds |

### Extension

| Test file | Coverage |
|-----------|----------|
| `src/party-controller.test.ts` | Controller permissions, mutation serialization, playback reconciliation |
| `src/playback-policy.test.ts` | Guest drift decisions, interruption handling |
| `src/queue-access.test.ts` | Queue-add availability for hosts, guests, and non-party users |
| `src/server-message.test.ts` | Malformed and valid backend message parsing |
| `src/pending-operations.test.ts` | Operation acknowledgement, timeout, and resend behavior |
| `src/pending-invite-storage.test.ts` | Invite code normalization |
| `src/invite-coordinator.test.ts` | Side panel failure doesn't discard an invite |
| `src/youtube-music/invite-link.test.ts` | Invite URL parsing and cleanup |
| `src/youtube-music/party-menu-selection.test.ts` | Stale or replaced menu selection rejection |
| `src/youtube-music/track-selection.test.ts` | One-use capture and expiration behavior |

### Backend

| Test file | Coverage |
|-----------|----------|
| `src/domain/room-state.test.ts` | Permission checks, playback/queue mutations, revision management, presence, host transfer |
| `src/domain/connection-guard.test.ts` | Message size limits and rate window enforcement |
| `src/domain/room-lifecycle.test.ts` | Absolute and idle expiration deadline calculation |
| `src/lib/invite-page.test.ts` | Invite deep links and expired link responses |

### Running Individual Tests

Run tests for a single workspace:

```sh
npm test --workspace apps/extension
npm test --workspace apps/backend
npm test --workspace packages/shared
```

Run a specific test file:

```sh
npx vitest run src/playback-policy.test.ts --workspace apps/extension
```

## Type Checking

TypeScript type checks run across all workspaces:

```sh
npm run check
```

This runs `tsc --noEmit` in each workspace using the shared strict settings from `tsconfig.base.json`.

## Browser Tests (Playwright)

[Playwright](https://playwright.dev/) tests run the built extension in a real Chromium browser against a local backend.

```sh
npx playwright install chromium
npm run test:browser
```

This command:

1. Sets `WXT_PUBLIC_PARTY_API_BASE_URL=http://127.0.0.1:8797`
2. Builds the production extension via `wxt build`
3. Starts an isolated Wrangler backend on port `8797` (using `wrangler.e2e.toml`)
4. Runs the Playwright test suite
5. Captures traces on failure for debugging

### Test Specs

| Spec | What it tests |
|------|---------------|
| `extension-smoke.spec.ts` | Loads the built extension on live YouTube Music, verifies content script diagnostics, exercises three-dot menu selection and Shadow DOM action injection |
| `party-room-flow.spec.ts` | Two WebSocket clients against local Durable Objects: queue operations, permissions, playback, stale revision rejection, reconnect recovery, host transfer, participant limits, lifecycle expiry |
| `invite-link-flow.spec.ts` | Backend landing page rendering, YouTube Music prompt display, prepared invite code storage, side panel prefill, and absence of automatic joining |
| `selector-fixtures.spec.ts` | Validates recorded DOM fixtures for search, album, playlist, queue, and recommendation surfaces on the YouTube Music origin |

### Test Infrastructure

**`tests/browser/support/party-test-client.ts`** — a standalone HTTP and WebSocket client that can create rooms, join as participants, exchange messages, and wait for specific server responses. Used by `party-room-flow.spec.ts` to run two-client scenarios without loading the full extension.

**`tests/browser/fixtures/youtube-music-surfaces.ts`** — recorded DOM structures representing YouTube Music page surfaces. Used by selector fixture tests to validate that selectors match expected elements.

**`apps/backend/wrangler.e2e.toml`** — separate Wrangler config with:

- Port `8797` to avoid conflicts with the dev server
- Isolated KV namespace (`e2e-kv`)
- Short lifecycle TTLs for fast test teardown
- Low participant and queue limits

### Playwright Configuration

`playwright.config.ts` at the repository root:

- Test directory: `tests/browser`
- Auto-starts `dev:backend:e2e` and waits for port `8797`
- 45-second timeout per test
- Trace capture on failure

## CI Pipeline

`.github/workflows/ci.yml` runs on pull requests and pushes to `main` with two parallel jobs:

### `verify` Job

```
npm ci → npm run check → npm test → build:extension → build:backend (dry-run)
```

Validates types, runs all unit tests, and confirms both the extension and backend build successfully. The backend build uses `wrangler deploy --dry-run` to validate the bundle without deploying.

### `browser` Job

```
npm ci → install Chromium → npm run test:browser
```

Runs the full Playwright suite including extension loading, YouTube Music origin tests, and two-client room flows.

Both jobs run on Ubuntu with Node.js 22. Concurrency groups cancel in-progress runs for the same branch.

## Manual Validation

Some aspects of YouTube Music integration cannot be tested automatically because they require a signed-in YouTube Music session with an active subscription.

The checklist at `docs/youtube-music-selector-validation.md` covers:

1. Three-dot menu injection across all page surfaces (search, albums, playlists, queue, recommendations)
2. Correct song identification (title, artist, video ID)
3. Anchored fallback when direct injection fails
4. Permission-aware disabled states
5. Advertisement detection via `window.__ytmPartyDiagnostics()`
6. Unavailable track detection

This manual pass should be performed after any selector or adapter changes, and the results recorded in `docs/youtube-music-compatibility-report.md`.
