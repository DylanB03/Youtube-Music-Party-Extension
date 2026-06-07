import { defineBackground } from "wxt/utils/define-background";
import type { ExtensionRequest } from "@ytm-party/shared";
import { browser } from "../src/browser";
import { error, ok } from "../src/extension-messaging";
import { PartyApi } from "../src/party-api";
import { PartyClient } from "../src/party-client";
import { PartyController } from "../src/party-controller";
import { SessionStorage } from "../src/session-storage";
import { YouTubeMusicTabGateway } from "../src/tab-gateway";

const partyApi = new PartyApi();

const controller = new PartyController(
  partyApi,
  new SessionStorage(),
  new YouTubeMusicTabGateway(),
  (credentials) =>
    new PartyClient(
      credentials.roomId,
      async () => {
        const response = await partyApi.createConnectionTicket(
          credentials.roomId,
          credentials.participantId,
          credentials.participantToken,
          credentials.displayName,
        );
        return response.ticket;
      },
    ),
  (state) => {
    void browser.runtime
      .sendMessage({
        type: "party.stateChanged",
        state,
      })
      .catch(() => undefined);
  },
);

export default defineBackground(() => {
  void initializeBackground();

  browser.runtime.onMessage.addListener((message: ExtensionRequest, _sender, sendResponse) => {
    void handleMessage(message)
      .then((data) => sendResponse(ok(data)))
      .catch((caught: Error) => sendResponse(error(caught.message)));
    return true;
  });

  browser.commands.onCommand.addListener((command) => {
    if (command === "rejoin-playback") void controller.joinPlayback();
  });
});

async function initializeBackground(): Promise<void> {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({
    id: "add-to-party-queue",
    title: "Add to party queue",
    contexts: ["link", "page", "selection"],
    documentUrlPatterns: ["https://music.youtube.com/*"],
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "add-to-party-queue") {
      void controller.addContextSong(tab?.id).catch(() => undefined);
    }
  });

  await browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await controller.initialize();
}

async function handleMessage(message: ExtensionRequest): Promise<unknown> {
  switch (message.type) {
    case "party.create":
      return controller.createParty(message.displayName);

    case "party.join":
      return controller.joinParty(message.inviteCode, message.displayName);

    case "party.leave":
      return controller.leaveParty();

    case "party.getState":
      return controller.getView();

    case "party.joinPlayback":
    case "party.rejoinPlayback":
      return controller.joinPlayback();

    case "party.updatePermissions":
      return controller.updatePermissions(message.permissions);

    case "party.queueAdd":
      return controller.addTrack(message.track);

    case "party.queueRemove":
      return controller.removeQueueItem(message.queueItemId);

    case "party.queueReorder":
      return controller.reorderQueue(message.queueItemIds);

    case "party.skip":
      return controller.skip();

    case "content.localPlaybackEvent":
      await controller.handleLocalPlaybackEvent(message.event);
      return null;

    case "content.ready":
      await controller.handleContentReady();
      return null;

    default:
      return null;
  }
}
