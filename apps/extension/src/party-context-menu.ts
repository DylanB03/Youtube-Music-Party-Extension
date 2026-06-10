import { browser } from "./browser";
import { resolveQueueAccess } from "./queue-access";
import type { SessionView } from "./session-types";

const ADD_TO_QUEUE_MENU_ID = "add-to-party-queue";

export async function registerPartyContextMenu(
  onAddRequested: (tabId?: number) => Promise<void>,
): Promise<void> {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({
    id: ADD_TO_QUEUE_MENU_ID,
    title: "Add to party queue",
    contexts: ["link", "page", "selection"],
    documentUrlPatterns: ["https://music.youtube.com/*"],
    enabled: false,
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== ADD_TO_QUEUE_MENU_ID) return;
    void onAddRequested(tab?.id).catch(() => undefined);
  });
}

export async function updatePartyContextMenu(view: SessionView): Promise<void> {
  const access = resolveQueueAccess(view);
  const title = access.allowed
    ? "Add to party queue"
    : `Add to party queue - ${access.reason ?? "Unavailable"}`;

  try {
    await browser.contextMenus.update(ADD_TO_QUEUE_MENU_ID, {
      enabled: access.allowed,
      title,
    });
  } catch {
    // The menu may not be registered yet during service-worker startup.
  }
}
