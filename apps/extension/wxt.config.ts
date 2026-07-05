import { defineConfig } from "wxt";

declare const process: { env: Record<string, string | undefined> };

// The backend origin is resolved at build time from the same variable the
// runtime client uses, so the manifest only requests the single origin this
// build actually talks to instead of a broad `*.workers.dev` grant.
const apiBaseUrl =
  process.env.WXT_PUBLIC_PARTY_API_BASE_URL ?? "http://localhost:8787";
const apiOrigin = new URL(apiBaseUrl).origin;

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // The side panel is shown only on YouTube Music tabs and hidden elsewhere by
  // toggling per-tab options at runtime (see src/side-panel-gating.ts). A
  // manifest `side_panel.default_path` registers a *global* panel that stays
  // open across tab switches and overrides those per-tab options, so we strip
  // it and drive the panel entirely from the background service worker. The
  // `sidePanel` permission is still requested explicitly below.
  hooks: {
    "build:manifestGenerated"(_wxt, manifest) {
      delete manifest.side_panel;
    },
  },
  manifest: {
    name: "YouTube Music Party",
    description: "Create shared listening parties on YouTube Music.",
    permissions: ["contextMenus", "sidePanel", "storage", "tabs"],
    host_permissions: ["https://music.youtube.com/*", `${apiOrigin}/*`],
    commands: {
      "rejoin-playback": {
        suggested_key: {
          default: "Alt+Shift+R",
        },
        description: "Rejoin the current party playback",
      },
    },
  },
});
