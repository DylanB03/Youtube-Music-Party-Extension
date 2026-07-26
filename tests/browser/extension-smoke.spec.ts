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

      const trigger = document.createElement("div");
      trigger.dataset.id = "menu";
      const triggerShadow = trigger.attachShadow({ mode: "open" });
      const triggerButton = document.createElement("button");
      triggerButton.type = "button";
      triggerButton.setAttribute("aria-label", "Action menu");
      triggerShadow.append(triggerButton);

      row.append(link, artist, trigger);
      document.body.append(row);
      triggerButton.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          composed: true,
        }),
      );

      const popup = document.createElement("ytmusic-menu-popup-renderer");
      document.body.append(popup);
      window.setTimeout(() => {
        const list = document.createElement("yt-list-view-model");
        const nativeAction = document.createElement(
          "ytmusic-menu-service-item-renderer",
        );
        nativeAction.textContent = "Start radio";
        list.append(nativeAction);
        popup.append(list);
      }, 100);
    });

    const injectedAction = musicPage.locator("[data-ytm-party-menu-action]");
    await expect(injectedAction).toHaveAttribute(
      "data-ytm-party-track-id",
      "party-menu-test",
    );
    await expect
      .poll(() =>
        injectedAction.evaluate(
          (action) => action.parentElement?.firstElementChild === action,
        ),
      )
      .toBe(true);
    const actionButton = injectedAction.locator("button");
    await expect(actionButton).toBeDisabled();
    await expect(actionButton).toContainText("Join or create a party");

    const secondMusicPage = await context.newPage();
    await secondMusicPage.goto("https://music.youtube.com/", {
      waitUntil: "domcontentloaded",
    });
    await extensionPage.getByRole("button", { name: "Create party" }).click();
    await expect(
      extensionPage.getByText("Invite listeners", { exact: true }),
    ).toBeVisible();
    await extensionPage
      .getByRole("button", { name: "Open room menu" })
      .click();
    await expect(
      extensionPage.getByRole("menuitem", { name: "Leave party" }),
    ).toBeVisible();
    await extensionPage.keyboard.press("Escape");
    await expect(
      extensionPage.getByRole("menuitem", { name: "Leave party" }),
    ).toHaveCount(0);

    await musicPage.evaluate(() => {
      document.querySelector("ytmusic-menu-popup-renderer")?.remove();
      document.querySelector("[data-party-test-row]")?.remove();
      const row = document.createElement("ytmusic-responsive-list-item-renderer");
      row.setAttribute("data-party-test-row", "");
      const link = document.createElement("a");
      link.href = "/watch?v=host-menu-test";
      link.className = "title";
      link.textContent = "Host Menu Track";
      const trigger = document.createElement("button");
      trigger.setAttribute("aria-label", "More actions");
      row.append(link, trigger);
      document.body.append(row);
      trigger.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          composed: true,
        }),
      );
      const popup = document.createElement("ytmusic-menu-popup-renderer");
      popup.append(document.createElement("yt-list-view-model"));
      document.body.append(popup);
    });

    const hostAction = musicPage
      .locator('[data-ytm-party-menu-action][data-ytm-party-track-id="host-menu-test"]')
      .locator("button");
    await expect(hostAction).toBeEnabled();
    await expect(hostAction).toContainText("Add this song for everyone");
    await musicPage.waitForTimeout(10_500);
    await expect(hostAction).toBeEnabled();
    await musicPage.evaluate(() => {
      document.querySelectorAll("video").forEach((video) => video.remove());
      document.body.append(document.createElement("video"));
      document.addEventListener(
        "yt-navigate",
        (event) => {
          const navigation = event as CustomEvent<{
            endpoint?: { watchEndpoint?: { videoId?: string } };
          }>;
          const videoId = navigation.detail.endpoint?.watchEndpoint?.videoId;
          if (videoId) history.pushState({}, "", `/watch?v=${videoId}`);
        },
        { once: true },
      );
    });
    await hostAction.click();
    await expect(hostAction).toContainText("Added");
    const startedPlayback = await extensionPage.evaluate(() =>
      chrome.runtime.sendMessage({ type: "party.getState" }),
    );
    expect(startedPlayback.data.state.playback.track.videoId).toBe("host-menu-test");
    expect(startedPlayback.data.state.queue).toEqual([]);

    const selectionDiagnostics = await extensionPage.evaluate(async () => {
      const [tab] = await chrome.tabs.query({
        url: "https://music.youtube.com/*",
      });
      if (!tab?.id) throw new Error("YouTube Music tab was not found.");
      return chrome.tabs.sendMessage(tab.id, {
        type: "content.getDiagnostics",
      });
    });
    expect(selectionDiagnostics.data.lastContextTrack).toBeNull();

    await musicPage.evaluate(() => {
      document.querySelector("ytmusic-menu-popup-renderer")?.remove();
      document.querySelector("[data-party-test-row]")?.remove();

      const row = document.createElement("ytmusic-responsive-list-item-renderer");
      const link = document.createElement("a");
      link.href = "/watch?v=party-fallback-test";
      link.className = "title";
      link.textContent = "Fallback Party Track";
      const trigger = document.createElement("div");
      trigger.dataset.id = "menu";
      const shadow = trigger.attachShadow({ mode: "open" });
      const button = document.createElement("button");
      button.setAttribute("aria-label", "Action menu");
      shadow.append(button);
      row.append(link, trigger);
      document.body.append(row);
      button.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientX: 120,
          clientY: 120,
          composed: true,
        }),
      );
    });

    const fallbackAction = musicPage.locator(
      "[data-ytm-party-menu-fallback] [data-ytm-party-menu-action]",
    );
    await expect(fallbackAction).toHaveAttribute(
      "data-ytm-party-track-id",
      "party-fallback-test",
    );

    await musicPage.evaluate(() => {
      document.querySelectorAll("video").forEach((video) => video.remove());
      const marker = document.createElement("div");
      marker.dataset.partyNavigationMarker = "preserved";
      document.body.append(marker);
      document.body.append(document.createElement("video"));
      const app =
        document.querySelector("ytmusic-app") ??
        document.body.appendChild(document.createElement("ytmusic-app"));
      const playerApi = {
        currentVideoId: "host-menu-test",
        currentTitle: "Host Menu Track",
        currentArtist: "Host Menu Artist",
        getVideoData() {
          return {
            video_id: this.currentVideoId,
            title: this.currentTitle,
            author: this.currentArtist,
          };
        },
        getPlayerResponse() {
          return {
            videoDetails: {
              videoId: this.currentVideoId,
              title: this.currentTitle,
              author: this.currentArtist,
            },
          };
        },
        loadVideoById(videoId: string) {
          this.currentVideoId = videoId;
          this.currentTitle = "Verified Party Song";
          this.currentArtist = "Verified Party Artist";
        },
        pauseVideo() {
          return undefined;
        },
      };
      Object.defineProperty(app, "playerApi", {
        configurable: true,
        value: playerApi,
      });
      history.pushState({}, "", "/watch?v=host-menu-test");
    });

    const navigationResult = await extensionPage.evaluate(async () => {
      const [tab] = await chrome.tabs.query({
        url: "https://music.youtube.com/*",
      });
      if (!tab?.id) throw new Error("YouTube Music tab was not found.");
      return chrome.tabs.sendMessage(tab.id, {
        type: "content.applyPlayback",
        playback: {
          track: { videoId: "party-spa-navigation" },
          paused: true,
          positionSeconds: 12,
          effectiveAtMs: Date.now(),
        },
      });
    });

    expect(navigationResult).toEqual({ ok: true, data: "applied" });
    await expect(musicPage).toHaveURL(/watch\?v=party-spa-navigation/);
    await expect(
      musicPage.locator('[data-party-navigation-marker="preserved"]'),
    ).toHaveCount(1);

    await musicPage.evaluate(() => {
      const app = document.querySelector("ytmusic-app") as HTMLElement & {
        playerApi?: {
          currentVideoId?: string;
          currentTitle?: string;
          currentArtist?: string;
        };
      };
      if (app.playerApi) {
        app.playerApi.currentVideoId = "native-auto-next";
        app.playerApi.currentTitle = "Native Auto Next";
        app.playerApi.currentArtist = "Native Artist";
      }
    });
    const actualPlayerPlayback = await extensionPage.evaluate(async () => {
      const [tab] = await chrome.tabs.query({
        url: "https://music.youtube.com/*",
      });
      if (!tab?.id) throw new Error("YouTube Music tab was not found.");
      return chrome.tabs.sendMessage(tab.id, {
        type: "content.getPlayback",
      });
    });

    expect(actualPlayerPlayback.data.track.videoId).toBe("native-auto-next");
    expect(actualPlayerPlayback.data.track.title).toBe("Native Auto Next");
    expect(actualPlayerPlayback.data.track.artist).toBe("Native Artist");
    await expect(musicPage).toHaveURL(/watch\?v=party-spa-navigation/);

    await extensionPage
      .getByRole("button", { name: "Open room menu" })
      .click();
    await extensionPage.getByRole("menuitem", { name: "Leave party" }).click();
    await expect(
      extensionPage.getByRole("button", { name: "Create party" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
