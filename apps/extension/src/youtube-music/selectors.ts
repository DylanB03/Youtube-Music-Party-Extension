import type { LocalPlaybackState, Track } from "@ytm-party/shared";
import { sanitizeTrackTitle } from "./player-metadata";

const SONG_ROW_SELECTOR = [
  "ytmusic-responsive-list-item-renderer",
  "ytmusic-two-row-item-renderer",
  "ytmusic-player-queue-item",
  ".card-content-container",
  "ytmusic-player-bar",
  "ytmusic-playlist-shelf-renderer",
].join(", ");

const MENU_TRIGGER_SELECTOR = [
  "button",
  '[role="button"]',
  "ytmusic-menu-renderer",
  "yt-button-shape",
  "tp-yt-paper-icon-button",
  '[data-id="menu"]',
  ".dropdown-trigger",
].join(", ");

const TITLE_SELECTOR = [
  ".title",
  "#title",
  ".song-title",
  ".title-column yt-formatted-string:first-of-type",
  ".song-info yt-formatted-string:first-of-type",
  'yt-formatted-string[role="heading"]',
].join(", ");

const ARTIST_SELECTOR = [
  ".secondary-flex-columns a:first-of-type",
  ".secondary-flex-columns yt-formatted-string:first-of-type",
  ".subtitle a:first-of-type",
  ".subtitle",
  ".byline a:first-of-type",
  ".byline",
  ".song-info yt-formatted-string:nth-of-type(2)",
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
  const thumbnailUrl =
    playerTrack?.thumbnailUrl ??
    readThumbnailUrl(document.querySelector("ytmusic-player-bar"));

  return {
    videoId,
    title: title || undefined,
    artist,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
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
    playbackRate: media?.playbackRate ?? 1,
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
    readVideoIdFromAttributes(row) ??
    readVideoIdFromRendererData(row) ??
    readVideoIdFromThumbnail(row);
  if (!videoId) return null;

  const trackRow = row ?? link?.closest<HTMLElement>(SONG_ROW_SELECTOR);
  const formattedStrings = Array.from(
    trackRow?.querySelectorAll<HTMLElement>("yt-formatted-string") ?? [],
  )
    .map(readElementText)
    .filter((value): value is string => Boolean(value));
  const title =
    readElementText(trackRow?.querySelector<HTMLElement>(TITLE_SELECTOR)) ??
    readElementText(link) ??
    formattedStrings[0];
  const artist =
    readElementText(trackRow?.querySelector<HTMLElement>(ARTIST_SELECTOR)) ??
    formattedStrings.find((value) => value !== title);
  const thumbnailUrl = readThumbnailUrl(trackRow);
  return {
    videoId,
    title,
    artist,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };
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
      '[aria-haspopup="true"], [aria-haspopup="menu"], [data-id="menu"], .dropdown-trigger',
    ) ||
    Boolean(
      trigger.closest(
        'ytmusic-menu-renderer[aria-haspopup="menu"], ytmusic-menu-renderer[dropdown-only]',
      ),
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

function readVideoIdFromAttributes(
  root: Element | null | undefined,
): string | null {
  if (!root) return null;
  const candidates = [
    root,
    ...root.querySelectorAll<HTMLElement>("[data-video-id], [video-id]"),
  ];
  for (const candidate of candidates) {
    const videoId =
      candidate.getAttribute("data-video-id") ??
      candidate.getAttribute("video-id");
    if (videoId?.trim()) return videoId.trim();
  }
  return null;
}

function readVideoIdFromRendererData(
  root: Element | null | undefined,
): string | null {
  if (!root) return null;
  const dataHosts = [
    root,
    ...root.querySelectorAll<HTMLElement>(
      "ytmusic-play-button-renderer, ytmusic-menu-renderer, ytmusic-item-thumbnail-overlay-renderer",
    ),
  ];
  const cardRenderer = root.closest<HTMLElement>("ytmusic-card-shelf-renderer");
  if (cardRenderer) dataHosts.push(cardRenderer);

  for (const host of dataHosts) {
    try {
      const data = (host as HTMLElement & { data?: unknown }).data;
      const videoId = findVideoIdInRendererData(data);
      if (videoId) return videoId;
    } catch {
      // Renderer data is an optional fallback and may be hidden behind a
      // page-world getter. Continue to the artwork-based fallback.
    }
  }
  return null;
}

export function findVideoIdInRendererData(
  value: unknown,
  depth = 0,
  visited: Set<object> = new Set(),
): string | null {
  if (
    !value ||
    typeof value !== "object" ||
    depth > 6 ||
    visited.size >= 250
  ) {
    return null;
  }
  if (visited.has(value)) return null;
  visited.add(value);

  const record = value as Record<string, unknown>;
  if (typeof record.videoId === "string" && record.videoId.trim()) {
    return record.videoId.trim();
  }

  const priorityKeys = [
    "playlistItemData",
    "navigationEndpoint",
    "watchEndpoint",
    "playNavigationEndpoint",
    "playlistPanelVideoRenderer",
    "musicResponsiveListItemRenderer",
    "musicTwoRowItemRenderer",
    "overlay",
  ];
  for (const key of priorityKeys) {
    const videoId = findVideoIdInRendererData(
      record[key],
      depth + 1,
      visited,
    );
    if (videoId) return videoId;
  }

  for (const nested of Array.isArray(value)
    ? value
    : Object.values(record)) {
    const videoId = findVideoIdInRendererData(nested, depth + 1, visited);
    if (videoId) return videoId;
  }
  return null;
}

function readVideoIdFromThumbnail(
  root: ParentNode | null | undefined,
): string | null {
  const thumbnailUrl = readThumbnailUrl(root);
  if (!thumbnailUrl) return null;
  return videoIdFromThumbnailUrl(thumbnailUrl);
}

export function videoIdFromThumbnailUrl(thumbnailUrl: string): string | null {
  try {
    const pathname = new URL(thumbnailUrl).pathname;
    const match = pathname.match(/\/(?:vi|vi_webp|an_webp)\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function readElementText(
  element: Element | null | undefined,
): string | undefined {
  return element?.textContent?.replace(/\s+/g, " ").trim() || undefined;
}

function readThumbnailUrl(root: ParentNode | null | undefined): string | undefined {
  const images = root?.querySelectorAll<HTMLImageElement>(
    "yt-img-shadow img, .thumbnail img, img",
  );
  if (!images) return undefined;

  for (const image of images) {
    const candidates = [
      image.currentSrc,
      image.getAttribute("src"),
      image.getAttribute("data-src"),
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        const url = new URL(candidate, location.href);
        if (
          (url.protocol === "https:" || url.protocol === "http:") &&
          url.href.length <= 2_048
        ) {
          return url.href;
        }
      } catch {
        // Ignore placeholders and malformed lazy-loading values.
      }
    }
  }
  return undefined;
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
