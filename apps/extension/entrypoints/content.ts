import { defineContentScript } from "wxt/utils/define-content-script";
import type { ExtensionRequest } from "@ytm-party/shared";
import { browser } from "../src/browser";
import {
  applyPlayback,
  getAdapterDiagnostics,
  getPlaybackState,
  observePlayback,
} from "../src/youtube-music-adapter";
import { installPartyMenuIntegration } from "../src/youtube-music/party-menu";
import {
  installTrackSelectionCapture,
  TrackSelectionStore,
} from "../src/youtube-music/track-selection";
import {
  readInviteCodeFromLocation,
  removeInviteCodeFromLocation,
} from "../src/youtube-music/invite-link";
import { installInvitePrompt } from "../src/youtube-music/invite-prompt";

const trackSelection = new TrackSelectionStore();

export default defineContentScript({
  matches: ["https://music.youtube.com/*"],
  main() {
    installTrackSelectionCapture(trackSelection);
    installPartyMenuIntegration(trackSelection);
    const inviteCode = readInviteCodeFromLocation(location.href);
    if (inviteCode) {
      installInvitePrompt({
        inviteCode,
        prepareInvite: () =>
          browser.runtime.sendMessage({
            type: "party.prepareInvite",
            inviteCode,
          } satisfies ExtensionRequest),
        onComplete: () => {
          history.replaceState(
            history.state,
            "",
            removeInviteCodeFromLocation(location.href),
          );
        },
      });
    }
    Object.assign(window, {
      __ytmPartyDiagnostics: () => getAdapterDiagnostics(trackSelection.peek()),
    });
    observePlayback((event) => {
      void browser.runtime.sendMessage({
        type: "content.localPlaybackEvent",
        event,
      } satisfies ExtensionRequest);
    });

    browser.runtime.onMessage.addListener((message: ExtensionRequest, _sender, sendResponse) => {
      if (!isContentCommand(message)) return false;
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

type ContentCommand = Extract<
  ExtensionRequest,
  {
    type:
      | "content.getPlayback"
      | "content.applyPlayback"
      | "content.getContextSong"
      | "content.getDiagnostics";
  }
>;

function isContentCommand(message: ExtensionRequest): message is ContentCommand {
  return (
    message.type === "content.getPlayback" ||
    message.type === "content.applyPlayback" ||
    message.type === "content.getContextSong" ||
    message.type === "content.getDiagnostics"
  );
}

async function handleMessage(message: ContentCommand): Promise<unknown> {
  switch (message.type) {
    case "content.getPlayback":
      return getPlaybackState();

    case "content.applyPlayback":
      return applyPlayback(message.playback);

    case "content.getContextSong":
      return trackSelection.take();

    case "content.getDiagnostics":
      return getAdapterDiagnostics(trackSelection.peek());
  }
}
