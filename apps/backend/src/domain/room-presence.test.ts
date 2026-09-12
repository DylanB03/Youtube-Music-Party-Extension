import { describe, expect, it } from "vitest";
import type { PartyRoomState } from "@ytm-party/shared";
import { hostTransferAtMs, nextPresenceAlarmAtMs } from "./room-presence";

function createRoom(): PartyRoomState {
  return {
    roomId: "room",
    revision: 1,
    hostParticipantId: "host",
    permissions: {
      guestsCanSkip: false,
      guestsCanAddToQueue: true,
      guestsCanRemoveFromQueue: false,
    },
    playback: {
      track: { videoId: "next" },
      paused: true,
      positionSeconds: 0,
      effectiveAtMs: 2_000,
      playbackId: "playback-1",
    },
    playbackPreparation: {
      playbackId: "playback-1",
      deadlineAtMs: 5_000,
      eligibleParticipantIds: ["host"],
      readyParticipantIds: [],
    },
    queue: [],
    participants: [],
    createdAtMs: 1_000,
    lastActivityAtMs: 2_000,
    expiresAtMs: 20_000,
  };
}

describe("room presence alarms", () => {
  it("does not keep scheduling an expired host deadline without a replacement", () => {
    const room = createRoom();
    room.hostDisconnectedAtMs = 1_000;
    room.participants = [{
      participantId: "guest",
      displayName: "Guest",
      role: "guest",
      syncStatus: "in_sync",
      connectedAtMs: 1_000,
      lastSeenAtMs: 1_000,
    }];
    expect(hostTransferAtMs(room, new Set(), 5_000)).toBeUndefined();
    expect(hostTransferAtMs(room, new Set(["guest"]), 5_000)).toBe(6_000);
    expect(hostTransferAtMs(room, new Set(["host", "guest"]), 5_000)).toBeUndefined();
  });

  it("wakes the room at the playback preparation timeout", () => {
    expect(
      nextPresenceAlarmAtMs(
        createRoom(),
        new Set(["host"]),
        1,
        60_000,
        {
          maxAgeMs: 19_000,
          idleTtlMs: 10_000,
          emptyTtlMs: 10_000,
        },
      ),
    ).toBe(5_000);
  });
});
