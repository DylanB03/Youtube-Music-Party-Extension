import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const extensionPath = path.resolve("apps/extension/.output/chrome-mv3");
const outputDirectory = path.resolve("store/assets");
const brandIconPath = path.join(outputDirectory, "icon-128.png");
const contexts = [];

const palette = {
  espresso: "#24120f",
  espressoRaised: "#321713",
  plum: "#24172f",
  coral: "#ff5f3a",
  coralSoft: "#ff9a7e",
  amber: "#ffb000",
  cream: "#fff3e6",
  creamMuted: "#e5cbbb",
};

async function launchExtensionProfile(label) {
  const profile = await mkdtemp(path.join(os.tmpdir(), `togethertune-${label}-`));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: 440, height: 780 },
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

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function textRows({ lines, x, y, lineHeight, fontFamily, fontSize, weight, fill }) {
  return `<text font-family="${fontFamily}" font-size="${fontSize}" font-weight="${weight}" fill="${fill}">${lines
    .map(
      (line, index) =>
        `<tspan x="${x}" y="${y + index * lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("")}</text>`;
}

async function composeStoreScreenshot({
  panelPath,
  filename,
  eyebrow,
  titleLines,
  bodyLines,
  colors,
  panelPosition = "top",
  panelCropTop,
  panelCoverBottom = 0,
  badge,
}) {
  const panelMask = Buffer.from(`
    <svg width="470" height="744" xmlns="http://www.w3.org/2000/svg">
      <rect width="470" height="744" rx="20" fill="#fff"/>
    </svg>
  `);
  let panelSource = sharp(panelPath);
  if (panelCropTop !== undefined) {
    const metadata = await panelSource.metadata();
    const cropHeight = Math.round((metadata.width * 744) / 470);
    if (!metadata.width || !metadata.height || panelCropTop + cropHeight > metadata.height) {
      throw new Error(`Invalid panel crop for ${filename}.`);
    }
    panelSource = panelSource.extract({
      left: 0,
      top: panelCropTop,
      width: metadata.width,
      height: cropHeight,
    });
  }
  const panelComposites = [];
  if (panelCoverBottom > 0) {
    panelComposites.push({
      input: Buffer.from(`
        <svg width="470" height="744" xmlns="http://www.w3.org/2000/svg">
          <rect y="${744 - panelCoverBottom}" width="470" height="${panelCoverBottom}" fill="#f7f5f2"/>
        </svg>
      `),
      blend: "over",
    });
  }
  panelComposites.push({ input: panelMask, blend: "dest-in" });
  const panel = await panelSource
    .resize(470, 744, {
      fit: "cover",
      position: panelPosition,
      background: "#f7f5f2",
    })
    .composite(panelComposites)
    .png()
    .toBuffer();
  const logo = await sharp(brandIconPath).resize(50, 50).png().toBuffer();
  const badgeMarkup = badge
    ? `<g>
        <rect x="82" y="506" width="${Math.max(184, badge.length * 10 + 42)}" height="40" rx="20" fill="${colors.accent}"/>
        <text x="103" y="532" font-family="Arial, sans-serif" font-size="14" font-weight="700" letter-spacing="1.2" fill="${colors.badgeText}">${escapeXml(badge)}</text>
      </g>`
    : "";
  const background = Buffer.from(`
    <svg width="1280" height="800" xmlns="http://www.w3.org/2000/svg">
      <rect width="1280" height="800" fill="${colors.background}"/>
      <circle cx="1150" cy="80" r="270" fill="${colors.accent}" opacity="0.12"/>
      <circle cx="665" cy="785" r="300" fill="${colors.secondary}" opacity="0.12"/>
      <path d="M-60 650 C 190 530, 410 720, 700 560 S 1090 340, 1350 475" fill="none" stroke="${colors.accent}" stroke-width="18" stroke-linecap="round" opacity="0.13"/>
      <rect x="718" y="14" width="518" height="772" rx="34" fill="#0d0706" opacity="0.34"/>
      <rect x="728" y="20" width="500" height="760" rx="28" fill="${colors.stage}" stroke="${colors.stageBorder}" stroke-width="2"/>
      <text x="145" y="84" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="0.3" fill="${palette.cream}">TogetherTune</text>
      <text x="82" y="194" font-family="Arial, sans-serif" font-size="17" font-weight="700" letter-spacing="2.4" fill="${colors.accent}">${escapeXml(eyebrow)}</text>
      ${textRows({
        lines: titleLines,
        x: 82,
        y: 260,
        lineHeight: 57,
        fontFamily: "Georgia, serif",
        fontSize: 52,
        weight: 700,
        fill: palette.cream,
      })}
      ${textRows({
        lines: bodyLines,
        x: 82,
        y: 442,
        lineHeight: 34,
        fontFamily: "Arial, sans-serif",
        fontSize: 24,
        weight: 400,
        fill: palette.creamMuted,
      })}
      ${badgeMarkup}
      <text x="82" y="742" font-family="Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="1.8" fill="${colors.footer}">FOR YOUTUBE MUSIC</text>
    </svg>
  `);

  await sharp(background)
    .composite([
      { input: logo, left: 82, top: 47 },
      { input: panel, left: 744, top: 28 },
    ])
    .png()
    .toFile(path.join(outputDirectory, filename));
}

function coverDataUrl(variant) {
  const motifs = {
    midnight: `<rect width="120" height="120" fill="#24172f"/><circle cx="83" cy="35" r="26" fill="#ff5f3a"/><path d="M0 92 45 46l21 22 17-14 37 38v28H0Z" fill="#ffb000"/><circle cx="83" cy="35" r="12" fill="#fff3e6"/>`,
    golden: `<rect width="120" height="120" fill="#ffb000"/><circle cx="60" cy="60" r="38" fill="#fff3e6"/><circle cx="60" cy="60" r="24" fill="#ff5f3a"/><circle cx="60" cy="60" r="9" fill="#24120f"/>`,
    afterglow: `<rect width="120" height="120" fill="#ff5f3a"/><path d="M0 22h120v16H0zm0 30h120v16H0zm0 30h120v16H0z" fill="#24120f"/><circle cx="82" cy="60" r="30" fill="#ffb000"/>`,
    orbit: `<rect width="120" height="120" fill="#24120f"/><ellipse cx="60" cy="60" rx="46" ry="25" fill="none" stroke="#ffb000" stroke-width="10"/><circle cx="29" cy="48" r="12" fill="#ff5f3a"/><circle cx="79" cy="73" r="9" fill="#fff3e6"/>`,
  };
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">${motifs[variant]}</svg>`)}`;
}

async function composeSmallPromo() {
  const logo = await sharp(brandIconPath).resize(104, 104).png().toBuffer();
  const background = Buffer.from(`
    <svg width="440" height="280" xmlns="http://www.w3.org/2000/svg">
      <rect width="440" height="280" fill="${palette.espresso}"/>
      <circle cx="408" cy="30" r="118" fill="${palette.coral}" opacity="0.2"/>
      <circle cx="368" cy="260" r="116" fill="${palette.amber}" opacity="0.18"/>
      <path d="M-36 242 C 70 168, 165 266, 278 192 S 414 104, 486 146" fill="none" stroke="${palette.coral}" stroke-width="12" stroke-linecap="round" opacity="0.28"/>
      <text x="34" y="62" font-family="Arial, sans-serif" font-size="15" font-weight="700" letter-spacing="1.7" fill="${palette.coralSoft}">TOGETHERTUNE</text>
      <text x="34" y="124" font-family="Georgia, serif" font-size="36" font-weight="700" fill="${palette.cream}">Pass the aux.</text>
      <text x="34" y="160" font-family="Arial, sans-serif" font-size="17" fill="${palette.creamMuted}">Shared listening for</text>
      <text x="34" y="185" font-family="Arial, sans-serif" font-size="17" fill="${palette.creamMuted}">YouTube Music.</text>
    </svg>
  `);

  await sharp(background)
    .composite([{ input: logo, left: 302, top: 92 }])
    .png()
    .toFile(path.join(outputDirectory, "small-promo-440x280.png"));
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
    {
      videoId: "dQw4w9WgXcQ",
      title: "Midnight Drive",
      artist: "Neon Valley",
      thumbnailUrl: coverDataUrl("midnight"),
    },
    {
      videoId: "9bZkp7q19f0",
      title: "Golden Hour",
      artist: "Sunroom",
      thumbnailUrl: coverDataUrl("golden"),
    },
    {
      videoId: "kJQP7kiw5Fk",
      title: "Afterglow",
      artist: "Night Arcade",
      thumbnailUrl: coverDataUrl("afterglow"),
    },
    {
      videoId: "JGwWNGJdvx8",
      title: "Slow Orbit",
      artist: "Satellite Club",
      thumbnailUrl: coverDataUrl("orbit"),
    },
  ]) {
    const response = await hostPage.evaluate(
      (nextTrack) => chrome.runtime.sendMessage({ type: "party.queueAdd", track: nextTrack }),
      track,
    );
    if (!response?.ok) throw new Error(response?.error ?? "Could not seed the party queue.");
  }
  await hostPage.getByText("Golden Hour").waitFor();
  const queuePanel = await capturePanel(hostPage, "queue-panel.png");
  const syncPanel = await capturePanel(hostPage, "sync-panel.png");

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
  const invitePanel = await capturePanel(guestPage, "invite-panel.png");

  await hostPage.locator(".permissions-card summary").click();
  await hostPage.getByText("Allow guests to remove songs").waitFor();
  const permissionsPanel = await capturePanel(hostPage, "permissions-panel.png");

  await composeStoreScreenshot({
    panelPath: setupPanel,
    filename: "screenshot-1280x800.png",
    eyebrow: "START A PARTY",
    titleLines: ["Pass the aux", "without passing", "a thing."],
    bodyLines: ["Open a room from YouTube Music.", "No account required."],
    badge: "NO ACCOUNT REQUIRED",
    colors: {
      background: palette.espresso,
      accent: palette.amber,
      secondary: palette.coral,
      stage: "#3b1e17",
      stageBorder: "#6e3626",
      badgeText: palette.espresso,
      footer: "#ca9b83",
    },
  });
  await composeStoreScreenshot({
    panelPath: invitePanel,
    filename: "screenshot-guest-1280x800.png",
    eyebrow: "INVITE FRIENDS",
    titleLines: ["Six characters.", "One listening room."],
    bodyLines: ["Send the code. Friends join", "from their own browsers."],
    colors: {
      background: palette.plum,
      accent: palette.coralSoft,
      secondary: palette.amber,
      stage: "#362143",
      stageBorder: "#614077",
      badgeText: palette.espresso,
      footer: "#c9a8d6",
    },
  });
  await composeStoreScreenshot({
    panelPath: queuePanel,
    filename: "screenshot-queue-1280x800.png",
    eyebrow: "SHARED QUEUE",
    titleLines: ["Everyone", "brings a song."],
    bodyLines: ["Build the queue together,", "then drag tracks into order."],
    panelCropTop: 228,
    colors: {
      background: "#171d2e",
      accent: palette.amber,
      secondary: palette.coral,
      stage: "#222b43",
      stageBorder: "#3d4d70",
      badgeText: palette.espresso,
      footer: "#9dacc7",
    },
  });
  await composeStoreScreenshot({
    panelPath: syncPanel,
    filename: "screenshot-sync-1280x800.png",
    eyebrow: "SYNCHRONIZED PLAYBACK",
    titleLines: ["Hear the drop", "together."],
    bodyLines: ["The room stays on the same", "track and moment."],
    badge: "EVERYONE IN SYNC",
    colors: {
      background: "#18251f",
      accent: "#53d98b",
      secondary: palette.amber,
      stage: "#23372e",
      stageBorder: "#3f6652",
      badgeText: "#102017",
      footer: "#9ec9af",
    },
  });
  await composeStoreScreenshot({
    panelPath: permissionsPanel,
    filename: "screenshot-host-controls-1280x800.png",
    eyebrow: "HOST CONTROLS",
    titleLines: ["Your room.", "Your rules."],
    bodyLines: ["Choose who can add, remove,", "or skip songs."],
    panelCropTop: 402,
    panelCoverBottom: 34,
    colors: {
      background: palette.espressoRaised,
      accent: palette.coral,
      secondary: palette.amber,
      stage: "#49231b",
      stageBorder: "#7d3a29",
      badgeText: palette.cream,
      footer: "#d3a18d",
    },
  });
  await composeSmallPromo();

  console.log(`Saved five 1280x800 screenshots and one 440x280 promo tile to ${outputDirectory}.`);
} finally {
  await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
}
