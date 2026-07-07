import { describe, expect, it } from "vitest";
import type { LocalPlaybackState } from "@ytm-party/shared";
import { PlaybackTransitionDetector, looksLikeNaturalTrackAdvance } from "./playback-transition";

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

  it("allows for YouTube Music transitioning before the reported duration", () => {
    const detector = new PlaybackTransitionDetector();
    detector.observe(playback("current", 168));

    expect(detector.observe(playback("youtube-next", 0))).toBe("ended");
  });

  it("does not guess that a track ended from elapsed time alone", () => {
    const detector = new PlaybackTransitionDetector();
    detector.observe({
      track: { videoId: "current" },
      paused: false,
      positionSeconds: 178,
      buffering: false,
    });

    expect(
      detector.observe({
        track: { videoId: "youtube-next" },
        paused: false,
        positionSeconds: 0,
        buffering: false,
      }),
    ).toBe("track_changed");
  });

  it("requires duration evidence before inferring a natural end", () => {
    expect(
      looksLikeNaturalTrackAdvance(
        {
          track: { videoId: "short" },
          paused: false,
          positionSeconds: 18,
          buffering: false,
        },
        18,
      ),
    ).toBe(false);
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
