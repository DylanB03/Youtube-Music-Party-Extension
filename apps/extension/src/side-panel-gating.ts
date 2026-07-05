import { browser } from "./browser";

const PANEL_PATH = "sidepanel.html";

// Returns true only for the YouTube Music origin. The side panel is enabled
// for these tabs and disabled everywhere else, which closes it when the user
// switches away from YouTube Music.
export function isYouTubeMusicTab(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).origin === "https://music.youtube.com";
  } catch {
    return false;
  }
}

async function applyPanelOptionsForTab(
  tabId: number,
  url: string | undefined,
): Promise<void> {
  try {
    // Enabling requires a path; disabling closes/hides the panel for the tab.
    // Switching back to a tab that was enabled re-shows the panel automatically.
    await browser.sidePanel.setOptions(
      isYouTubeMusicTab(url)
        ? { tabId, path: PANEL_PATH, enabled: true }
        : { tabId, enabled: false },
    );
  } catch {
    // The tab may have closed between the lookup and this call; ignore.
  }
}

export function installSidePanelGating(): void {
  browser.tabs.onActivated.addListener((activeInfo) => {
    void (async () => {
      try {
        const tab = await browser.tabs.get(activeInfo.tabId);
        await applyPanelOptionsForTab(activeInfo.tabId, tab.url);
      } catch {
        // Tab lookup failed (closed/restricted); nothing to gate.
      }
    })();
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete" && changeInfo.url === undefined) return;
    void applyPanelOptionsForTab(tabId, tab.url);
  });

  void initializeGating();
}

// Gate every existing tab so a freshly started or restarted service worker
// does not leave the global panel enabled on a non-YouTube-Music tab.
async function initializeGating(): Promise<void> {
  try {
    const tabs = await browser.tabs.query({});
    await Promise.all(
      tabs.map((tab) =>
        tab.id === undefined
          ? Promise.resolve()
          : applyPanelOptionsForTab(tab.id, tab.url),
      ),
    );
  } catch {
    // Querying tabs failed; gating will still apply on the next tab event.
  }
}
