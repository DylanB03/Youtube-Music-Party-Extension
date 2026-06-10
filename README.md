# YouTube Music Party

A Chrome extension and realtime backend for shared listening sessions on the YouTube Music web app.

## Current Implementation

- Shared TypeScript protocol and sync helpers in `packages/shared`.
- WXT extension scaffold in `apps/extension`.
- Cloudflare Worker and Durable Object room backend in `apps/backend`.
- Product docs in `PRD.md` and `layout.md`.

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

Run the live Chrome extension smoke test:

```sh
npx playwright install chromium
npm run test:browser
```

The browser command builds the extension, starts an isolated local Wrangler backend, runs two-client room flows, validates selector fixtures on the YouTube Music origin, and checks extension loading.

The extension defaults to `http://localhost:8787` for the backend. Override with `WXT_PUBLIC_PARTY_API_BASE_URL` if needed.
