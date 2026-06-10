import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { createTestParty } from "./support/party-test-client";

test("an invite link prepares the side panel without joining automatically", async () => {
  const created = await createTestParty("Invite Host", {
    track: { videoId: "invite-track", title: "Invite Track" },
    paused: true,
    positionSeconds: 0,
    effectiveAtMs: Date.now(),
  });
  const landingResponse = await fetch(
    `http://127.0.0.1:8787/join/${created.inviteCode}`,
  );
  const landingPage = await landingResponse.text();
  expect(landingResponse.ok).toBe(true);
  expect(landingPage).toContain(
    `https://music.youtube.com/?ytm_party=${created.inviteCode}`,
  );

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
    await musicPage.goto(
      `https://music.youtube.com/?ytm_party=${created.inviteCode}`,
      { waitUntil: "domcontentloaded" },
    );

    const prompt = musicPage.locator("[data-ytm-party-invite-prompt]");
    await expect(prompt.locator("h2")).toContainText("Join your friends here");
    await expect(prompt.locator(".code")).toHaveText(created.inviteCode);
    await prompt.locator("button.open").click();
    await expect(musicPage).not.toHaveURL(/ytm_party=/);

    const sidePanel = await context.newPage();
    await sidePanel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(sidePanel.getByText("Invite ready")).toBeVisible();
    await expect(sidePanel.getByLabel("Party invite code")).toHaveValue(
      created.inviteCode,
    );
    await expect(sidePanel.getByRole("button", { name: "Join" })).toBeVisible();
    await expect(sidePanel.getByText("Join playback")).toHaveCount(0);

    const session = await sidePanel.evaluate(async () => {
      return chrome.runtime.sendMessage({ type: "party.getState" });
    });
    expect(session.ok).toBe(true);
    expect(session.data.roomId).toBeNull();
  } finally {
    await context.close();
  }
});
