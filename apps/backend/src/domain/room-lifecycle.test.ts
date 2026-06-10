import { describe, expect, it } from "vitest";
import type { PartyRoomState } from "@ytm-party/shared";
import {
  nextRoomExpirationAtMs,
  roomShouldExpire,
} from "./room-lifecycle";

function createState(): PartyRoomState {
  return {
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
      effectiveAtMs: 0,
    },
    queue: [],
    participants: [],
    createdAtMs: 1_000,
    lastActivityAtMs: 2_000,
    expiresAtMs: 11_000,
  };
}

describe("room lifecycle", () => {
  it("uses idle expiration only when the room has no connections", () => {
    const state = createState();
    const lifecycle = { maxAgeMs: 10_000, idleTtlMs: 3_000 };

    expect(nextRoomExpirationAtMs(state, false, lifecycle)).toBe(5_000);
    expect(nextRoomExpirationAtMs(state, true, lifecycle)).toBe(11_000);
  });

  it("expires at either the idle or absolute deadline", () => {
    const state = createState();
    const lifecycle = { maxAgeMs: 10_000, idleTtlMs: 3_000 };

    expect(roomShouldExpire(state, false, 5_000, lifecycle)).toBe(true);
    expect(roomShouldExpire(state, true, 5_000, lifecycle)).toBe(false);
    expect(roomShouldExpire(state, true, 11_000, lifecycle)).toBe(true);
  });
});
