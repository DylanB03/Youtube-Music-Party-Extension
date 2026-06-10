import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "YouTube Music Party",
    description: "Create shared listening parties on YouTube Music.",
    permissions: ["contextMenus", "sidePanel", "storage", "tabs"],
    host_permissions: [
      "https://music.youtube.com/*",
      "http://localhost:8787/*",
      "https://*.workers.dev/*",
    ],
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
