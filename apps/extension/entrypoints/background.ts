import { defineBackground } from "wxt/utils/define-background";
import type { ExtensionRequest } from "@ytm-party/shared";
import { browser } from "../src/browser";
import { error, ok } from "../src/extension-messaging";
import { preparePendingInvite } from "../src/invite-coordinator";
import { PartyApi } from "../src/party-api";
import { PartyClient } from "../src/party-client";
import {
  registerPartyContextMenu,
  updatePartyContextMenu,
} from "../src/party-context-menu";
import { PartyController } from "../src/party-controller";
import { PendingInviteStorage } from "../src/pending-invite-storage";
import { SessionStorage } from "../src/session-storage";
import { installSidePanelGating } from "../src/side-panel-gating";
import { YouTubeMusicTabGateway } from "../src/tab-gateway";

const partyApi = new PartyApi();
const pendingInvites = new PendingInviteStorage();

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
    void updatePartyContextMenu(state);
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

  browser.runtime.onMessage.addListener((message: ExtensionRequest, sender, sendResponse) => {
    void handleMessage(message, sender)
      .then((data) => sendResponse(ok(data)))
      .catch((caught: Error) => sendResponse(error(caught.message)));
    return true;
  });

  browser.commands.onCommand.addListener((command) => {
    if (command === "rejoin-playback") void controller.joinPlayback();
  });
});

async function initializeBackground(): Promise<void> {
  await registerPartyContextMenu(async (tabId) => {
    await controller.addContextSong(tabId);
  });

  await browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  installSidePanelGating();
  await controller.initialize();
}

async function handleMessage(
  message: ExtensionRequest,
  sender?: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (message.type) {
    case "party.create":
      return controller.createParty(message.displayName);

    case "party.join":
      return controller.joinParty(message.inviteCode, message.displayName);

    case "party.leave":
      return controller.leaveParty();

    case "party.getState":
      return controller.getView();

    case "party.prepareInvite": {
      return preparePendingInvite({
        inviteCode: message.inviteCode,
        storage: pendingInvites,
        openPanel: async () => {
          if (sender?.tab?.id) {
            await browser.sidePanel.open({ tabId: sender.tab.id });
          }
        },
        notifyPrepared: (invite) => {
          void browser.runtime
            .sendMessage({ type: "party.pendingInviteChanged", invite })
            .catch(() => undefined);
        },
      });
    }

    case "party.getPendingInvite":
      return pendingInvites.load();

    case "party.clearPendingInvite":
      await pendingInvites.clear();
      return null;

    case "party.joinPlayback":
    case "party.rejoinPlayback":
      return controller.joinPlayback();

    case "party.resumePlayback":
      return controller.resumePlayback();

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
      await controller.handleLocalPlaybackEvent(message.event, sender?.tab?.id);
      return null;

    case "content.ready":
      await controller.handleContentReady(sender?.tab?.id);
      return null;

    default:
      return null;
  }
}
