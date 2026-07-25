import type { Track } from "@ytm-party/shared";

export type PagePlayerVideoData = {
  video_id?: string;
  videoId?: string;
  title?: string;
  author?: string;
  thumbnail?: PagePlayerThumbnailCollection;
};

export type PagePlayerResponse = {
  videoDetails?: {
    videoId?: string;
    externalVideoId?: string;
    title?: string;
    author?: string;
    thumbnail?: PagePlayerThumbnailCollection;
  };
};

type PagePlayerThumbnailCollection = {
  thumbnails?: PagePlayerThumbnail[];
};

type PagePlayerThumbnail = {
  url?: string;
  width?: number;
  height?: number;
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

  const thumbnailUrl = selectLargestThumbnailUrl(
    videoData?.thumbnail?.thumbnails ??
      details?.thumbnail?.thumbnails ??
      [],
  );

  return {
    videoId,
    title: sanitizeTrackTitle(videoData?.title ?? details?.title),
    artist: videoData?.author?.trim() || details?.author?.trim() || undefined,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };
}

function selectLargestThumbnailUrl(
  thumbnails: PagePlayerThumbnail[],
): string | undefined {
  return thumbnails.reduce<PagePlayerThumbnail | undefined>((best, thumbnail) => {
    if (!thumbnail.url?.trim()) return best;
    if (!best) return thumbnail;
    const area = (thumbnail.width ?? 0) * (thumbnail.height ?? 0);
    const bestArea = (best.width ?? 0) * (best.height ?? 0);
    return area >= bestArea ? thumbnail : best;
  }, undefined)?.url?.trim();
}
