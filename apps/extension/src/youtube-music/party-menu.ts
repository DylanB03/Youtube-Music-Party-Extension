import type { Track } from "@ytm-party/shared";
import { sendExtensionRequest } from "../extension-messaging";
import {
  resolveQueueAccess,
  type QueueAccess,
} from "../queue-access";
import type { SessionView } from "../session-types";
import { consumeMenuTrack } from "./party-menu-selection";
import { PARTY_MENU_STYLES } from "./party-menu-styles";
import { isSongMenuEvent } from "./selectors";
import type { TrackSelectionStore } from "./track-selection";

const MENU_ITEMS_SELECTOR = [
  "ytmusic-menu-popup-renderer tp-yt-paper-listbox#items",
  "ytmusic-menu-popup-renderer #items",
  'ytmusic-menu-popup-renderer [role="menu"]',
  'ytmusic-menu-popup-renderer [role="listbox"]',
  "ytmusic-menu-popup-renderer yt-list-view-model",
  "ytmusic-menu-popup-renderer",
  "tp-yt-iron-dropdown:not([aria-hidden='true']) tp-yt-paper-listbox#items",
  'yt-sheet-view-model [role="menu"]',
  "yt-sheet-view-model yt-list-view-model",
  "yt-sheet-view-model",
].join(", ");

const ACTION_ATTRIBUTE = "data-ytm-party-menu-action";
const FALLBACK_ATTRIBUTE = "data-ytm-party-menu-fallback";
const MENU_SCAN_DELAYS_MS = [0, 50, 150, 350];
const FALLBACK_DELAY_MS = 500;
const ACCESS_RETRY_DELAY_MS = 250;
const ACCESS_RETRY_COUNT = 40;

export function installPartyMenuIntegration(
  selectionStore: TrackSelectionStore,
  root: Document = document,
): () => void {
  let fallback: HTMLElement | null = null;
  const scanTimers = new Set<ReturnType<typeof setTimeout>>();

  const removeStaleActions = () => {
    const staleActions = root.querySelectorAll<HTMLElement>(`[${ACTION_ATTRIBUTE}]`);
    for (const action of staleActions) action.remove();
    fallback?.remove();
    fallback = null;
  };

  const refreshMenus = (menus: Iterable<HTMLElement>) => {
    const availableMenus = Array.from(menus).filter(isMenuAvailable);
    const track = selectionStore.peek();
    if (!track) {
      removeStaleActions();
      return;
    }

    if (availableMenus.length > 0) {
      fallback?.remove();
      fallback = null;
    }
    for (const menu of availableMenus) {
      ensurePartyAction(menu, track, selectionStore);
    }

  };

  const scanExistingMenus = () => {
    refreshMenus(
      deepestMenuContainers(
        root.querySelectorAll<HTMLElement>(MENU_ITEMS_SELECTOR),
      ),
    );
  };
  const observer = new MutationObserver((records) => {
    const addedMenus = findAddedMenus(records);
    if (addedMenus.size > 0) refreshMenus(addedMenus);
  });
  observer.observe(root.documentElement, {
    childList: true,
    subtree: true,
  });
  const handlePointerDown = (event: PointerEvent) => {
    const clickedPartyAction = event.composedPath().some(
      (target) =>
        target instanceof Element &&
        target.matches(`[${ACTION_ATTRIBUTE}], [${FALLBACK_ATTRIBUTE}]`),
    );
    if (clickedPartyAction || !isSongMenuEvent(event)) return;
    removeStaleActions();

    for (const delayMs of MENU_SCAN_DELAYS_MS) {
      const timer = setTimeout(() => {
        scanTimers.delete(timer);
        scanExistingMenus();
      }, delayMs);
      scanTimers.add(timer);
    }
    const fallbackTimer = setTimeout(() => {
      scanTimers.delete(fallbackTimer);
      if (root.querySelector(`[${ACTION_ATTRIBUTE}]`)) return;
      const track = selectionStore.peek();
      if (!track) return;
      fallback = createFallbackContainer(event.clientX, event.clientY);
      ensurePartyAction(fallback, track, selectionStore);
      root.documentElement.append(fallback);
    }, FALLBACK_DELAY_MS);
    scanTimers.add(fallbackTimer);
  };
  root.addEventListener("pointerdown", handlePointerDown, true);
  scanExistingMenus();

  return () => {
    observer.disconnect();
    root.removeEventListener("pointerdown", handlePointerDown, true);
    for (const timer of scanTimers) clearTimeout(timer);
    scanTimers.clear();
  };
}

function isMenuAvailable(menu: HTMLElement): boolean {
  if (menu.closest('[aria-hidden="true"]')) return false;
  const style = getComputedStyle(menu);
  return style.display !== "none" && style.visibility !== "hidden";
}

function createFallbackContainer(clientX: number, clientY: number): HTMLElement {
  const container = document.createElement("div");
  container.setAttribute(FALLBACK_ATTRIBUTE, "");
  container.setAttribute("role", "menu");
  const left = Math.max(12, Math.min(clientX + 8, window.innerWidth - 300));
  const top = Math.max(12, Math.min(clientY + 8, window.innerHeight - 96));
  Object.assign(container.style, {
    background: "#212121",
    border: "1px solid rgba(255, 255, 255, 0.14)",
    borderRadius: "12px",
    boxShadow: "0 12px 36px rgba(0, 0, 0, 0.45)",
    left: `${left}px`,
    overflow: "hidden",
    position: "fixed",
    top: `${top}px`,
    width: "280px",
    zIndex: "2147483647",
  });
  return container;
}

function findAddedMenus(records: MutationRecord[]): Set<HTMLElement> {
  const menus = new Set<HTMLElement>();
  for (const record of records) {
    if (record.target instanceof HTMLElement) {
      const containingMenu = record.target.closest<HTMLElement>(
        MENU_ITEMS_SELECTOR,
      );
      if (containingMenu) menus.add(containingMenu);
    }
    for (const node of record.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.matches(MENU_ITEMS_SELECTOR)) menus.add(node);
      const descendants = node.querySelectorAll<HTMLElement>(MENU_ITEMS_SELECTOR);
      for (const descendant of descendants) menus.add(descendant);
    }
  }
  return new Set(deepestMenuContainers(menus));
}

function deepestMenuContainers(
  candidates: Iterable<HTMLElement>,
): HTMLElement[] {
  const menus = Array.from(candidates);
  return menus.filter(
    (menu) =>
      !menus.some(
        (candidate) => candidate !== menu && menu.contains(candidate),
      ),
  );
}

function ensurePartyAction(
  menu: HTMLElement,
  track: Track,
  selectionStore: TrackSelectionStore,
): void {
  const otherActions = menu.ownerDocument.querySelectorAll<HTMLElement>(
    `[${ACTION_ATTRIBUTE}]`,
  );
  for (const action of otherActions) {
    if (!menu.contains(action)) action.remove();
  }

  const existing = menu.querySelector<HTMLElement>(`[${ACTION_ATTRIBUTE}]`);
  if (existing?.dataset.ytmPartyTrackId === track.videoId) {
    if (menu.firstElementChild !== existing) menu.prepend(existing);
    return;
  }
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
  const icon = document.createElement("span");
  icon.className = "icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "+";
  const copy = document.createElement("span");
  copy.className = "copy";
  const title = document.createElement("strong");
  title.textContent = "Add to party queue";
  const detail = document.createElement("small");
  detail.textContent = "Checking party access...";
  copy.append(title, detail);
  button.append(icon, copy);
  shadow.append(style, button);
  menu.prepend(host);

  void configurePartyAction(button, track, selectionStore);
}

async function configurePartyAction(
  button: HTMLButtonElement,
  track: Track,
  selectionStore: TrackSelectionStore,
): Promise<void> {
  const detail = button.querySelector("small");
  try {
    const access = await waitForQueueAccess(button);
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

async function waitForQueueAccess(
  button: HTMLButtonElement,
): Promise<QueueAccess> {
  for (let attempt = 0; attempt < ACCESS_RETRY_COUNT; attempt += 1) {
    const response = await sendExtensionRequest<SessionView>({
      type: "party.getState",
    });
    if (!response.ok) return { allowed: false, reason: response.error };
    const access = resolveQueueAccess(response.data);
    const stateIsLoading =
      response.data.roomId !== null &&
      (!response.data.state || !response.data.participantId);
    if (!stateIsLoading || !button.isConnected) return access;
    await delay(ACCESS_RETRY_DELAY_MS);
  }
  return {
    allowed: false,
    reason: "The party is still loading. Reopen the song menu to try again.",
  };
}

async function delay(durationMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
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
