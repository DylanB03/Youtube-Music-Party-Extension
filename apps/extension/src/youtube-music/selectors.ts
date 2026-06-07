import type { LocalPlaybackState, Track } from "@ytm-party/shared";

const SONG_ROW_SELECTOR = [
  "ytmusic-responsive-list-item-renderer",
  "ytmusic-shelf-renderer",
  "ytmusic-two-row-item-renderer",
].join(", ");

const AD_SELECTOR = [
  ".ad-showing",
  ".ytp-ad-player-overlay",
  "ytmusic-player-bar[is-advertisement]",
].join(", ");

const UNAVAILABLE_SELECTOR = [
  "ytmusic-player-error-message-renderer",
  "ytmusic-player-page .error",
].join(", ");

export function findMediaElement(): HTMLMediaElement | null {
  return document.querySelector("video");
}

export function readCurrentTrack(): Track | null {
  const videoId = new URL(location.href).searchParams.get("v");
  if (!videoId) return null;

  const title =
    document.querySelector<HTMLElement>("ytmusic-player-bar .title")?.innerText.trim() ||
    document.title.replace(" - YouTube Music", "").trim();
  const artist =
    document.querySelector<HTMLElement>("ytmusic-player-bar .subtitle")?.innerText.trim() ||
    undefined;

  return {
    videoId,
    title: title || undefined,
    artist,
  };
}

export function readPlaybackState(): LocalPlaybackState {
  const media = findMediaElement();
  return {
    track: readCurrentTrack(),
    paused: media?.paused ?? true,
    positionSeconds: media?.currentTime ?? 0,
    durationSeconds: Number.isFinite(media?.duration) ? media?.duration : undefined,
    buffering: Boolean(media && media.readyState < HTMLMediaElement.HAVE_FUTURE_DATA),
    interruption: detectInterruption(media),
  };
}

export function findTrackFromTarget(target: EventTarget | null): Track | null {
  const element = target instanceof Element ? target : null;
  const link = element?.closest<HTMLAnchorElement>('a[href*="watch?v="]');
  if (!link) return null;

  const videoId = new URL(link.href).searchParams.get("v");
  if (!videoId) return null;

  const row = link.closest<HTMLElement>(SONG_ROW_SELECTOR);
  const title =
    row?.querySelector<HTMLElement>(".title, yt-formatted-string.title")?.innerText.trim() ||
    link.textContent?.trim() ||
    undefined;
  const artist =
    row?.querySelector<HTMLElement>(".secondary-flex-columns, .subtitle")?.textContent?.trim() ||
    undefined;
  return { videoId, title, artist };
}

export function findTrackLink(videoId: string): HTMLAnchorElement | null {
  const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="watch?v="]');
  for (const link of links) {
    const candidateId = new URL(link.href).searchParams.get("v");
    if (candidateId === videoId) return link;
  }
  return null;
}

function detectInterruption(
  media: HTMLMediaElement | null,
): LocalPlaybackState["interruption"] {
  if (media?.error || document.querySelector(UNAVAILABLE_SELECTOR)) {
    return "unavailable";
  }
  if (document.querySelector(AD_SELECTOR)) {
    return "advertisement";
  }
  return undefined;
}
