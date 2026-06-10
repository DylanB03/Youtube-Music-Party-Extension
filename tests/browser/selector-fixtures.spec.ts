import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { youtubeMusicSurfaceFixtures } from "./fixtures/youtube-music-surfaces";

test("captures known signed-in YouTube Music surface shapes", async () => {
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
    await readDiagnostics(extensionPage);

    for (const fixture of youtubeMusicSurfaceFixtures) {
      await musicPage.evaluate((surface) => {
        document.querySelector("[data-selector-fixture]")?.remove();
        const container = document.createElement("div");
        container.dataset.selectorFixture = surface.name;
        const row = document.createElement(surface.rowTag);
        if (surface.videoSource === "row") {
          row.dataset.videoId = surface.videoId;
        }
        const title = document.createElement(surface.titleTag);
        title.className = "title";
        title.textContent = surface.title;
        if (surface.videoSource === "link" && title instanceof HTMLAnchorElement) {
          title.href = `/watch?v=${surface.videoId}`;
        }
        const artist = document.createElement("span");
        artist.className = surface.artistClass;
        artist.textContent = surface.artist;
        const trigger = document.createElement(surface.triggerTag);
        trigger.setAttribute(
          surface.triggerAttribute.name,
          surface.triggerAttribute.value,
        );
        row.append(title, artist, trigger);
        container.append(row);
        document.body.append(container);
        trigger.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            composed: true,
          }),
        );
      }, fixture);

      const diagnostics = await readDiagnostics(extensionPage);
      expect(diagnostics.data.lastContextTrack.videoId, fixture.name).toBe(
        fixture.videoId,
      );
      expect(diagnostics.data.lastContextTrack.title, fixture.name).toBe(
        fixture.title,
      );
    }

    await musicPage.evaluate(() => {
      document.querySelector("[data-selector-fixture]")?.remove();
      const advertisement = document.createElement("div");
      advertisement.className = "ad-showing";
      advertisement.dataset.selectorFixture = "advertisement";
      document.body.append(advertisement);
    });
    const advertisementDiagnostics = await readDiagnostics(extensionPage);
    expect(advertisementDiagnostics.data.playback.interruption).toBe("advertisement");

    await musicPage.evaluate(() => {
      document.querySelector("[data-selector-fixture]")?.remove();
      const unavailable = document.createElement(
        "ytmusic-player-error-message-renderer",
      );
      unavailable.dataset.selectorFixture = "unavailable";
      document.body.append(unavailable);
    });
    const unavailableDiagnostics = await readDiagnostics(extensionPage);
    expect(unavailableDiagnostics.data.playback.interruption).toBe("unavailable");
    expect(
      unavailableDiagnostics.data.selectorCoverage.unavailableStates,
    ).toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});

async function readDiagnostics(extensionPage: import("@playwright/test").Page) {
  return extensionPage.evaluate(async () => {
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
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new Error("The YouTube Music content script did not respond.");
  });
}
