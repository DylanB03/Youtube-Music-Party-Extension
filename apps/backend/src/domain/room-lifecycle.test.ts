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
      guestsCanRemoveFromQueue: false,
    },
    playback: {
      track: { videoId: "current" },
      paused: false,
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
    const lifecycle = {
      maxAgeMs: 10_000,
      idleTtlMs: 3_000,
      emptyTtlMs: 4_000,
    };

    expect(nextRoomExpirationAtMs(state, false, lifecycle)).toBe(5_000);
    expect(nextRoomExpirationAtMs(state, true, lifecycle)).toBe(11_000);
  });

  it("expires at either the idle or absolute deadline", () => {
    const state = createState();
    const lifecycle = {
      maxAgeMs: 10_000,
      idleTtlMs: 3_000,
      emptyTtlMs: 4_000,
    };

    expect(roomShouldExpire(state, false, 5_000, lifecycle)).toBe(true);
    expect(roomShouldExpire(state, true, 5_000, lifecycle)).toBe(false);
    expect(roomShouldExpire(state, true, 11_000, lifecycle)).toBe(true);
  });

  it("expires a truly empty room even while a stale socket remains attached", () => {
    const state = createState();
    state.playback = {
      track: null,
      paused: true,
      positionSeconds: 0,
      effectiveAtMs: 2_000,
    };
    const lifecycle = {
      maxAgeMs: 10_000,
      idleTtlMs: 8_000,
      emptyTtlMs: 4_000,
    };

    expect(nextRoomExpirationAtMs(state, true, lifecycle)).toBe(6_000);
    expect(roomShouldExpire(state, true, 5_999, lifecycle)).toBe(false);
    expect(roomShouldExpire(state, true, 6_000, lifecycle)).toBe(true);
  });

  it("does not call a room empty while either playback or its queue has a song", () => {
    const state = createState();
    state.playback.track = null;
    state.queue = [
      {
        id: "queued",
        track: { videoId: "next" },
        addedByParticipantId: "host",
        addedAtMs: 2_000,
      },
    ];
    const lifecycle = {
      maxAgeMs: 10_000,
      idleTtlMs: 3_000,
      emptyTtlMs: 1_000,
    };

    expect(nextRoomExpirationAtMs(state, true, lifecycle)).toBe(11_000);
  });
});
