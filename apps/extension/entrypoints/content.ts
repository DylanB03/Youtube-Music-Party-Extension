import { defineContentScript } from "wxt/utils/define-content-script";
import type { ExtensionRequest } from "@ytm-party/shared";
import { browser } from "../src/browser";
import {
  applyPlayback,
  getAdapterDiagnostics,
  getPlaybackState,
  installContextSongCapture,
  observePlayback,
  takeLastContextTrack,
} from "../src/youtube-music-adapter";

export default defineContentScript({
  matches: ["https://music.youtube.com/*"],
  main() {
    installContextSongCapture();
    Object.assign(window, {
      __ytmPartyDiagnostics: getAdapterDiagnostics,
    });
    observePlayback((event) => {
      void browser.runtime.sendMessage({
        type: "content.localPlaybackEvent",
        event,
      } satisfies ExtensionRequest);
    });

    browser.runtime.onMessage.addListener((message: ExtensionRequest, _sender, sendResponse) => {
      void handleMessage(message)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
      return true;
    });

    void browser.runtime.sendMessage({
      type: "content.ready",
    } satisfies ExtensionRequest);
  },
});

async function handleMessage(message: ExtensionRequest): Promise<unknown> {
  switch (message.type) {
    case "content.getPlayback":
      return getPlaybackState();

    case "content.applyPlayback":
      return applyPlayback(message.playback);

    case "content.getContextSong":
      return takeLastContextTrack();

    case "content.getDiagnostics":
      return getAdapterDiagnostics();

    default:
      return null;
  }
}
