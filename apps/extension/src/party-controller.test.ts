import { describe, expect, it } from "vitest";
import type {
  ClientMessage,
  LocalPlaybackState,
  PartyPlaybackState,
  PartyRoomState,
  Track,
} from "@ytm-party/shared";
import { PartyController } from "./party-controller";
import type {
  ConnectionState,
  MutationMessage,
  OperationResult,
  PartyConnection,
  SessionView,
  StoredSession,
} from "./session-types";

class FakeConnection implements PartyConnection {
  clockOffsetMs = 0;
  sent: ClientMessage[] = [];
  private snapshotListener: ((state: PartyRoomState) => void) | null = null;
  private connectionStateListener: ((state: ConnectionState) => void) | null = null;

  connect(): void {}

  disconnect(): void {}

  onSnapshot(listener: (state: PartyRoomState) => void): () => void {
    this.snapshotListener = listener;
    return () => {
      this.snapshotListener = null;
    };
  }

  onError(): () => void {
    return () => undefined;
  }

  onConnectionState(listener: (state: ConnectionState) => void): () => void {
    this.connectionStateListener = listener;
    listener("connected");
    return () => {
      this.connectionStateListener = null;
    };
  }

  send(message: ClientMessage): void {
    this.sent.push(message);
  }

  async sendOperation(message: MutationMessage): Promise<OperationResult> {
    this.sent.push(message);
    return {
      type: "operation.result",
      operationId: message.operationId,
      accepted: true,
      revision: message.expectedRevision + 1,
    };
  }

  emitSnapshot(state: PartyRoomState): void {
    this.snapshotListener?.(state);
  }

  emitConnectionState(state: ConnectionState): void {
    this.connectionStateListener?.(state);
  }
}

class FakeStorage {
  saved: StoredSession | null;

  constructor(saved: StoredSession | null) {
    this.saved = saved;
  }

  async load(): Promise<StoredSession | null> {
    return this.saved;
  }

  async save(session: StoredSession): Promise<void> {
    this.saved = session;
  }

  async clear(): Promise<void> {
    this.saved = null;
  }
}

class FakeTabs {
  applied: PartyPlaybackState[] = [];
  failApply = false;
  playback: LocalPlaybackState = {
    track: { videoId: "old-track" },
    paused: true,
    positionSeconds: 0,
    buffering: false,
  };

  async getPlayback(): Promise<LocalPlaybackState> {
    return this.playback;
  }

  async applyPlayback(playback: PartyPlaybackState): Promise<"applied"> {
    if (this.failApply) throw new Error("Tab stalled");
    this.applied.push(playback);
    this.playback = {
      track: playback.track,
      paused: playback.paused,
      positionSeconds: playback.positionSeconds,
      buffering: false,
    };
    return "applied";
  }

  async getContextSong(): Promise<Track | null> {
    return null;
  }
}

function roomState(): PartyRoomState {
  return {
    roomId: "room",
    revision: 2,
    hostParticipantId: "host",
    inviteCode: "ABC123",
    permissions: {
      guestsCanSkip: true,
      guestsCanAddToQueue: true,
    },
    playback: {
      track: { videoId: "current-track" },
      paused: false,
      positionSeconds: 10,
      effectiveAtMs: Date.now(),
    },
    queue: [],
    participants: [],
  };
}

async function createGuestController(): Promise<{
  controller: PartyController;
  connection: FakeConnection;
  tabs: FakeTabs;
  views: SessionView[];
}> {
  const credentials: StoredSession = {
    roomId: "room",
    participantId: "guest",
    participantToken: "token",
    displayName: "Guest",
    localSyncStatus: "in_sync",
  };
  const connection = new FakeConnection();
  const tabs = new FakeTabs();
  const views: SessionView[] = [];
  const controller = new PartyController(
    {
      async createRoom() {
        throw new Error("Not used");
      },
      async joinRoom() {
        throw new Error("Not used");
      },
    },
    new FakeStorage(credentials),
    tabs,
    () => connection,
    (view) => views.push(view),
  );
  await controller.initialize();
  connection.emitSnapshot(roomState());
  await Promise.resolve();
  return { controller, connection, tabs, views };
}

async function createHostController(): Promise<{
  controller: PartyController;
  connection: FakeConnection;
  tabs: FakeTabs;
}> {
  const credentials: StoredSession = {
    roomId: "room",
    participantId: "host",
    participantToken: "token",
    displayName: "Host",
    localSyncStatus: "in_sync",
  };
  const connection = new FakeConnection();
  const tabs = new FakeTabs();
  const controller = new PartyController(
    {
      async createRoom() {
        throw new Error("Not used");
      },
      async joinRoom() {
        throw new Error("Not used");
      },
    },
    new FakeStorage(credentials),
    tabs,
    () => connection,
    () => undefined,
  );
  await controller.initialize();
  connection.emitSnapshot(roomState());
  await Promise.resolve();
  return { controller, connection, tabs };
}

async function flushControllerWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("party controller orchestration", () => {
  it("does not let a guest track-ended event advance the shared queue", async () => {
    const { controller, connection } = await createGuestController();
    connection.sent = [];

    await controller.handleLocalPlaybackEvent({
      type: "local.ended",
      playback: {
        track: { videoId: "current-track" },
        paused: true,
        positionSeconds: 200,
        buffering: false,
      },
    });

    expect(connection.sent).toEqual([]);
  });

  it("keeps explicit permitted guest skip wired to the backend", async () => {
    const { controller, connection } = await createGuestController();
    connection.sent = [];

    await controller.skip();

    expect(connection.sent).toEqual([
      {
        type: "playback.skip",
        operationId: expect.any(String),
        expectedRevision: 2,
      },
    ]);
  });

  it("advances only once for duplicate host ended events", async () => {
    const { controller, connection } = await createHostController();
    connection.sent = [];
    const endedEvent = {
      type: "local.ended" as const,
      playback: {
        track: { videoId: "current-track" },
        paused: true,
        positionSeconds: 180,
        durationSeconds: 180,
        buffering: false,
      },
    };

    await controller.handleLocalPlaybackEvent(endedEvent);
    await controller.handleLocalPlaybackEvent(endedEvent);

    expect(
      connection.sent.filter((message) => message.type === "playback.skip"),
    ).toHaveLength(1);
  });

  it("keeps the solo host in sync when YouTube Music stalls during canonical apply", async () => {
    const { controller, connection, tabs } = await createHostController();
    tabs.failApply = true;
    connection.sent = [];
    const nextState = roomState();
    nextState.revision = 3;
    nextState.playback = {
      track: { videoId: "queued-track" },
      paused: false,
      positionSeconds: 0,
      effectiveAtMs: Date.now(),
    };

    connection.emitSnapshot(nextState);
    await flushControllerWork();

    expect(controller.getView()).toMatchObject({
      localSyncStatus: "in_sync",
      lastError:
        "YouTube Music has not loaded the party track yet. Keeping host playback active.",
    });
    expect(
      connection.sent.filter(
        (message) =>
          message.type === "participant.status" &&
          message.syncStatus === "track_unavailable",
      ),
    ).toEqual([]);
  });

  it("ignores YouTube Music auto-next host events while party auto-advance is pending", async () => {
    const { controller, connection } = await createHostController();
    connection.sent = [];

    await controller.handleLocalPlaybackEvent({
      type: "local.ended",
      playback: {
        track: { videoId: "current-track" },
        paused: true,
        positionSeconds: 180,
        durationSeconds: 180,
        buffering: false,
      },
    });
    await controller.handleLocalPlaybackEvent({
      type: "local.play",
      playback: {
        track: { videoId: "youtube-auto-next" },
        paused: false,
        positionSeconds: 0,
        buffering: false,
      },
    });

    expect(connection.sent).toEqual([
      {
        type: "playback.skip",
        operationId: expect.any(String),
        expectedRevision: 2,
      },
    ]);
  });

  it("accepts host controls again after the queued canonical track applies", async () => {
    const { controller, connection, tabs } = await createHostController();
    connection.sent = [];

    await controller.handleLocalPlaybackEvent({
      type: "local.ended",
      playback: {
        track: { videoId: "current-track" },
        paused: true,
        positionSeconds: 180,
        durationSeconds: 180,
        buffering: false,
      },
    });

    const nextState = roomState();
    nextState.revision = 3;
    nextState.playback = {
      track: { videoId: "party-queued-track" },
      paused: false,
      positionSeconds: 0,
      effectiveAtMs: Date.now(),
    };
    connection.emitSnapshot(nextState);
    await flushControllerWork();
    expect(tabs.applied.at(-1)?.track?.videoId).toBe("party-queued-track");

    await controller.handleLocalPlaybackEvent({
      type: "local.pause",
      playback: {
        track: { videoId: "party-queued-track" },
        paused: true,
        positionSeconds: 8,
        buffering: false,
      },
    });

    expect(
      connection.sent.filter((message) => message.type === "playback.host_state"),
    ).toHaveLength(1);
  });

  it("applies empty canonical playback when the queue ends with no next track", async () => {
    const { controller, connection, tabs } = await createHostController();
    connection.sent = [];

    await controller.handleLocalPlaybackEvent({
      type: "local.ended",
      playback: {
        track: { videoId: "current-track" },
        paused: true,
        positionSeconds: 180,
        durationSeconds: 180,
        buffering: false,
      },
    });

    tabs.playback = {
      track: { videoId: "youtube-auto-next" },
      paused: false,
      positionSeconds: 1,
      buffering: false,
    };
    const emptyState = roomState();
    emptyState.revision = 3;
    emptyState.playback = {
      track: null,
      paused: true,
      positionSeconds: 0,
      effectiveAtMs: Date.now(),
    };

    connection.emitSnapshot(emptyState);
    await flushControllerWork();

    expect(tabs.applied.at(-1)?.track).toBeNull();
    expect(tabs.playback).toMatchObject({
      track: null,
      paused: true,
    });
  });

  it("serializes mutations against acknowledged room revisions", async () => {
    const { controller, connection } = await createGuestController();
    connection.sent = [];

    await Promise.all([controller.skip(), controller.skip()]);

    const skipMessages = connection.sent.filter(
      (message): message is Extract<ClientMessage, { type: "playback.skip" }> =>
        message.type === "playback.skip",
    );
    expect(skipMessages.map((message) => message.expectedRevision)).toEqual([2, 3]);
  });

  it("applies changed canonical playback to an in-sync guest", async () => {
    const { connection, tabs } = await createGuestController();
    tabs.applied = [];
    const nextState = roomState();
    nextState.revision = 3;
    nextState.playback = {
      track: { videoId: "next-track" },
      paused: false,
      positionSeconds: 0,
      effectiveAtMs: Date.now(),
    };

    connection.emitSnapshot(nextState);
    await Promise.resolve();
    await Promise.resolve();

    expect(tabs.applied.at(-1)?.track?.videoId).toBe("next-track");
  });

  it("clears an expired room instead of reconnecting forever", async () => {
    const { controller, connection } = await createGuestController();

    connection.emitConnectionState("expired");
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.getView()).toMatchObject({
      roomId: null,
      localSyncStatus: "not_joined",
      lastError: "This party has expired. Create or join another party.",
    });
  });
});
