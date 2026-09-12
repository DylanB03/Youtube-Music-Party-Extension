import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyPlayback, defaultPermissions, type PartyRoomState } from "@ytm-party/shared";
import { PartyRoom } from "./party-room";
import { createRoomAuth } from "./domain/room-auth";
import type { Env } from "./types";

function harness() {
  const room: PartyRoomState = {
    roomId: "room", inviteCode: "ABC123", revision: 1, hostParticipantId: "host",
    permissions: defaultPermissions(), playback: { ...emptyPlayback(1_000), track: { videoId: "song" } }, queue: [],
    participants: ["host", "guest"].map((id) => ({
      participantId: id, displayName: id, role: id === "host" ? "host" : "guest",
      syncStatus: "in_sync", connectedAtMs: 1_000, lastSeenAtMs: 1_000,
    })),
    hostDisconnectedAtMs: 1_000, createdAtMs: 1_000, lastActivityAtMs: 1_000, expiresAtMs: 100_000,
  };
  const saved = new Map<string, unknown>([["roomState", room], ["roomAuth", createRoomAuth("host", "token")]]);
  const storage = {
    get: vi.fn(async (key: string) => saved.get(key)),
    put: vi.fn(async (entries: Record<string, unknown>) => { for (const [key, value] of Object.entries(entries)) saved.set(key, value); }),
    deleteAll: vi.fn(async () => { saved.clear(); }),
    setAlarm: vi.fn(async () => undefined),
  };
  const socket = {
    readyState: WebSocket.OPEN,
    deserializeAttachment: () => ({ participantId: "guest", displayName: "Guest", messageWindowStartedAtMs: 1_000, messageCount: 0 }),
    serializeAttachment: vi.fn(), send: vi.fn(), close: vi.fn(),
  };
  const deleteInvite = vi.fn(async (): Promise<void> => undefined);
  const object = new PartyRoom({ storage, getWebSockets: () => [socket] } as unknown as DurableObjectState, {
    INVITES: { delete: deleteInvite }, HOST_RECONNECT_GRACE_MS: "5000",
  } as unknown as Env);
  return { object, room, saved, storage, socket, deleteInvite };
}

describe("room lifecycle orchestration", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("preserves the host takeover deadline when a guest sends a clock ping", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000);
    const { object, storage, socket } = harness();
    await object.webSocketMessage(socket as unknown as WebSocket, JSON.stringify({ type: "clock.ping", clientSentAtMs: 2_000 }));
    expect(storage.setAlarm).toHaveBeenLastCalledWith(6_000);
  });

  it("does not transfer host early when playback preparation wakes the room", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000);
    const { object, room, storage } = harness();
    room.playback.playbackId = "prepared";
    room.playbackPreparation = { playbackId: "prepared", deadlineAtMs: 2_000, eligibleParticipantIds: ["host"], readyParticipantIds: [] };
    await object.alarm();
    expect(room.hostParticipantId).toBe("host");
    expect(storage.setAlarm).toHaveBeenLastCalledWith(6_000);
    vi.setSystemTime(6_000);
    await object.alarm();
    expect(room.hostParticipantId).toBe("guest");
  });

  it("rejects a concurrent join while expiration awaits invite cleanup", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_001);
    const { object, saved, deleteInvite } = harness();
    let finishDelete!: () => void;
    deleteInvite.mockImplementation(() => new Promise<void>((resolve) => { finishDelete = resolve; }));
    const expiration = object.alarm();
    await vi.waitFor(() => expect(deleteInvite).toHaveBeenCalled());
    const response = await object.fetch(new Request("https://room.local/join", {
      method: "POST", body: JSON.stringify({ inviteCode: "ABC123", displayName: "New Guest", nowMs: 100_001 }),
    }));
    expect(response.status).toBe(410);
    finishDelete();
    await expiration;
    expect(saved.size).toBe(0);
  });
});
