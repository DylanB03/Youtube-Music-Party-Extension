import type { LocalPlaybackState, Track } from "@ytm-party/shared";
import { sanitizeTrackTitle } from "./player-metadata";

const SONG_ROW_SELECTOR = [
  "ytmusic-responsive-list-item-renderer",
  "ytmusic-two-row-item-renderer",
  "ytmusic-player-queue-item",
  "ytmusic-playlist-shelf-renderer",
].join(", ");

const MENU_TRIGGER_SELECTOR = [
  'button[aria-haspopup="true"]',
  'button[aria-label*="More"]',
  'button[aria-label*="Action menu"]',
  'button[title*="More"]',
  'tp-yt-paper-icon-button[aria-label*="More"]',
  'yt-button-shape[aria-label*="More"]',
  'yt-button-shape[aria-label*="Action menu"]',
  '[data-id="menu"]',
  ".dropdown-trigger",
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

export function readCurrentTrack(playerTrack?: Track | null): Track | null {
  const videoId =
    playerTrack?.videoId ?? new URL(location.href).searchParams.get("v");
  if (!videoId) return null;

  const title =
    sanitizeTrackTitle(playerTrack?.title) ??
    sanitizeTrackTitle(
      document.querySelector<HTMLElement>("ytmusic-player-bar .title")?.innerText,
    ) ??
    sanitizeTrackTitle(document.title);
  const artist =
    playerTrack?.artist?.trim() ||
    document.querySelector<HTMLElement>("ytmusic-player-bar .subtitle")?.innerText.trim() ||
    undefined;

  return {
    videoId,
    title: title || undefined,
    artist,
  };
}

export function readPlaybackState(playerTrack?: Track | null): LocalPlaybackState {
  const media = findMediaElement();
  return {
    track: readCurrentTrack(playerTrack),
    paused: media?.paused ?? true,
    positionSeconds: media?.currentTime ?? 0,
    durationSeconds: Number.isFinite(media?.duration) ? media?.duration : undefined,
    buffering: Boolean(media && media.readyState < HTMLMediaElement.HAVE_FUTURE_DATA),
    interruption: detectInterruption(media),
  };
}

export function findTrackFromTarget(target: EventTarget | null): Track | null {
  const element = target instanceof Element ? target : null;
  const row = element?.closest<HTMLElement>(SONG_ROW_SELECTOR);
  const link =
    element?.closest<HTMLAnchorElement>('a[href*="watch?v="]') ??
    row?.querySelector<HTMLAnchorElement>('a[href*="watch?v="]');
  const videoId =
    readVideoIdFromLink(link) ??
    row?.dataset.videoId ??
    row?.querySelector<HTMLElement>("[data-video-id]")?.dataset.videoId;
  if (!videoId) return null;

  const trackRow = row ?? link?.closest<HTMLElement>(SONG_ROW_SELECTOR);
  const title =
    trackRow
      ?.querySelector<HTMLElement>(".title, yt-formatted-string.title")
      ?.innerText.trim() ||
    link?.textContent?.trim() ||
    undefined;
  const artist =
    trackRow
      ?.querySelector<HTMLElement>(".secondary-flex-columns, .subtitle")
      ?.textContent?.trim() ||
    undefined;
  return { videoId, title, artist };
}

export function findTrackFromEvent(event: Event): Track | null {
  for (const target of event.composedPath()) {
    const track = findTrackFromTarget(target);
    if (track) return track;
  }
  return findTrackFromTarget(event.target);
}

export function isSongMenuTrigger(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  const trigger = element?.closest<HTMLElement>(MENU_TRIGGER_SELECTOR);
  if (!trigger) return false;

  const label = `${trigger.getAttribute("aria-label") ?? ""} ${
    trigger.getAttribute("title") ?? ""
  }`.toLowerCase();
  return (
    label.includes("more") ||
    label.includes("action menu") ||
    trigger.matches(
      '[aria-haspopup="true"], [data-id="menu"], .dropdown-trigger',
    )
  );
}

export function isSongMenuEvent(event: Event): boolean {
  for (const target of event.composedPath()) {
    if (isSongMenuTrigger(target)) return true;
  }
  return isSongMenuTrigger(event.target);
}

export function findTrackLink(videoId: string): HTMLAnchorElement | null {
  const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="watch?v="]');
  for (const link of links) {
    const candidateId = readVideoIdFromLink(link);
    if (candidateId === videoId) return link;
  }
  return null;
}

export function inspectSelectorCoverage(): Record<string, number> {
  return {
    songRows: document.querySelectorAll(SONG_ROW_SELECTOR).length,
    watchLinks: document.querySelectorAll('a[href*="watch?v="]').length,
    menuTriggers: document.querySelectorAll(MENU_TRIGGER_SELECTOR).length,
    advertisements: document.querySelectorAll(AD_SELECTOR).length,
    unavailableStates: document.querySelectorAll(UNAVAILABLE_SELECTOR).length,
  };
}

function readVideoIdFromLink(
  link: HTMLAnchorElement | null | undefined,
): string | null {
  if (!link) return null;
  try {
    return new URL(link.href, location.href).searchParams.get("v");
  } catch {
    return null;
  }
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
