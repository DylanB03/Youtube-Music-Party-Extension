import { describe, expect, it } from "vitest";
import type { LocalPlaybackState } from "@ytm-party/shared";
import {
  PlaybackEndStallDetector,
  PlaybackTransitionDetector,
  looksLikeNaturalTrackAdvance,
} from "./playback-transition";

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

  it("recovers a playing track that stalls in its final seconds", () => {
    const detector = new PlaybackEndStallDetector();
    const stalled = playback("current", 178);

    expect(detector.observe(stalled, 1_000)).toBe(false);
    expect(detector.observe(stalled, 4_999)).toBe(false);
    expect(detector.observe(stalled, 5_000)).toBe(true);
    expect(detector.observe(stalled, 10_000)).toBe(false);
  });

  it("does not mistake slow but moving playback for a stalled end", () => {
    const detector = new PlaybackEndStallDetector();

    expect(detector.observe(playback("current", 177), 1_000)).toBe(false);
    expect(detector.observe(playback("current", 178), 4_000)).toBe(false);
    expect(detector.observe(playback("current", 179), 7_000)).toBe(false);
    expect(detector.observe(playback("current", 179), 10_999)).toBe(false);
    expect(detector.observe(playback("current", 179), 11_000)).toBe(true);
  });

  it("keeps an intentional near-end pause paused", () => {
    const detector = new PlaybackEndStallDetector();
    const paused = {
      ...playback("current", 179),
      paused: true,
    };

    expect(detector.observe(paused, 1_000)).toBe(false);
    expect(detector.observe(paused, 10_000)).toBe(false);
    expect(detector.observe({ ...paused, paused: false }, 10_001)).toBe(false);
    expect(detector.observe({ ...paused, paused: false }, 14_001)).toBe(true);
  });

  it("recovers a near-end pause caused by buffering", () => {
    const detector = new PlaybackEndStallDetector();
    const buffering = {
      ...playback("current", 179),
      paused: true,
      buffering: true,
    };

    expect(detector.observe(buffering, 1_000)).toBe(false);
    expect(detector.observe(buffering, 5_000)).toBe(true);
  });

  it("recognizes a missed native ended event immediately", () => {
    const detector = new PlaybackEndStallDetector();
    const ended = {
      ...playback("current", 180),
      paused: true,
    };

    expect(detector.observe(ended, 1_000, true)).toBe(true);
    expect(detector.observe(ended, 1_001, true)).toBe(false);
  });

  it("resets the stall timer when the active track changes", () => {
    const detector = new PlaybackEndStallDetector();

    expect(detector.observe(playback("current", 179), 1_000)).toBe(false);
    expect(detector.observe(playback("next", 179), 5_000)).toBe(false);
    expect(detector.observe(playback("next", 179), 9_000)).toBe(true);
  });
});
