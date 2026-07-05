import { describe, expect, it } from "vitest";
import {
  resolvePagePlayerTrack,
  sanitizeTrackTitle,
} from "./player-metadata";

describe("YouTube Music player metadata", () => {
  it("uses verified video data for the active track", () => {
    expect(
      resolvePagePlayerTrack(
        {
          video_id: "video-1",
          title: "Correct Song",
          author: "Correct Artist",
        },
        undefined,
        "stale-url-video",
      ),
    ).toEqual({
      videoId: "video-1",
      title: "Correct Song",
      artist: "Correct Artist",
    });
  });

  it("falls back to player response metadata", () => {
    expect(
      resolvePagePlayerTrack(
        undefined,
        {
          videoDetails: {
            videoId: "video-2",
            title: "Response Song",
            author: "Response Artist",
          },
        },
        null,
      ),
    ).toMatchObject({
      videoId: "video-2",
      title: "Response Song",
      artist: "Response Artist",
    });
  });

  it("never treats the application name as a song title", () => {
    expect(sanitizeTrackTitle("YouTube Music")).toBeUndefined();
    expect(sanitizeTrackTitle("YouTube")).toBeUndefined();
    expect(sanitizeTrackTitle("Actual Song - YouTube Music")).toBe("Actual Song");
  });
});
