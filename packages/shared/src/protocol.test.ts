import { describe, expect, it } from "vitest";
import {
  isClientMessage,
  isRoomPermissions,
  isServerMessage,
  isSyncStatus,
  isTrack,
  normalizeRoomPermissions,
  trackFieldLimits,
} from "./protocol";

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

describe("sync status validation", () => {
  it("accepts recovery statuses", () => {
    expect(isSyncStatus("ready_to_resume")).toBe(true);
    expect(isSyncStatus("connection_failed")).toBe(true);
  });

  it("rejects unknown sync statuses", () => {
    expect(isSyncStatus("paused")).toBe(false);
    expect(isSyncStatus(undefined)).toBe(false);
  });
});

describe("client message validation", () => {
  it("accepts old permission payloads and normalizes the newer delete permission", () => {
    const permissions = {
      guestsCanSkip: true,
      guestsCanAddToQueue: false,
    };

    expect(isRoomPermissions(permissions)).toBe(true);
    expect(normalizeRoomPermissions(permissions)).toEqual({
      guestsCanSkip: true,
      guestsCanAddToQueue: false,
      guestsCanRemoveFromQueue: false,
    });
    expect(
      isClientMessage({
        type: "permissions.update",
        operationId: "op-permissions",
        permissions,
        expectedRevision: 4,
      }),
    ).toBe(true);
  });

  it("accepts a participant leave mutation", () => {
    expect(
      isClientMessage({
        type: "participant.leave",
        operationId: "op-leave",
        expectedRevision: 4,
      }),
    ).toBe(true);
  });

  it("accepts a host requeue mutation", () => {
    expect(
      isClientMessage({
        type: "playback.host_requeue",
        operationId: "op-1",
        track: { videoId: "current", title: "Correct Song" },
        expectedRevision: 4,
      }),
    ).toBe(true);
  });

  it("rejects invalid host requeue metadata", () => {
    expect(
      isClientMessage({
        type: "playback.host_requeue",
        operationId: "op-1",
        track: { videoId: "" },
        expectedRevision: 4,
      }),
    ).toBe(false);
  });

  it("rejects a host requeue mutation with an invalid revision", () => {
    expect(
      isClientMessage({
        type: "playback.host_requeue",
        operationId: "op-1",
        expectedRevision: 0,
      }),
    ).toBe(false);
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
            guestsCanRemoveFromQueue: false,
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
