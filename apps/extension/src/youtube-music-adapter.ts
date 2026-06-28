import type {
  LocalPlaybackEvent,
  LocalPlaybackState,
  PartyPlaybackState,
  Track,
} from "@ytm-party/shared";
import type { PlaybackApplicationResult } from "./playback-application";
import { loadTrack, waitForMedia } from "./youtube-music/navigation";
import { pausePagePlayer } from "./youtube-music/page-bridge";
import { PlaybackTransitionDetector } from "./youtube-music/playback-transition";
import {
  findMediaElement,
  inspectSelectorCoverage,
  readCurrentTrack,
  readPlaybackState,
} from "./youtube-music/selectors";

type Listener = (event: LocalPlaybackEvent) => void;

let lastInterruption: LocalPlaybackState["interruption"];
let suppressLocalEventsUntilMs = 0;
let activePlaybackApplications = 0;

export async function applyPlayback(
  playback: PartyPlaybackState,
): Promise<PlaybackApplicationResult> {
  activePlaybackApplications += 1;
  suppressLocalEventsUntilMs = Date.now() + 2500;

  try {
    if (!playback.track) {
      await pauseLocalPlayback();
      return "applied";
    }

    await loadTrack(playback.track.videoId);

    const media = await waitForMedia();
    media.currentTime = Math.max(0, playback.positionSeconds);
    if (playback.paused) {
      media.pause();
    } else {
      await media.play();
    }
    return "applied";
  } finally {
    activePlaybackApplications = Math.max(0, activePlaybackApplications - 1);
    suppressLocalEventsUntilMs = Date.now() + 750;
  }
}

export function observePlayback(listener: Listener): () => void {
  let observedMedia: HTMLMediaElement | null = null;
  let removeMediaListeners: (() => void) | null = null;
  let lastProgressAtMs = 0;
  const transitions = new PlaybackTransitionDetector();

  const emit = (type: LocalPlaybackEvent["type"]) => {
    if (shouldSuppressLocalEvents()) return;
    listener({ type, playback: readPlaybackState() } as LocalPlaybackEvent);
  };

  const bindMedia = (media: HTMLMediaElement) => {
    const onPlay = () => emit("local.play");
    const onPause = () => emit("local.pause");
    const onSeek = () => emit("local.seek");
    const onEnded = () => {
      const playback = readPlaybackState();
      transitions.recordEnded(playback);
      if (!shouldSuppressLocalEvents()) {
        listener({ type: "local.ended", playback });
      }
    };
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
    const transition = transitions.observe(playback);
    if (transition === "ended") {
      emit("local.ended");
    } else if (transition === "track_changed") {
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
    suppressingLocalEvents: shouldSuppressLocalEvents(),
    activePlaybackApplications,
    lastInterruption,
    selectorCoverage: inspectSelectorCoverage(),
  };
}

export function getPlaybackState(): LocalPlaybackState {
  return readPlaybackState();
}

function shouldSuppressLocalEvents(): boolean {
  return activePlaybackApplications > 0 || Date.now() < suppressLocalEventsUntilMs;
}

async function pauseLocalPlayback(): Promise<void> {
  try {
    await pausePagePlayer();
  } catch {
    findMediaElement()?.pause();
  }
}
