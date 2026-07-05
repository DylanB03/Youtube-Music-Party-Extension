import type { Track } from "@ytm-party/shared";

export type PagePlayerVideoData = {
  video_id?: string;
  videoId?: string;
  title?: string;
  author?: string;
};

export type PagePlayerResponse = {
  videoDetails?: {
    videoId?: string;
    externalVideoId?: string;
    title?: string;
    author?: string;
  };
};

const GENERIC_TITLES = new Set(["youtube", "youtube music"]);

export function sanitizeTrackTitle(value: string | null | undefined): string | undefined {
  const title = value?.replace(/\s+-\s+YouTube Music$/i, "").trim();
  if (!title || GENERIC_TITLES.has(title.toLowerCase())) return undefined;
  return title;
}

export function resolvePagePlayerTrack(
  videoData: PagePlayerVideoData | undefined,
  playerResponse: PagePlayerResponse | undefined,
  fallbackVideoId: string | null,
): Track | null {
  const details = playerResponse?.videoDetails;
  const videoId =
    videoData?.video_id ??
    videoData?.videoId ??
    details?.videoId ??
    details?.externalVideoId ??
    fallbackVideoId;
  if (!videoId) return null;

  return {
    videoId,
    title: sanitizeTrackTitle(videoData?.title ?? details?.title),
    artist: videoData?.author?.trim() || details?.author?.trim() || undefined,
  };
}
