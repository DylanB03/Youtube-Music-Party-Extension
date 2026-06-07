import { describe, expect, it } from "vitest";
import {
  currentPlaybackPositionSeconds,
  estimateClockOffsetMs,
  shouldCorrectDrift,
  shouldMarkOutOfSync,
} from "./sync";

const playback = {
  track: { videoId: "track-a" },
  paused: false,
  positionSeconds: 10,
  effectiveAtMs: 1_000,
};

describe("playback synchronization", () => {
  it("advances a playing track from its effective timestamp", () => {
    expect(currentPlaybackPositionSeconds(playback, 3_500)).toBe(12.5);
  });

  it("keeps paused playback fixed", () => {
    expect(
      currentPlaybackPositionSeconds(
        {
          ...playback,
          paused: true,
        },
        20_000,
      ),
    ).toBe(10);
  });

  it("distinguishes correctable and rejoin-level drift", () => {
    expect(shouldCorrectDrift(12, playback, 3_000)).toBe(false);
    expect(shouldCorrectDrift(12.5, playback, 3_000)).toBe(true);
    expect(shouldMarkOutOfSync(15, playback, 3_000)).toBe(true);
  });

  it("estimates server clock offset using half the round trip", () => {
    expect(estimateClockOffsetMs(1_000, 1_200, 1_150)).toBe(50);
  });
});
