import { findMediaElement, findTrackLink } from "./selectors";
import { getPagePlayerVideoId } from "./page-bridge";

const TRACK_NAVIGATION_TIMEOUT_MS = 10_000;

export async function loadTrack(videoId: string): Promise<void> {
  if ((await readVerifiedPlayerVideoId()) === videoId) return;

  const targetUrl = new URL("/watch", location.origin);
  targetUrl.searchParams.set("v", videoId);
  const existingLink = findTrackLink(videoId);
  if (existingLink) {
    dispatchGuardedEndpointClick(existingLink);
    if (await waitForTrack(videoId, 2_500)) {
      return;
    }
  }

  dispatchYouTubeMusicNavigation(videoId, targetUrl);
  if (await waitForTrack(videoId, TRACK_NAVIGATION_TIMEOUT_MS)) {
    return;
  }

  throw new Error("YouTube Music did not accept the in-page track navigation.");
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
    if ((await readVerifiedPlayerVideoId()) === videoId) return true;
    await delay(200);
  }
  return false;
}

async function readVerifiedPlayerVideoId(): Promise<string | null> {
  try {
    return await getPagePlayerVideoId();
  } catch {
    // Do not fall back to the URL here. The URL can be updated before
    // YouTube Music's app/player state has actually switched tracks, which can
    // leave the visible player bar showing one song while the media element
    // plays another.
    return null;
  }
}

function dispatchYouTubeMusicNavigation(videoId: string, url: URL): void {
  const endpoint = {
    commandMetadata: {
      webCommandMetadata: {
        url: `${url.pathname}${url.search}`,
        webPageType: "WEB_PAGE_TYPE_WATCH",
      },
    },
    watchEndpoint: { videoId },
  };
  document.dispatchEvent(
    new CustomEvent("yt-navigate", {
      bubbles: true,
      composed: true,
      detail: { endpoint },
    }),
  );

  const endpointLink = document.createElement("a");
  endpointLink.className = "yt-simple-endpoint";
  endpointLink.href = url.href;
  endpointLink.hidden = true;
  document.body.append(endpointLink);
  dispatchGuardedEndpointClick(endpointLink);
  endpointLink.remove();
}

function dispatchGuardedEndpointClick(link: HTMLAnchorElement): void {
  const preventBrowserNavigation = (event: MouseEvent) => {
    event.preventDefault();
  };
  window.addEventListener("click", preventBrowserNavigation, { once: true });
  link.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
    }),
  );
}

async function delay(durationMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}
