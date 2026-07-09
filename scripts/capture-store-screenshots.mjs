import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const extensionPath = path.resolve("apps/extension/.output/chrome-mv3");
const outputDirectory = path.resolve("store/assets");
const contexts = [];

async function launchExtensionProfile(label) {
  const profile = await mkdtemp(path.join(os.tmpdir(), `togethertune-${label}-`));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: 420, height: 760 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  contexts.push(context);

  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 30_000 }));
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await page.getByText("Create party").waitFor();

  const musicPage = await context.newPage();
  await musicPage.goto("https://music.youtube.com/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "https://music.youtube.com/*" });
    if (!tab?.id) throw new Error("YouTube Music tab was not found.");
    const startedAt = Date.now();
    while (Date.now() - startedAt < 10_000) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: "content.getDiagnostics",
        });
        if (response?.ok) return;
      } catch {
        // The content script may still be starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("YouTube Music content script did not become ready.");
  });
  return { page, musicPage };
}

async function capturePanel(page, filename) {
  const rawPath = path.join(os.tmpdir(), `togethertune-${filename}`);
  await page.screenshot({ path: rawPath, fullPage: true });
  return rawPath;
}

async function composeStoreScreenshot({ panelPath, filename, eyebrow, title, lines, colors }) {
  const panel = await sharp(panelPath)
    .resize(400, 740, { fit: "contain", background: "#fff5e8" })
    .png()
    .toBuffer();
  const [lineOne, lineTwo] = lines;
  const background = Buffer.from(`
    <svg width="1280" height="800" xmlns="http://www.w3.org/2000/svg">
      <rect width="1280" height="800" fill="${colors.background}"/>
      <circle cx="110" cy="90" r="230" fill="${colors.accent}" opacity="0.24"/>
      <circle cx="650" cy="760" r="320" fill="${colors.secondary}" opacity="0.16"/>
      <text x="82" y="238" font-family="Arial, sans-serif" font-size="23" font-weight="700" fill="${colors.accent}">${eyebrow}</text>
      <text x="82" y="305" font-family="Georgia, serif" font-size="50" font-weight="700" fill="#fff5e8">${title}</text>
      <text x="82" y="365" font-family="Arial, sans-serif" font-size="25" fill="#f1d8c4">${lineOne}</text>
      <text x="82" y="402" font-family="Arial, sans-serif" font-size="25" fill="#f1d8c4">${lineTwo}</text>
      <text x="82" y="730" font-family="Arial, sans-serif" font-size="13" fill="#caa792">ACTUAL EXTENSION INTERFACE</text>
    </svg>
  `);

  await sharp(background)
    .composite([{ input: panel, left: 830, top: 30 }])
    .png()
    .toFile(path.join(outputDirectory, filename));
}

try {
  const { page: hostPage, musicPage: hostMusicPage } =
    await launchExtensionProfile("host");
  const setupPanel = await capturePanel(hostPage, "setup-panel.png");

  await hostPage.getByLabel("Display name").fill("Alex");
  await hostMusicPage.bringToFront();
  const createResponse = await hostPage.evaluate(() =>
    chrome.runtime.sendMessage({ type: "party.create", displayName: "Alex" }),
  );
  if (!createResponse?.ok) {
    throw new Error(`Could not create the screenshot party: ${createResponse?.error}`);
  }
  await hostPage.locator(".invite-code").waitFor();
  const inviteCode = (await hostPage.locator(".invite-code span").textContent())?.trim();
  if (!inviteCode) throw new Error("The host invite code was not rendered.");

  for (const track of [
    { videoId: "store-demo-midnight", title: "Midnight Drive", artist: "The Night Owls" },
    { videoId: "store-demo-golden", title: "Golden Hour", artist: "Sunroom" },
  ]) {
    const response = await hostPage.evaluate(
      (nextTrack) => chrome.runtime.sendMessage({ type: "party.queueAdd", track: nextTrack }),
      track,
    );
    if (!response?.ok) throw new Error(response?.error ?? "Could not seed the party queue.");
  }
  await hostPage.getByText("Golden Hour").waitFor();
  const hostPanel = await capturePanel(hostPage, "host-panel.png");

  const { page: guestPage, musicPage: guestMusicPage } =
    await launchExtensionProfile("guest");
  await guestPage.getByLabel("Display name").fill("Sam");
  await guestPage.getByLabel("Party invite code").fill(inviteCode);
  await guestMusicPage.bringToFront();
  const joinResponse = await guestPage.evaluate(
    ({ code }) =>
      chrome.runtime.sendMessage({
        type: "party.join",
        inviteCode: code,
        displayName: "Sam",
      }),
    { code: inviteCode },
  );
  if (!joinResponse?.ok) {
    throw new Error(`Could not join the screenshot party: ${joinResponse?.error}`);
  }
  await guestPage.getByText("Join playback").waitFor();
  await guestPage.getByText("Midnight Drive").waitFor();
  const guestPanel = await capturePanel(guestPage, "guest-panel.png");

  await composeStoreScreenshot({
    panelPath: setupPanel,
    filename: "screenshot-1280x800.png",
    eyebrow: "TOGETHERTUNE",
    title: "Start a listening party.",
    lines: ["Create a room and share the code.", "No account setup required."],
    colors: { background: "#251410", accent: "#ffb703", secondary: "#f95738" },
  });
  await composeStoreScreenshot({
    panelPath: hostPanel,
    filename: "screenshot-host-controls-1280x800.png",
    eyebrow: "SHARED QUEUE",
    title: "One queue. Host controls.",
    lines: ["Order songs and choose what guests", "can add or skip."],
    colors: { background: "#301711", accent: "#f95738", secondary: "#ffb703" },
  });
  await composeStoreScreenshot({
    panelPath: guestPanel,
    filename: "screenshot-guest-1280x800.png",
    eyebrow: "LISTEN TOGETHER",
    title: "Friends join in seconds.",
    lines: ["Everyone sees the same queue and", "can join synchronized playback."],
    colors: { background: "#21162c", accent: "#ffb703", secondary: "#f95738" },
  });

  console.log(`Saved three 1280x800 screenshots to ${outputDirectory}.`);
} finally {
  await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
}
