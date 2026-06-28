import type { LocalPlaybackState } from "@ytm-party/shared";

export type PlaybackTransition = "ended" | "track_changed" | null;

const NATURAL_END_THRESHOLD_SECONDS = 3;

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

function isNearTrackEnd(playback: LocalPlaybackState): boolean {
  const duration = playback.durationSeconds;
  if (!duration || !Number.isFinite(duration)) return false;
  return duration - playback.positionSeconds <= NATURAL_END_THRESHOLD_SECONDS;
}
