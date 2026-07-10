import { describe, expect, it } from "vitest";
import type { ClientMessage, PartyRoomState, ServerMessage } from "@ytm-party/shared";
import { processRoomMessage } from "./room-message-processor";
import type { RoomLimits } from "./room-limits";
import type { RoomAuth, SessionMeta } from "../types";

function createRoom(): PartyRoomState {
  return {
    roomId: "room-a",
    revision: 7,
    hostParticipantId: "host",
    inviteCode: "ABC123",
    permissions: {
      guestsCanSkip: false,
      guestsCanAddToQueue: true,
      guestsCanRemoveFromQueue: false,
    },
    playback: {
      track: { videoId: "playing" },
      paused: false,
      positionSeconds: 5,
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

function createAuth(): RoomAuth {
  return {
    participantTokens: { host: "host-token", guest: "guest-token" },
    connectionTickets: {},
    operationResults: {},
  };
}

const limits: RoomLimits = {
  maxParticipants: 50,
  maxQueueItems: 200,
  maxMessageBytes: 16_384,
  maxMessagesPerWindow: 120,
  messageWindowMs: 10_000,
  maxDisplayNameLength: 40,
};

function session(participantId: string): SessionMeta {
  return {
    participantId,
    displayName: participantId,
    messageWindowStartedAtMs: 0,
    messageCount: 0,
  };
}

async function dispatch(
  room: PartyRoomState,
  auth: RoomAuth,
  participantId: string,
  message: ClientMessage,
  connectedIds: Set<string> = new Set(["host", "guest"]),
): Promise<{
  sent: ServerMessage[];
  broadcasts: number;
  closedParticipants: string[];
  persists: number;
}> {
  const sent: ServerMessage[] = [];
  const closedParticipants: string[] = [];
  let broadcasts = 0;
  let persists = 0;
  const socket = { close() {} } as unknown as WebSocket;
  await processRoomMessage({
    socket,
    raw: JSON.stringify(message),
    session: session(participantId),
    room,
    auth,
    limits,
    send: (outgoing) => sent.push(outgoing),
    persist: async () => {
      persists += 1;
    },
    broadcast: () => {
      broadcasts += 1;
    },
    connectedParticipantIds: () => connectedIds,
    closeParticipant: (closedParticipantId) => {
      closedParticipants.push(closedParticipantId);
    },
    now: () => 5_000,
  });
  return { sent, broadcasts, closedParticipants, persists };
}

describe("room message processor", () => {
  it("broadcasts presence updates without bumping the room revision", async () => {
    const room = createRoom();
    const auth = createAuth();

    const { broadcasts, persists } = await dispatch(room, auth, "guest", {
      type: "participant.status",
      syncStatus: "out_of_sync",
    });

    expect(room.revision).toBe(7);
    expect(broadcasts).toBe(1);
    expect(persists).toBe(1);
    expect(
      room.participants.find((participant) => participant.participantId === "guest")
        ?.syncStatus,
    ).toBe("out_of_sync");
  });

  it("does not let a stale presence update reject a concurrent authoritative mutation", async () => {
    const room = createRoom();
    const auth = createAuth();

    await dispatch(room, auth, "guest", {
      type: "participant.status",
      syncStatus: "navigating",
    });

    // The host action still expects the revision it last observed (7).
    const { sent } = await dispatch(room, auth, "host", {
      type: "queue.add",
      operationId: "op-1",
      track: { videoId: "queued" },
      expectedRevision: 7,
    });

    const result = sent.find((message) => message.type === "operation.result");
    expect(result).toMatchObject({ type: "operation.result", accepted: true });
    expect(room.revision).toBe(8);
  });

  it("bumps the revision for accepted queue mutations", async () => {
    const room = createRoom();
    const auth = createAuth();

    await dispatch(room, auth, "host", {
      type: "queue.add",
      operationId: "op-2",
      track: { videoId: "queued" },
      expectedRevision: 7,
    });

    expect(room.revision).toBe(8);
    expect(room.queue).toHaveLength(1);
  });

  it("removes a leaving host, transfers host, and closes the leaving participant", async () => {
    const room = createRoom();
    const auth = createAuth();

    const { sent, broadcasts, closedParticipants, persists } = await dispatch(
      room,
      auth,
      "host",
      {
        type: "participant.leave",
        operationId: "host-leave",
        expectedRevision: 7,
      },
      new Set(["host", "guest"]),
    );

    expect(room.revision).toBe(8);
    expect(room.hostParticipantId).toBe("guest");
    expect(room.participants.map((participant) => participant.participantId)).toEqual([
      "guest",
    ]);
    expect(room.participants[0]?.role).toBe("host");
    expect(auth.participantTokens.host).toBeUndefined();
    expect(auth.participantTokens.guest).toBe("guest-token");
    expect(broadcasts).toBe(1);
    expect(persists).toBe(1);
    expect(sent).toContainEqual({
      type: "operation.result",
      operationId: "host-leave",
      accepted: true,
      revision: 8,
    });
    expect(closedParticipants).toEqual(["host"]);
  });
});
