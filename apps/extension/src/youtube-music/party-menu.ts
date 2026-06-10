import type { Track } from "@ytm-party/shared";
import { sendExtensionRequest } from "../extension-messaging";
import { resolveQueueAccess } from "../queue-access";
import type { SessionView } from "../session-types";
import { consumeMenuTrack } from "./party-menu-selection";
import { PARTY_MENU_STYLES } from "./party-menu-styles";
import type { TrackSelectionStore } from "./track-selection";

const MENU_ITEMS_SELECTOR = [
  "ytmusic-menu-popup-renderer tp-yt-paper-listbox#items",
  "ytmusic-menu-popup-renderer #items",
  "tp-yt-iron-dropdown:not([aria-hidden='true']) tp-yt-paper-listbox#items",
].join(", ");

const ACTION_ATTRIBUTE = "data-ytm-party-menu-action";

export function installPartyMenuIntegration(
  selectionStore: TrackSelectionStore,
  root: Document = document,
): () => void {
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;

  const removeStaleActions = () => {
    const staleActions = root.querySelectorAll<HTMLElement>(`[${ACTION_ATTRIBUTE}]`);
    for (const action of staleActions) action.remove();
  };

  const refreshMenus = (menus: Iterable<HTMLElement>) => {
    const track = selectionStore.peek();
    if (!track) {
      removeStaleActions();
      return;
    }

    for (const menu of menus) {
      ensurePartyAction(menu, track, selectionStore);
    }

    if (expiryTimer) clearTimeout(expiryTimer);
    const remainingMs = selectionStore.millisecondsUntilExpiry();
    if (remainingMs !== null) {
      expiryTimer = setTimeout(removeStaleActions, remainingMs + 1);
    }
  };

  const scanExistingMenus = () => {
    refreshMenus(root.querySelectorAll<HTMLElement>(MENU_ITEMS_SELECTOR));
  };
  const observer = new MutationObserver((records) => {
    const addedMenus = findAddedMenus(records);
    if (addedMenus.size > 0) refreshMenus(addedMenus);
  });
  observer.observe(root.documentElement, {
    childList: true,
    subtree: true,
  });
  const handlePointerDown = () => {
    setTimeout(scanExistingMenus, 0);
  };
  root.addEventListener("pointerdown", handlePointerDown, true);
  scanExistingMenus();

  return () => {
    observer.disconnect();
    root.removeEventListener("pointerdown", handlePointerDown, true);
    if (expiryTimer) clearTimeout(expiryTimer);
  };
}

function findAddedMenus(records: MutationRecord[]): Set<HTMLElement> {
  const menus = new Set<HTMLElement>();
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.matches(MENU_ITEMS_SELECTOR)) menus.add(node);
      const descendants = node.querySelectorAll<HTMLElement>(MENU_ITEMS_SELECTOR);
      for (const descendant of descendants) menus.add(descendant);
    }
  }
  return menus;
}

function ensurePartyAction(
  menu: HTMLElement,
  track: Track,
  selectionStore: TrackSelectionStore,
): void {
  const existing = menu.querySelector<HTMLElement>(`[${ACTION_ATTRIBUTE}]`);
  if (existing?.dataset.ytmPartyTrackId === track.videoId) return;
  existing?.remove();

  const host = document.createElement("div");
  host.setAttribute(ACTION_ATTRIBUTE, "");
  host.dataset.ytmPartyTrackId = track.videoId;
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = PARTY_MENU_STYLES;
  const button = document.createElement("button");
  button.type = "button";
  button.disabled = true;
  button.innerHTML = `
    <span class="icon" aria-hidden="true">+</span>
    <span class="copy">
      <strong>Add to party queue</strong>
      <small>Checking party access...</small>
    </span>
  `;
  shadow.append(style, button);
  menu.append(host);

  void configurePartyAction(button, track, selectionStore);
}

async function configurePartyAction(
  button: HTMLButtonElement,
  track: Track,
  selectionStore: TrackSelectionStore,
): Promise<void> {
  const detail = button.querySelector("small");
  try {
    const response = await sendExtensionRequest<SessionView>({
      type: "party.getState",
    });
    if (!response.ok) {
      setUnavailable(button, detail, response.error);
      return;
    }

    const access = resolveQueueAccess(response.data);
    if (!access.allowed) {
      setUnavailable(button, detail, access.reason ?? "Queue additions are unavailable.");
      return;
    }

    button.disabled = false;
    if (detail) detail.textContent = track.artist ?? "Add this song for everyone";
    button.addEventListener("click", () => {
      void addTrack(button, detail, track, selectionStore);
    });
  } catch {
    setUnavailable(button, detail, "Open the extension panel to check party access.");
  }
}

async function addTrack(
  button: HTMLButtonElement,
  detail: HTMLElement | null,
  track: Track,
  selectionStore: TrackSelectionStore,
): Promise<void> {
  const selection = consumeMenuTrack(selectionStore, track.videoId);
  if (!selection.valid) {
    setUnavailable(button, detail, selection.reason);
    return;
  }

  button.disabled = true;
  if (detail) detail.textContent = "Adding...";

  try {
    const response = await sendExtensionRequest<SessionView>({
      type: "party.queueAdd",
      track: selection.track,
    });
    if (!response.ok) {
      button.disabled = false;
      if (detail) detail.textContent = response.error;
      return;
    }

    button.dataset.state = "added";
    if (detail) detail.textContent = "Added";
  } catch {
    button.disabled = false;
    if (detail) detail.textContent = "Could not add this song. Try again.";
  }
}

function setUnavailable(
  button: HTMLButtonElement,
  detail: HTMLElement | null,
  reason: string,
): void {
  button.disabled = true;
  button.title = reason;
  if (detail) detail.textContent = reason;
}
