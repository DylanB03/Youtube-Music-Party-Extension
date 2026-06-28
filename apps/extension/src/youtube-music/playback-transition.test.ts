import { describe, expect, it } from "vitest";
import type { LocalPlaybackState } from "@ytm-party/shared";
import { PlaybackTransitionDetector } from "./playback-transition";

function playback(
  videoId: string,
  positionSeconds: number,
  durationSeconds = 180,
): LocalPlaybackState {
  return {
    track: { videoId },
    paused: false,
    positionSeconds,
    durationSeconds,
    buffering: false,
  };
}

describe("YouTube Music playback transitions", () => {
  it("treats a track swap near the end as a natural end", () => {
    const detector = new PlaybackTransitionDetector();
    detector.observe(playback("current", 178));

    expect(detector.observe(playback("youtube-next", 0))).toBe("ended");
  });

  it("treats an early track swap as a user track change", () => {
    const detector = new PlaybackTransitionDetector();
    detector.observe(playback("current", 40));

    expect(detector.observe(playback("chosen-track", 0))).toBe("track_changed");
  });

  it("suppresses the track swap after an ended event was already emitted", () => {
    const detector = new PlaybackTransitionDetector();
    const ended = playback("current", 180);
    detector.observe(ended);
    detector.recordEnded(ended);

    expect(detector.observe(playback("youtube-next", 0))).toBeNull();
  });
});
