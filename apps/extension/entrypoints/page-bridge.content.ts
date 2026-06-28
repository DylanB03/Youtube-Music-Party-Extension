import { defineContentScript } from "wxt/utils/define-content-script";
import { installPageBridgeListener } from "../src/youtube-music/page-bridge";

export default defineContentScript({
  matches: ["https://music.youtube.com/*"],
  world: "MAIN",
  runAt: "document_start",
  main() {
    installPageBridgeListener();
  },
});
