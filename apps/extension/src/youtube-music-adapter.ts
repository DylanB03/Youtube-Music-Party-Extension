import type {
  LocalPlaybackEvent,
  LocalPlaybackState,
  PartyPlaybackState,
  Track,
} from "@ytm-party/shared";
import type { PlaybackApplicationResult } from "./playback-application";
import { loadTrack, waitForMedia } from "./youtube-music/navigation";
import {
  findMediaElement,
  inspectSelectorCoverage,
  readCurrentTrack,
  readPlaybackState,
} from "./youtube-music/selectors";

type Listener = (event: LocalPlaybackEvent) => void;

let lastVideoId: string | null = null;
let lastInterruption: LocalPlaybackState["interruption"];
let suppressLocalEventsUntilMs = 0;

export async function applyPlayback(
  playback: PartyPlaybackState,
): Promise<PlaybackApplicationResult> {
  if (!playback.track) return "applied";
  suppressLocalEventsUntilMs = Date.now() + 2500;

  const trackLoaded = await loadTrack(playback.track.videoId);
  if (!trackLoaded) return "navigating";

  const media = await waitForMedia();
  media.currentTime = Math.max(0, playback.positionSeconds);
  if (playback.paused) {
    media.pause();
  } else {
    await media.play();
  }
  suppressLocalEventsUntilMs = Date.now() + 750;
  return "applied";
}

export function observePlayback(listener: Listener): () => void {
  let observedMedia: HTMLMediaElement | null = null;
  let removeMediaListeners: (() => void) | null = null;
  let lastProgressAtMs = 0;

  const emit = (type: LocalPlaybackEvent["type"]) => {
    if (Date.now() < suppressLocalEventsUntilMs) return;
    listener({ type, playback: readPlaybackState() } as LocalPlaybackEvent);
  };

  const bindMedia = (media: HTMLMediaElement) => {
    const onPlay = () => emit("local.play");
    const onPause = () => emit("local.pause");
    const onSeek = () => emit("local.seek");
    const onEnded = () => emit("local.ended");
    const onWaiting = () => emit("local.buffering");
    const onError = () => emit("local.interruption");
    const onTimeUpdate = () => {
      if (Date.now() - lastProgressAtMs < 2000) return;
      lastProgressAtMs = Date.now();
      emit("local.progress");
    };

    media.addEventListener("play", onPlay);
    media.addEventListener("pause", onPause);
    media.addEventListener("seeked", onSeek);
    media.addEventListener("ended", onEnded);
    media.addEventListener("waiting", onWaiting);
    media.addEventListener("error", onError);
    media.addEventListener("timeupdate", onTimeUpdate);

    removeMediaListeners = () => {
      media.removeEventListener("play", onPlay);
      media.removeEventListener("pause", onPause);
      media.removeEventListener("seeked", onSeek);
      media.removeEventListener("ended", onEnded);
      media.removeEventListener("waiting", onWaiting);
      media.removeEventListener("error", onError);
      media.removeEventListener("timeupdate", onTimeUpdate);
    };
  };

  const interval = window.setInterval(() => {
    const media = findMediaElement();
    if (media && media !== observedMedia) {
      removeMediaListeners?.();
      observedMedia = media;
      bindMedia(media);
    }

    const playback = readPlaybackState();
    const videoId = playback.track?.videoId;
    if (videoId && videoId !== lastVideoId) {
      lastVideoId = videoId;
      emit("local.track_changed");
    }
    if (playback.interruption && playback.interruption !== lastInterruption) {
      emit("local.interruption");
    }
    lastInterruption = playback.interruption;
  }, 500);

  return () => {
    removeMediaListeners?.();
    window.clearInterval(interval);
  };
}

export function getAdapterDiagnostics(
  selectedTrack: Track | null = null,
): Record<string, unknown> {
  const media = findMediaElement();
  return {
    href: location.href,
    currentTrack: readCurrentTrack(),
    lastContextTrack: selectedTrack,
    playback: readPlaybackState(),
    mediaReadyState: media?.readyState ?? null,
    mediaNetworkState: media?.networkState ?? null,
    suppressingLocalEvents: Date.now() < suppressLocalEventsUntilMs,
    lastVideoId,
    lastInterruption,
    selectorCoverage: inspectSelectorCoverage(),
  };
}

export function getPlaybackState(): LocalPlaybackState {
  return readPlaybackState();
}
