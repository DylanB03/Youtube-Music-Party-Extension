import { chromium, expect, test } from "@playwright/test";
import path from "node:path";

test("loads the extension content script on YouTube Music", async () => {
  const extensionPath = path.resolve("apps/extension/.output/chrome-mv3");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  try {
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) serviceWorker = await context.waitForEvent("serviceworker");
    const extensionId = new URL(serviceWorker.url()).host;

    const musicPage = await context.newPage();
    await musicPage.goto("https://music.youtube.com/", {
      waitUntil: "domcontentloaded",
    });

    const extensionPage = await context.newPage();
    await extensionPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    const diagnostics = await extensionPage.evaluate(async () => {
      const [tab] = await chrome.tabs.query({
        url: "https://music.youtube.com/*",
      });
      if (!tab?.id) throw new Error("YouTube Music tab was not found.");

      const startedAt = Date.now();
      while (Date.now() - startedAt < 10_000) {
        try {
          return await chrome.tabs.sendMessage(tab.id, {
            type: "content.getDiagnostics",
          });
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      throw new Error("The YouTube Music content script did not respond.");
    });

    expect(diagnostics.ok).toBe(true);
    expect(diagnostics.data.href).toContain("music.youtube.com");
    expect(diagnostics.data.playback).toBeDefined();

    await musicPage.evaluate(() => {
      const row = document.createElement("ytmusic-responsive-list-item-renderer");
      row.setAttribute("data-party-test-row", "");

      const link = document.createElement("a");
      link.href = "/watch?v=party-menu-test";
      link.className = "title";
      link.textContent = "Synthetic Party Track";

      const artist = document.createElement("span");
      artist.className = "subtitle";
      artist.textContent = "Synthetic Artist";

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.setAttribute("aria-label", "More actions");

      row.append(link, artist, trigger);
      document.body.append(row);
      trigger.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          composed: true,
        }),
      );

      const popup = document.createElement("ytmusic-menu-popup-renderer");
      const items = document.createElement("tp-yt-paper-listbox");
      items.id = "items";
      popup.append(items);
      document.body.append(popup);
    });

    const injectedAction = musicPage.locator("[data-ytm-party-menu-action]");
    await expect(injectedAction).toHaveAttribute(
      "data-ytm-party-track-id",
      "party-menu-test",
    );
    const actionButton = injectedAction.locator("button");
    await expect(actionButton).toBeDisabled();
    await expect(actionButton).toContainText("Join or create a party");

    const selectionDiagnostics = await extensionPage.evaluate(async () => {
      const [tab] = await chrome.tabs.query({
        url: "https://music.youtube.com/*",
      });
      if (!tab?.id) throw new Error("YouTube Music tab was not found.");
      return chrome.tabs.sendMessage(tab.id, {
        type: "content.getDiagnostics",
      });
    });
    expect(selectionDiagnostics.data.lastContextTrack.videoId).toBe(
      "party-menu-test",
    );
  } finally {
    await context.close();
  }
});
