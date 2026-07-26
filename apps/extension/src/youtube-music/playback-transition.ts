import type { LocalPlaybackState } from "@ytm-party/shared";

export type PlaybackTransition = "ended" | "track_changed" | null;

// YouTube Music can replace the active media before its reported duration is
// exhausted (for example during an automatic transition). Keep this wider
// than the polling interval so those native transitions are not mistaken for
// a deliberate song selection and sent through the host-requeue flow.
export const NATURAL_END_THRESHOLD_SECONDS = 15;

// A separate, much tighter threshold is used when playback stops making
// progress. YouTube Music occasionally leaves the media element just short of
// its reported duration without firing `ended`, which otherwise strands the
// party queue on the current song.
export const STALLED_END_THRESHOLD_SECONDS = 3;
export const STALLED_END_GRACE_MS = 4_000;
const PLAYBACK_MOVEMENT_EPSILON_SECONDS = 0.05;

export function looksLikeNaturalTrackAdvance(
  previous: LocalPlaybackState,
  maxObservedPositionSeconds = 0,
): boolean {
  const position = Math.max(previous.positionSeconds, maxObservedPositionSeconds);
  return isNearTrackEnd({ ...previous, positionSeconds: position });
}

export function isNearTrackEnd(playback: LocalPlaybackState): boolean {
  const duration = playback.durationSeconds;
  if (duration && Number.isFinite(duration) && duration > 0) {
    return duration - playback.positionSeconds <= NATURAL_END_THRESHOLD_SECONDS;
  }
  return false;
}

export class PlaybackEndStallDetector {
  private trackId: string | null = null;
  private lastPositionSeconds = 0;
  private lastMovementAtMs = 0;
  private emittedForTrack = false;

  observe(
    playback: LocalPlaybackState,
    nowMs = Date.now(),
    nativeEnded = false,
  ): boolean {
    const trackId = playback.track?.videoId ?? null;
    const duration = playback.durationSeconds;
    if (
      !trackId ||
      !duration ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      this.reset();
      return false;
    }

    if (trackId !== this.trackId) {
      this.trackId = trackId;
      this.lastPositionSeconds = playback.positionSeconds;
      this.lastMovementAtMs = nowMs;
      this.emittedForTrack = false;
    } else if (
      Math.abs(playback.positionSeconds - this.lastPositionSeconds) >=
      PLAYBACK_MOVEMENT_EPSILON_SECONDS
    ) {
      this.lastPositionSeconds = playback.positionSeconds;
      this.lastMovementAtMs = nowMs;
    }

    if (this.emittedForTrack) return false;
    if (nativeEnded) {
      this.emittedForTrack = true;
      return true;
    }

    // A normal pause is a user control and must remain a pause, even near the
    // end. A paused player that is also buffering is still eligible because
    // YouTube can enter that state when it runs out of media before `ended`.
    if (playback.paused && !playback.buffering) {
      this.lastMovementAtMs = nowMs;
      return false;
    }

    const remainingSeconds = duration - playback.positionSeconds;
    if (
      remainingSeconds < 0 ||
      remainingSeconds > STALLED_END_THRESHOLD_SECONDS
    ) {
      return false;
    }
    if (nowMs - this.lastMovementAtMs < STALLED_END_GRACE_MS) return false;

    this.emittedForTrack = true;
    return true;
  }

  private reset(): void {
    this.trackId = null;
    this.lastPositionSeconds = 0;
    this.lastMovementAtMs = 0;
    this.emittedForTrack = false;
  }
}

export class PlaybackTransitionDetector {
  private previous: LocalPlaybackState | null = null;
  private endedTrackId: string | null = null;

  recordEnded(playback: LocalPlaybackState): void {
    this.previous = playback;
    this.endedTrackId = playback.track?.videoId ?? null;
  }

  observe(playback: LocalPlaybackState): PlaybackTransition {
    const previous = this.previous;
    this.previous = playback;

    const currentTrackId = playback.track?.videoId ?? null;
    const previousTrackId = previous?.track?.videoId ?? null;
    if (!currentTrackId || currentTrackId === previousTrackId) return null;
    if (!previous || !previousTrackId) return "track_changed";

    if (this.endedTrackId === previousTrackId) {
      this.endedTrackId = null;
      return null;
    }

    if (isNearTrackEnd(previous)) return "ended";
    return "track_changed";
  }
}
