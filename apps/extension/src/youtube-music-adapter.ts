import type {
  LocalPlaybackEvent,
  LocalPlaybackState,
  PartyPlaybackState,
  Track,
} from "@ytm-party/shared";
import {
  currentPlaybackPositionSeconds,
  DRIFT_IGNORE_SECONDS,
} from "@ytm-party/shared";
import type { PlaybackApplicationResult } from "./playback-application";
import { loadTrack, waitForMedia } from "./youtube-music/navigation";
import {
  getPagePlayerTrack,
  pausePagePlayer,
} from "./youtube-music/page-bridge";
import {
  PlaybackEndStallDetector,
  PlaybackTransitionDetector,
  isNearTrackEnd,
} from "./youtube-music/playback-transition";
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
let lastPagePlayerTrack: Track | null = null;
let playbackRateResetTimer: number | null = null;

const MEDIA_READY_TIMEOUT_MS = 8_000;
const MEDIA_SEEK_TIMEOUT_MS = 2_000;

export async function applyPlayback(
  playback: PartyPlaybackState,
): Promise<PlaybackApplicationResult> {
  activePlaybackApplications += 1;
  suppressLocalEventsUntilMs = Date.now() + 2500;

  try {
    resetPlaybackRate();
    if (!playback.track) {
      await pauseLocalPlayback();
      return "applied";
    }

    await loadTrack(playback.track.videoId);

    const media = await waitForMedia();
    media.pause();
    await waitForPlayableMedia(media);
    await seekMedia(
      media,
      currentPlaybackPositionSeconds(playback, Date.now()),
    );
    if (playback.paused) {
      return "applied";
    } else {
      const startDelayMs = playback.effectiveAtMs - Date.now();
      if (startDelayMs > 0) {
        await delay(startDelayMs);
      }
      if (Date.now() - playback.effectiveAtMs > DRIFT_IGNORE_SECONDS * 1_000) {
        await seekMedia(
          media,
          currentPlaybackPositionSeconds(playback, Date.now()),
        );
      }
      await media.play();
    }
    return "applied";
  } finally {
    activePlaybackApplications = Math.max(0, activePlaybackApplications - 1);
    suppressLocalEventsUntilMs = Date.now() + 750;
  }
}

export async function adjustPlaybackRate(
  playbackRate: number,
  durationMs: number,
): Promise<void> {
  const media = await waitForMedia();
  resetPlaybackRate();
  const safeRate = Math.max(0.9, Math.min(1.1, playbackRate));
  media.preservesPitch = true;
  media.playbackRate = safeRate;
  if (safeRate === 1 || durationMs <= 0) return;

  playbackRateResetTimer = window.setTimeout(() => {
    playbackRateResetTimer = null;
    const activeMedia = findMediaElement();
    if (activeMedia) activeMedia.playbackRate = 1;
  }, Math.max(100, durationMs));
}

export function observePlayback(listener: Listener): () => void {
  let observedMedia: HTMLMediaElement | null = null;
  let removeMediaListeners: (() => void) | null = null;
  let lastProgressAtMs = 0;
  let nearNaturalEndLatch = false;
  let pollInFlight = false;
  const transitions = new PlaybackTransitionDetector();
  const endStalls = new PlaybackEndStallDetector();

  const emit = (type: LocalPlaybackEvent["type"]) => {
    if (shouldSuppressLocalEvents()) return;
    listener({
      type,
      playback: readPlaybackState(lastPagePlayerTrack),
    } as LocalPlaybackEvent);
  };

  const bindMedia = (media: HTMLMediaElement) => {
    const onPlay = () => emit("local.play");
    const onPause = () => emit("local.pause");
    const latchNearEnd = () => {
      const playback = readPlaybackState(lastPagePlayerTrack);
      if (isNearTrackEnd(playback)) nearNaturalEndLatch = true;
    };
    const onSeek = () => {
      latchNearEnd();
      emit("local.seek");
    };
    const onEnded = () => {
      const playback = readPlaybackState(lastPagePlayerTrack);
      transitions.recordEnded(playback);
      endStalls.observe(playback, Date.now(), true);
      if (!shouldSuppressLocalEvents()) {
        listener({ type: "local.ended", playback });
      }
    };
    const onWaiting = () => emit("local.buffering");
    const onError = () => emit("local.interruption");
    const onTimeUpdate = () => {
      latchNearEnd();
      if (Date.now() - lastProgressAtMs < 2000) return;
      lastProgressAtMs = Date.now();
      emit("local.progress");
    };

    media.addEventListener("play", onPlay);
    media.addEventListener("pause", onPause);
    media.addEventListener("seeking", latchNearEnd);
    media.addEventListener("seeked", onSeek);
    media.addEventListener("ended", onEnded);
    media.addEventListener("waiting", onWaiting);
    media.addEventListener("error", onError);
    media.addEventListener("timeupdate", onTimeUpdate);

    removeMediaListeners = () => {
      media.removeEventListener("play", onPlay);
      media.removeEventListener("pause", onPause);
      media.removeEventListener("seeking", latchNearEnd);
      media.removeEventListener("seeked", onSeek);
      media.removeEventListener("ended", onEnded);
      media.removeEventListener("waiting", onWaiting);
      media.removeEventListener("error", onError);
      media.removeEventListener("timeupdate", onTimeUpdate);
    };
  };

  const pollPlayback = async () => {
    if (pollInFlight) return;
    pollInFlight = true;
    try {
      const pagePlayerTrack = await getPagePlayerTrack();
      if (pagePlayerTrack) lastPagePlayerTrack = pagePlayerTrack;

      const media = findMediaElement();
      if (media && media !== observedMedia) {
        removeMediaListeners?.();
        observedMedia = media;
        bindMedia(media);
      }

      const playback = readPlaybackState(lastPagePlayerTrack);
      if (
        !shouldSuppressLocalEvents() &&
        endStalls.observe(playback, Date.now(), media?.ended ?? false)
      ) {
        transitions.recordEnded(playback);
        listener({ type: "local.ended", playback });
      }
      const transition = transitions.observe(playback);
      if (
        transition === "ended" ||
        (transition === "track_changed" && nearNaturalEndLatch)
      ) {
        nearNaturalEndLatch = false;
        emit("local.ended");
      } else if (transition === "track_changed") {
        emit("local.track_changed");
      }
      if (playback.interruption && playback.interruption !== lastInterruption) {
        emit("local.interruption");
      }
      lastInterruption = playback.interruption;
    } catch {
      // The page bridge can be unavailable briefly while YouTube Music boots.
      // Media event listeners continue using the last verified player video ID.
    } finally {
      pollInFlight = false;
    }
  };

  const interval = window.setInterval(() => {
    void pollPlayback();
  }, 500);
  void pollPlayback();

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
    currentTrack: readCurrentTrack(lastPagePlayerTrack),
    pagePlayerVideoId: lastPagePlayerTrack?.videoId ?? null,
    lastContextTrack: selectedTrack,
    playback: readPlaybackState(lastPagePlayerTrack),
    mediaReadyState: media?.readyState ?? null,
    mediaNetworkState: media?.networkState ?? null,
    playbackRate: media?.playbackRate ?? null,
    suppressingLocalEvents: shouldSuppressLocalEvents(),
    activePlaybackApplications,
    lastInterruption,
    selectorCoverage: inspectSelectorCoverage(),
  };
}

export async function getPlaybackState(): Promise<LocalPlaybackState> {
  try {
    const pagePlayerTrack = await getPagePlayerTrack();
    if (pagePlayerTrack) lastPagePlayerTrack = pagePlayerTrack;
  } catch {
    // Fall back to the URL until the page-owned player API is ready.
  }
  return readPlaybackState(lastPagePlayerTrack);
}

function shouldSuppressLocalEvents(): boolean {
  return activePlaybackApplications > 0 || Date.now() < suppressLocalEventsUntilMs;
}

function resetPlaybackRate(): void {
  if (playbackRateResetTimer !== null) {
    window.clearTimeout(playbackRateResetTimer);
    playbackRateResetTimer = null;
  }
  const media = findMediaElement();
  if (media && media.playbackRate !== 1) media.playbackRate = 1;
}

async function waitForPlayableMedia(media: HTMLMediaElement): Promise<void> {
  if (media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      media.removeEventListener("canplay", onCanPlay);
      resolve();
    };
    const checkReadyState = () => {
      if (media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) finish();
    };
    const onCanPlay = () => finish();
    const poll = window.setInterval(checkReadyState, 50);
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      media.removeEventListener("canplay", onCanPlay);
      reject(new Error("Timed out waiting for media canplay."));
    }, MEDIA_READY_TIMEOUT_MS);
    media.addEventListener("canplay", onCanPlay, { once: true });
    checkReadyState();
  });
}

async function seekMedia(
  media: HTMLMediaElement,
  positionSeconds: number,
): Promise<void> {
  const target = Math.max(0, positionSeconds);
  if (Math.abs(media.currentTime - target) <= 0.02 && !media.seeking) return;

  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      window.clearTimeout(timeout);
      media.removeEventListener("seeked", finish);
      resolve();
    };
    const timeout = window.setTimeout(() => {
      media.removeEventListener("seeked", finish);
      reject(new Error("Timed out waiting for media seeked."));
    }, MEDIA_SEEK_TIMEOUT_MS);
    media.addEventListener("seeked", finish, { once: true });
    media.currentTime = target;
    queueMicrotask(() => {
      if (!media.seeking && Math.abs(media.currentTime - target) <= 0.02) {
        finish();
      }
    });
  });
}

async function delay(durationMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

async function pauseLocalPlayback(): Promise<void> {
  try {
    await pausePagePlayer();
  } catch {
    findMediaElement()?.pause();
  }
}
