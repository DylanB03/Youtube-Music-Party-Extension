import { describe, expect, it } from "vitest";
import type { PartyRoomState } from "@ytm-party/shared";
import {
  applyRoomMutation,
  markParticipantDisconnected,
  removeInactiveParticipants,
  transferHost,
} from "./room-state";

function createRoomState(): PartyRoomState {
  return {
    roomId: "room-a",
    revision: 4,
    hostParticipantId: "host",
    inviteCode: "ABC123",
    permissions: {
      guestsCanSkip: false,
      guestsCanAddToQueue: true,
    },
    playback: {
      track: { videoId: "playing" },
      paused: false,
      positionSeconds: 12,
      effectiveAtMs: 1_000,
    },
    queue: [],
    participants: [
      {
        participantId: "host",
        displayName: "Host",
        role: "host",
        syncStatus: "in_sync",
        connectedAtMs: 100,
        lastSeenAtMs: 100,
      },
      {
        participantId: "guest",
        displayName: "Guest",
        role: "guest",
        syncStatus: "in_sync",
        connectedAtMs: 200,
        lastSeenAtMs: 200,
      },
    ],
  };
}

describe("party room mutations", () => {
  it("allows guest queue additions when enabled", () => {
    const state = createRoomState();
    const result = applyRoomMutation(
      state,
      {
        type: "queue.add",
        operationId: "queue-add",
        track: { videoId: "queued" },
        expectedRevision: 4,
      },
      "guest",
      2_000,
      () => "queue-1",
    );

    expect(result.error).toBeUndefined();
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0]?.track.videoId).toBe("queued");
  });

  it("starts the first added track when the party has no active playback", () => {
    const state = createRoomState();
    state.playback = {
      track: null,
      paused: true,
      positionSeconds: 0,
      effectiveAtMs: 1_000,
    };

    const result = applyRoomMutation(
      state,
      {
        type: "queue.add",
        operationId: "queue-start",
        track: { videoId: "first-track" },
        expectedRevision: 4,
      },
      "host",
      2_000,
      () => "unused",
    );

    expect(result.error).toBeUndefined();
    expect(state.queue).toEqual([]);
    expect(state.playback).toEqual({
      track: { videoId: "first-track" },
      paused: false,
      positionSeconds: 0,
      effectiveAtMs: 2_000,
    });
  });

  it("rejects guest skipping unless the host enables it", () => {
    const state = createRoomState();
    const result = applyRoomMutation(
      state,
      { type: "playback.skip", operationId: "guest-skip", expectedRevision: 4 },
      "guest",
      2_000,
      () => "unused",
    );

    expect(result.error?.code).toBe("forbidden");
    expect(state.playback.track?.videoId).toBe("playing");
  });

  it("allows only the host to update guest permissions", () => {
    const state = createRoomState();
    const guestResult = applyRoomMutation(
      state,
      {
        type: "permissions.update",
        operationId: "guest-permissions",
        permissions: {
          guestsCanSkip: true,
          guestsCanAddToQueue: false,
        },
        expectedRevision: 4,
      },
      "guest",
      2_000,
      () => "unused",
    );
    expect(guestResult.error?.code).toBe("forbidden");

    const hostResult = applyRoomMutation(
      state,
      {
        type: "permissions.update",
        operationId: "host-permissions",
        permissions: {
          guestsCanSkip: true,
          guestsCanAddToQueue: false,
        },
        expectedRevision: 4,
      },
      "host",
      2_100,
      () => "unused",
    );
    expect(hostResult.error).toBeUndefined();
    expect(state.permissions).toEqual({
      guestsCanSkip: true,
      guestsCanAddToQueue: false,
    });
  });

  it("lets the host reorder and remove queue items", () => {
    const state = createRoomState();
    state.queue = [
      {
        id: "first",
        track: { videoId: "track-1" },
        addedByParticipantId: "host",
        addedAtMs: 1_000,
      },
      {
        id: "second",
        track: { videoId: "track-2" },
        addedByParticipantId: "guest",
        addedAtMs: 1_100,
      },
    ];

    const reorderResult = applyRoomMutation(
      state,
      {
        type: "queue.reorder",
        operationId: "queue-reorder",
        queueItemIds: ["second", "first"],
        expectedRevision: 4,
      },
      "host",
      2_000,
      () => "unused",
    );
    expect(reorderResult.error).toBeUndefined();
    expect(state.queue.map((item) => item.id)).toEqual(["second", "first"]);

    const removeResult = applyRoomMutation(
      state,
      {
        type: "queue.remove",
        operationId: "queue-remove",
        queueItemId: "second",
        expectedRevision: 4,
      },
      "host",
      2_100,
      () => "unused",
    );
    expect(removeResult.error).toBeUndefined();
    expect(state.queue.map((item) => item.id)).toEqual(["first"]);
  });

  it("advances the queue with a server timestamp", () => {
    const state = createRoomState();
    state.queue.push({
      id: "queue-1",
      track: { videoId: "next" },
      addedByParticipantId: "host",
      addedAtMs: 1_500,
    });

    const result = applyRoomMutation(
      state,
      { type: "playback.skip", operationId: "host-skip", expectedRevision: 4 },
      "host",
      3_000,
      () => "unused",
    );

    expect(result.changed).toBe(true);
    expect(state.playback).toEqual({
      track: { videoId: "next" },
      paused: false,
      positionSeconds: 0,
      effectiveAtMs: 3_000,
    });
  });

  it("requeues the current host track to the front and clears playback", () => {
    const state = createRoomState();
    state.queue = [
      {
        id: "existing",
        track: { videoId: "queued" },
        addedByParticipantId: "guest",
        addedAtMs: 1_500,
      },
    ];

    const result = applyRoomMutation(
      state,
      {
        type: "playback.host_requeue",
        operationId: "host-requeue",
        track: {
          videoId: "playing",
          title: "Correct Song",
          artist: "Correct Artist",
        },
        expectedRevision: 4,
      },
      "host",
      2_000,
      () => "requeued-id",
    );

    expect(result.changed).toBe(true);
    expect(result.error).toBeUndefined();
    expect(state.queue.map((item) => item.id)).toEqual(["requeued-id", "existing"]);
    expect(state.queue[0]?.track.videoId).toBe("playing");
    expect(state.queue[0]?.track).toEqual({
      videoId: "playing",
      title: "Correct Song",
      artist: "Correct Artist",
    });
    expect(state.playback).toEqual({
      track: null,
      paused: true,
      positionSeconds: 0,
      effectiveAtMs: 2_000,
    });
  });

  it("rejects a non-host requeue", () => {
    const state = createRoomState();

    const result = applyRoomMutation(
      state,
      {
        type: "playback.host_requeue",
        operationId: "guest-requeue",
        expectedRevision: 4,
      },
      "guest",
      2_000,
      () => "unused",
    );

    expect(result.error?.code).toBe("forbidden");
    expect(state.playback.track?.videoId).toBe("playing");
    expect(state.queue).toHaveLength(0);
  });

  it("clears playback on requeue even when no track is playing", () => {
    const state = createRoomState();
    state.playback = {
      track: null,
      paused: true,
      positionSeconds: 0,
      effectiveAtMs: 1_000,
    };

    const result = applyRoomMutation(
      state,
      {
        type: "playback.host_requeue",
        operationId: "empty-requeue",
        expectedRevision: 4,
      },
      "host",
      2_000,
      () => "unused",
    );

    expect(result.changed).toBe(true);
    expect(state.queue).toHaveLength(0);
    expect(state.playback).toEqual({
      track: null,
      paused: true,
      positionSeconds: 0,
      effectiveAtMs: 2_000,
    });
  });

  it("rejects stale queue mutations and requests a snapshot", () => {
    const state = createRoomState();
    const result = applyRoomMutation(
      state,
      {
        type: "queue.add",
        operationId: "stale-queue-add",
        track: { videoId: "queued" },
        expectedRevision: 3,
      },
      "host",
      2_000,
      () => "queue-1",
    );

    expect(result.error).toEqual({
      code: "stale_revision",
      message: "Room state changed. Refreshing snapshot.",
      includeSnapshot: true,
    });
    expect(state.queue).toHaveLength(0);
  });

  it("transfers host authority to the longest-connected active guest", () => {
    const state = createRoomState();
    state.participants.push({
      participantId: "later-guest",
      displayName: "Later",
      role: "guest",
      syncStatus: "in_sync",
      connectedAtMs: 300,
      lastSeenAtMs: 300,
    });
    expect(markParticipantDisconnected(state, "host", 5_000)).toBe(true);

    const transferred = transferHost(
      state,
      new Set(["guest", "later-guest"]),
    );

    expect(transferred).toBe(true);
    expect(state.hostParticipantId).toBe("guest");
    expect(state.participants.find((participant) => participant.participantId === "guest")?.role)
      .toBe("host");
  });

  it("removes only inactive non-host participants after the retention period", () => {
    const state = createRoomState();
    state.participants.push({
      participantId: "active-guest",
      displayName: "Active",
      role: "guest",
      syncStatus: "in_sync",
      connectedAtMs: 300,
      lastSeenAtMs: 300,
    });

    const changed = removeInactiveParticipants(
      state,
      new Set(["active-guest"]),
      10_000,
      5_000,
    );

    expect(changed).toBe(true);
    expect(state.participants.map((participant) => participant.participantId)).toEqual([
      "host",
      "active-guest",
    ]);
  });

  it("rejects additions when the configured queue limit is reached", () => {
    const state = createRoomState();
    state.queue.push({
      id: "existing",
      track: { videoId: "existing-track" },
      addedByParticipantId: "host",
      addedAtMs: 1_000,
    });

    const result = applyRoomMutation(
      state,
      {
        type: "queue.add",
        operationId: "full-queue-add",
        track: { videoId: "another-track" },
        expectedRevision: 4,
      },
      "host",
      2_000,
      () => "new-item",
      { maxQueueItems: 1 },
    );

    expect(result.error).toEqual({
      code: "queue_full",
      message: "The party queue is full.",
    });
    expect(state.queue).toHaveLength(1);
  });
});
