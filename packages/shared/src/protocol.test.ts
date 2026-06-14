import { describe, expect, it } from "vitest";
import { isServerMessage, isTrack, trackFieldLimits } from "./protocol";

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

describe("server message validation", () => {
  it("accepts a complete room snapshot", () => {
    expect(
      isServerMessage({
        type: "room.snapshot",
        state: {
          roomId: "room",
          revision: 1,
          hostParticipantId: "host",
          permissions: {
            guestsCanSkip: false,
            guestsCanAddToQueue: true,
          },
          playback: {
            track: null,
            paused: true,
            positionSeconds: 0,
            effectiveAtMs: 1,
          },
          queue: [],
          participants: [
            {
              participantId: "host",
              displayName: "Host",
              role: "host",
              syncStatus: "in_sync",
              connectedAtMs: 1,
              lastSeenAtMs: 1,
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("rejects malformed snapshots and operation results", () => {
    expect(
      isServerMessage({
        type: "room.snapshot",
        state: { roomId: "room", revision: "wrong" },
      }),
    ).toBe(false);
    expect(
      isServerMessage({
        type: "operation.result",
        operationId: "operation",
        accepted: true,
        revision: Number.NaN,
      }),
    ).toBe(false);
  });
});
