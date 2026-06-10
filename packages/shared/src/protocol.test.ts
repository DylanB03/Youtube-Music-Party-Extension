import { describe, expect, it } from "vitest";
import { isTrack, trackFieldLimits } from "./protocol";

describe("protocol limits", () => {
  it("accepts bounded track metadata", () => {
    expect(
      isTrack({
        videoId: "track",
        title: "Title",
        artist: "Artist",
        durationSeconds: 120,
      }),
    ).toBe(true);
  });

  it("rejects oversized or invalid track metadata", () => {
    expect(
      isTrack({
        videoId: "x".repeat(trackFieldLimits.videoId + 1),
      }),
    ).toBe(false);
    expect(
      isTrack({
        videoId: "track",
        title: "x".repeat(trackFieldLimits.title + 1),
      }),
    ).toBe(false);
    expect(isTrack({ videoId: "track", durationSeconds: -1 })).toBe(false);
  });
});
