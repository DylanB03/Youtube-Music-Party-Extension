import { findMediaElement, findTrackLink, readCurrentTrack } from "./selectors";

export async function loadTrack(videoId: string): Promise<boolean> {
  if (readCurrentTrack()?.videoId === videoId) return true;

  const existingLink = findTrackLink(videoId);
  if (existingLink) {
    existingLink.click();
    if (await waitForTrack(videoId, 3000)) return true;
  }

  const url = new URL("/watch", "https://music.youtube.com");
  url.searchParams.set("v", videoId);
  window.setTimeout(() => location.assign(url), 0);
  return false;
}

export async function waitForMedia(): Promise<HTMLMediaElement> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const media = findMediaElement();
    if (media) return media;
    await delay(200);
  }
  throw new Error("Timed out waiting for YouTube Music player.");
}

async function waitForTrack(videoId: string, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (readCurrentTrack()?.videoId === videoId) return true;
    await delay(200);
  }
  return false;
}

async function delay(durationMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}
