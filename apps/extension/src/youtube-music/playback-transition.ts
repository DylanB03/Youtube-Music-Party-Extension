import type { LocalPlaybackState } from "@ytm-party/shared";

export type PlaybackTransition = "ended" | "track_changed" | null;

// YouTube Music can replace the active media before its reported duration is
// exhausted (for example during an automatic transition). Keep this wider
// than the polling interval so those native transitions are not mistaken for
// a deliberate song selection and sent through the host-requeue flow.
export const NATURAL_END_THRESHOLD_SECONDS = 15;

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
