import { describe, expect, it, vi } from "vitest";
import type {
  ClientMessage,
  LocalPlaybackState,
  PartyPlaybackState,
  PartyRoomState,
  Track,
} from "@ytm-party/shared";
import { PartyController } from "./party-controller";
import { PartyApiError } from "./party-api";
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
  disconnects = 0;
  failOperations = false;
  snapshotOnSkip: PartyRoomState | null = null;
  snapshotOnHostRequeue: PartyRoomState | null = null;
  private snapshotListener: ((state: PartyRoomState) => void) | null = null;
  private connectionStateListener: ((state: ConnectionState) => void) | null = null;

  connect(): void {}

  disconnect(): void {
    this.disconnects += 1;
  }

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
    if (this.failOperations) throw new Error("Party operation failed");
    this.sent.push(message);
    // Mirror the backend, which broadcasts the new snapshot before the
    // operation result so the client has fresh canonical state when the
    // mutation promise resolves.
    if (message.type === "playback.skip" && this.snapshotOnSkip) {
      this.snapshotListener?.(this.snapshotOnSkip);
    }
    if (message.type === "playback.host_requeue" && this.snapshotOnHostRequeue) {
      this.snapshotListener?.(this.snapshotOnHostRequeue);
    }
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
  failAfterApply = false;
  applicationResult: "applied" | "navigating" = "applied";
  activePartyTabId: number | null = null;
  playback: LocalPlaybackState = {
    track: { videoId: "old-track" },
    paused: true,
    positionSeconds: 0,
    buffering: false,
  };

  async getPlayback(): Promise<LocalPlaybackState> {
    return this.playback;
  }

  async applyPlayback(
    playback: PartyPlaybackState,
  ): Promise<"applied" | "navigating"> {
    if (this.failApply) throw new Error("Tab stalled");
    this.applied.push(playback);
    if (this.applicationResult === "applied") {
      this.playback = {
        track: playback.track,
        paused: playback.paused,
        positionSeconds: playback.positionSeconds,
        buffering: false,
      };
    }
    if (this.failAfterApply) throw new Error("Tab reported a late failure");
    return this.applicationResult;
  }

  async getContextSong(): Promise<Track | null> {
    return null;
  }

  async resolveActivePartyTabId(): Promise<number | null> {
    return this.activePartyTabId;
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
      guestsCanRemoveFromQueue: false,
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
      async leaveRoom() {
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
      async leaveRoom() {
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

  it("notifies the backend leave endpoint before clearing a local leave", async () => {
    const credentials: StoredSession = {
      roomId: "room",
      participantId: "guest",
      participantToken: "token",
      displayName: "Guest",
      localSyncStatus: "in_sync",
    };
    const connection = new FakeConnection();
    const storage = new FakeStorage(credentials);
    const leaveCalls: Array<Pick<StoredSession, "roomId" | "participantId" | "participantToken">> = [];
    const controller = new PartyController(
      {
        async createRoom() {
          throw new Error("Not used");
        },
        async joinRoom() {
          throw new Error("Not used");
        },
        async leaveRoom(roomId, participantId, participantToken) {
          leaveCalls.push({ roomId, participantId, participantToken });
        },
      },
      storage,
      new FakeTabs(),
      () => connection,
      () => undefined,
    );
    await controller.initialize();
    connection.emitSnapshot(roomState());

    const view = await controller.leaveParty();

    expect(leaveCalls).toEqual([
      {
        roomId: "room",
        participantId: "guest",
        participantToken: "token",
      },
    ]);
    expect(connection.sent).not.toContainEqual(
      expect.objectContaining({ type: "participant.leave" }),
    );
    expect(connection.disconnects).toBe(1);
    expect(storage.saved).toBeNull();
    expect(view.localSyncStatus).toBe("not_joined");
  });

  it("falls back to in-room leave if the HTTP leave endpoint cannot be reached", async () => {
    const credentials: StoredSession = {
      roomId: "room",
      participantId: "guest",
      participantToken: "token",
      displayName: "Guest",
      localSyncStatus: "in_sync",
    };
    const connection = new FakeConnection();
    const storage = new FakeStorage(credentials);
    const controller = new PartyController(
      {
        async createRoom() {
          throw new Error("Not used");
        },
        async joinRoom() {
          throw new Error("Not used");
        },
        async leaveRoom() {
          throw new Error("Network failed");
        },
      },
      storage,
      new FakeTabs(),
      () => connection,
      () => undefined,
    );
    await controller.initialize();
    connection.emitSnapshot(roomState());

    await controller.leaveParty();

    expect(connection.sent).toContainEqual({
      type: "participant.leave",
      operationId: expect.any(String),
      expectedRevision: 2,
    });
    expect(storage.saved).toBeNull();
  });

  it("does not send a websocket leave to a backend missing the leave endpoint", async () => {
    const credentials: StoredSession = {
      roomId: "room",
      participantId: "guest",
      participantToken: "token",
      displayName: "Guest",
      localSyncStatus: "in_sync",
    };
    const connection = new FakeConnection();
    const storage = new FakeStorage(credentials);
    const controller = new PartyController(
      {
        async createRoom() {
          throw new Error("Not used");
        },
        async joinRoom() {
          throw new Error("Not used");
        },
        async leaveRoom() {
          throw new PartyApiError(404, "Not found");
        },
      },
      storage,
      new FakeTabs(),
      () => connection,
      () => undefined,
    );
    await controller.initialize();
    connection.emitSnapshot(roomState());

    await expect(controller.leaveParty()).rejects.toThrow(
      "This backend does not support instant leave yet",
    );

    expect(connection.sent).not.toContainEqual(
      expect.objectContaining({ type: "participant.leave" }),
    );
    expect(storage.saved).toEqual(credentials);
  });

  it("lets a guest Resume button rejoin playback instead of skipping the queue", async () => {
    const credentials: StoredSession = {
      roomId: "room",
      participantId: "guest",
      participantToken: "token",
      displayName: "Guest",
      localSyncStatus: "ready_to_resume",
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
        async leaveRoom() {
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
    await flushControllerWork();
    connection.sent = [];

    await controller.resumePlayback();

    expect(tabs.applied.at(-1)?.track?.videoId).toBe("current-track");
    expect(
      connection.sent.filter((message) => message.type === "playback.skip"),
    ).toHaveLength(0);
    expect(controller.getView().localSyncStatus).toBe("in_sync");
  });

  it("locally corrects guest drift from the monitor without backend status spam", async () => {
    vi.useFakeTimers();
    try {
      const { connection, tabs } = await createGuestController();
      connection.sent = [];
      tabs.applied = [];
      tabs.playback = {
        track: { videoId: "current-track" },
        paused: false,
        positionSeconds: 5,
        buffering: false,
      };

      await vi.advanceTimersByTimeAsync(1_000);
      await flushControllerWork();

      expect(tabs.applied).toHaveLength(1);
      expect(tabs.applied[0]?.track?.videoId).toBe("current-track");
      expect(tabs.applied[0]?.positionSeconds).toBeGreaterThanOrEqual(10);
      expect(connection.sent).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("automatically rejoins guest playback after an advertisement clears", async () => {
    const { controller, connection, tabs } = await createGuestController();
    connection.sent = [];

    await controller.handleLocalPlaybackEvent({
      type: "local.progress",
      playback: {
        track: { videoId: "wrong-track" },
        paused: false,
        positionSeconds: 2,
        buffering: false,
      },
    });

    expect(controller.getView().localSyncStatus).toBe("out_of_sync");

    await controller.handleLocalPlaybackEvent({
      type: "local.interruption",
      playback: {
        track: { videoId: "ad-video" },
        paused: false,
        positionSeconds: 3,
        buffering: false,
        interruption: "advertisement",
      },
    });

    tabs.playback = {
      track: { videoId: "ad-video" },
      paused: false,
      positionSeconds: 30,
      buffering: false,
    };

    await controller.handleLocalPlaybackEvent({
      type: "local.progress",
      playback: tabs.playback,
    });

    expect(tabs.applied.at(-1)?.track?.videoId).toBe("current-track");
    expect(controller.getView().localSyncStatus).toBe("in_sync");
    expect(
      connection.sent.filter(
        (message) =>
          message.type === "participant.status" &&
          message.syncStatus === "in_sync",
      ),
    ).toHaveLength(1);
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

  it("marks the host unavailable when canonical playback cannot be verified", async () => {
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
      localSyncStatus: "track_unavailable",
    });
    expect(
      connection.sent.filter(
        (message) =>
          message.type === "participant.status" &&
          message.syncStatus === "track_unavailable",
      ),
    ).toHaveLength(1);
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

  it("keeps an auto-advanced guest in sync while the correct next song buffers", async () => {
    const { controller, connection, tabs } = await createGuestController();
    const nextState = roomState();
    nextState.revision = 3;
    nextState.playback = {
      track: { videoId: "next-track" },
      paused: false,
      positionSeconds: 0,
      effectiveAtMs: Date.now(),
    };

    connection.emitSnapshot(nextState);
    await flushControllerWork();
    expect(tabs.playback.track?.videoId).toBe("next-track");
    connection.sent = [];

    await controller.handleLocalPlaybackEvent({
      type: "local.pause",
      playback: {
        track: { videoId: "next-track" },
        paused: true,
        positionSeconds: 0,
        buffering: true,
      },
    });

    expect(controller.getView().localSyncStatus).toBe("in_sync");
    expect(
      connection.sent.filter(
        (message) =>
          message.type === "participant.status" &&
          message.syncStatus === "out_of_sync",
      ),
    ).toHaveLength(0);
  });

  it("automatically rejoins an auto-advanced guest when the correct song starts late", async () => {
    const { controller, connection, tabs } = await createGuestController();
    const nextState = roomState();
    nextState.revision = 3;
    nextState.playback = {
      track: { videoId: "next-track" },
      paused: false,
      positionSeconds: 0,
      effectiveAtMs: Date.now() - 5_000,
    };

    connection.emitSnapshot(nextState);
    await flushControllerWork();
    tabs.applied = [];
    connection.sent = [];

    await controller.handleLocalPlaybackEvent({
      type: "local.progress",
      playback: {
        track: { videoId: "next-track" },
        paused: false,
        positionSeconds: 0,
        buffering: false,
      },
    });

    expect(tabs.applied.at(-1)?.track?.videoId).toBe("next-track");
    expect(tabs.applied.at(-1)?.positionSeconds).toBeGreaterThan(4);
    expect(controller.getView().localSyncStatus).toBe("in_sync");
    expect(
      connection.sent.filter(
        (message) =>
          message.type === "participant.status" &&
          message.syncStatus === "out_of_sync",
      ),
    ).toHaveLength(0);
  });

  it("ignores playback events from tabs other than the bound party tab", async () => {
    const connection = new FakeConnection();
    const tabs = new FakeTabs();
    tabs.activePartyTabId = 7;
    const controller = new PartyController(
      {
        async createRoom() {
          return {
            roomId: "room",
            inviteCode: "ABC123",
            inviteUrl: "https://party.example/join/ABC123",
            participantId: "host",
            participantToken: "token",
          };
        },
        async joinRoom() {
          throw new Error("Not used");
        },
        async leaveRoom() {
          throw new Error("Not used");
        },
      },
      new FakeStorage(null),
      tabs,
      () => connection,
      () => undefined,
    );

    await controller.createParty("Host");
    connection.emitSnapshot(roomState());
    await flushControllerWork();
    connection.sent = [];

    const pauseEvent = {
      type: "local.pause" as const,
      playback: {
        track: { videoId: "current-track" },
        paused: true,
        positionSeconds: 5,
        buffering: false,
      },
    };

    await controller.handleLocalPlaybackEvent(pauseEvent, 99);
    expect(
      connection.sent.filter((message) => message.type === "playback.host_state"),
    ).toHaveLength(0);

    await controller.handleLocalPlaybackEvent(pauseEvent, 7);
    expect(
      connection.sent.filter((message) => message.type === "playback.host_state"),
    ).toHaveLength(1);
  });

  it("auto-advances when a near-end track change is misclassified", async () => {
    const { controller, connection } = await createHostController();
    connection.sent = [];

    await controller.handleLocalPlaybackEvent({
      type: "local.progress",
      playback: {
        track: { videoId: "current-track" },
        paused: false,
        positionSeconds: 178,
        durationSeconds: 180,
        buffering: false,
      },
    });
    connection.sent = [];

    await controller.handleLocalPlaybackEvent({
      type: "local.track_changed",
      playback: {
        track: { videoId: "youtube-auto-next" },
        paused: false,
        positionSeconds: 0,
        buffering: false,
      },
    });

    expect(
      connection.sent.filter((message) => message.type === "playback.skip"),
    ).toHaveLength(1);
    expect(
      connection.sent.filter((message) => message.type === "playback.host_requeue"),
    ).toHaveLength(0);
  });

  it("applies queue additions while awaiting resume", async () => {
    vi.useFakeTimers();
    try {
      const { controller, connection, tabs } = await createHostController();
      connection.sent = [];

      await controller.handleLocalPlaybackEvent({
        type: "local.progress",
        playback: {
          track: { videoId: "current-track" },
          paused: false,
          positionSeconds: 40,
          durationSeconds: 180,
          buffering: false,
        },
      });
      connection.sent = [];

      await controller.handleLocalPlaybackEvent({
        type: "local.track_changed",
        playback: {
          track: { videoId: "clicked-song" },
          paused: false,
          positionSeconds: 0,
          buffering: false,
        },
      });

      await vi.advanceTimersByTimeAsync(1_500);
      await flushControllerWork();

      const requeued = roomState();
      requeued.revision = 3;
      requeued.queue = [
        {
          id: "requeued",
          track: { videoId: "current-track" },
          addedByParticipantId: "host",
          addedAtMs: Date.now(),
        },
      ];
      requeued.playback = {
        track: null,
        paused: true,
        positionSeconds: 0,
        effectiveAtMs: Date.now(),
      };
      connection.emitSnapshot(requeued);
      await flushControllerWork();
      expect(controller.getView().localSyncStatus).toBe("ready_to_resume");

      const added = roomState();
      added.revision = 4;
      added.queue = [];
      added.playback = {
        track: { videoId: "queued-new" },
        paused: false,
        positionSeconds: 0,
        effectiveAtMs: Date.now(),
      };
      tabs.applied = [];
      connection.emitSnapshot(added);
      await flushControllerWork();

      expect(tabs.applied.at(-1)?.track?.videoId).toBe("queued-new");
      expect(controller.getView().localSyncStatus).toBe("in_sync");
    } finally {
      vi.useRealTimers();
    }
  });

  it("requeues the party track after a deferred mid-song manual change", async () => {
    vi.useFakeTimers();
    try {
      const { controller, connection } = await createHostController();
      connection.sent = [];

      await controller.handleLocalPlaybackEvent({
        type: "local.progress",
        playback: {
          track: { videoId: "current-track" },
          paused: false,
          positionSeconds: 40,
          durationSeconds: 180,
          buffering: false,
        },
      });
      connection.sent = [];

      await controller.handleLocalPlaybackEvent({
        type: "local.track_changed",
        playback: {
          track: { videoId: "clicked-song" },
          paused: false,
          positionSeconds: 0,
          buffering: false,
        },
      });

      expect(connection.sent).toEqual([]);

      await vi.advanceTimersByTimeAsync(1_500);
      await flushControllerWork();

      expect(
        connection.sent.filter((message) => message.type === "playback.host_requeue"),
      ).toHaveLength(1);
      expect(controller.getView().localSyncStatus).toBe("ready_to_resume");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a deferred requeue when the track ends naturally", async () => {
    vi.useFakeTimers();
    try {
      const { controller, connection } = await createHostController();
      connection.sent = [];

      await controller.handleLocalPlaybackEvent({
        type: "local.progress",
        playback: {
          track: { videoId: "current-track" },
          paused: false,
          positionSeconds: 40,
          durationSeconds: 180,
          buffering: false,
        },
      });
      connection.sent = [];

      await controller.handleLocalPlaybackEvent({
        type: "local.track_changed",
        playback: {
          track: { videoId: "youtube-auto-next" },
          paused: false,
          positionSeconds: 0,
          buffering: false,
        },
      });
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

      await vi.advanceTimersByTimeAsync(1_500);
      await flushControllerWork();

      expect(
        connection.sent.filter((message) => message.type === "playback.host_requeue"),
      ).toHaveLength(0);
      expect(
        connection.sent.filter((message) => message.type === "playback.skip"),
      ).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not requeue or push host state for a divergent play before track end", async () => {
    const { controller, connection } = await createHostController();
    connection.sent = [];

    // YouTube Music fires play for its own auto-next song as the current track
    // ends, before the adapter emits local.ended/track_changed. This must not
    // overwrite the party song nor trigger a requeue.
    await controller.handleLocalPlaybackEvent({
      type: "local.play",
      playback: {
        track: { videoId: "youtube-auto-next" },
        paused: false,
        positionSeconds: 0,
        buffering: false,
      },
    });

    expect(connection.sent).toEqual([]);
    expect(controller.getView().localSyncStatus).toBe("in_sync");
  });

  it("auto-advances when native-next play arrives before track_changed", async () => {
    const { controller, connection } = await createHostController();
    connection.sent = [];

    await controller.handleLocalPlaybackEvent({
      type: "local.progress",
      playback: {
        track: { videoId: "current-track" },
        paused: false,
        positionSeconds: 178,
        durationSeconds: 180,
        buffering: false,
      },
    });
    connection.sent = [];

    await controller.handleLocalPlaybackEvent({
      type: "local.play",
      playback: {
        track: { videoId: "youtube-auto-next" },
        paused: false,
        positionSeconds: 0,
        buffering: false,
      },
    });
    await controller.handleLocalPlaybackEvent({
      type: "local.track_changed",
      playback: {
        track: { videoId: "youtube-auto-next" },
        paused: false,
        positionSeconds: 0,
        buffering: false,
      },
    });

    expect(
      connection.sent.filter((message) => message.type === "playback.skip"),
    ).toHaveLength(1);
    expect(
      connection.sent.filter((message) => message.type === "playback.host_requeue"),
    ).toHaveLength(0);
  });

  it("auto-advances when YouTube Music transitions early near the end", async () => {
    vi.useFakeTimers();
    try {
      const { controller, connection } = await createHostController();
      connection.sent = [];

      await controller.handleLocalPlaybackEvent({
        type: "local.progress",
        playback: {
          track: { videoId: "current-track" },
          paused: false,
          positionSeconds: 168,
          durationSeconds: 180,
          buffering: false,
        },
      });
      connection.sent = [];

      await controller.handleLocalPlaybackEvent({
        type: "local.track_changed",
        playback: {
          track: { videoId: "youtube-auto-next" },
          paused: false,
          positionSeconds: 0,
          buffering: false,
        },
      });

      await vi.advanceTimersByTimeAsync(1_500);
      await flushControllerWork();

      expect(
        connection.sent.filter((message) => message.type === "playback.skip"),
      ).toHaveLength(1);
      expect(
        connection.sent.filter((message) => message.type === "playback.host_requeue"),
      ).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("auto-advances after a fast seek directly to the end", async () => {
    const { controller, connection } = await createHostController();
    connection.sent = [];

    await controller.handleLocalPlaybackEvent({
      type: "local.seek",
      playback: {
        track: { videoId: "current-track" },
        paused: false,
        positionSeconds: 179.5,
        durationSeconds: 180,
        buffering: false,
      },
    });
    connection.sent = [];

    await controller.handleLocalPlaybackEvent({
      type: "local.play",
      playback: {
        track: { videoId: "youtube-auto-next" },
        paused: false,
        positionSeconds: 0,
        buffering: false,
      },
    });

    expect(
      connection.sent.filter((message) => message.type === "playback.skip"),
    ).toHaveLength(1);
    expect(
      connection.sent.filter((message) => message.type === "playback.host_requeue"),
    ).toHaveLength(0);
  });

  it("forces queue advancement when recurring progress reports the wrong song", async () => {
    const { controller, connection } = await createHostController();
    connection.sent = [];

    await controller.handleLocalPlaybackEvent({
      type: "local.progress",
      playback: {
        track: { videoId: "youtube-auto-next" },
        paused: false,
        positionSeconds: 2,
        buffering: false,
      },
    });

    expect(
      connection.sent.filter((message) => message.type === "playback.skip"),
    ).toHaveLength(1);
    expect(controller.getView().localSyncStatus).toBe("in_sync");
  });

  it("auto-advances the queue when the current track ends", async () => {
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

    expect(
      connection.sent.filter((message) => message.type === "playback.skip"),
    ).toHaveLength(1);
    expect(
      connection.sent.filter((message) => message.type === "playback.host_requeue"),
    ).toHaveLength(0);
  });

  it("keeps host playback local-only while awaiting resume", async () => {
    const { controller, connection } = await createHostController();
    connection.sent = [];

    await controller.handleLocalPlaybackEvent({
      type: "local.track_changed",
      playback: {
        track: { videoId: "clicked-song" },
        paused: false,
        positionSeconds: 0,
        buffering: false,
      },
    });
    connection.sent = [];

    await controller.handleLocalPlaybackEvent({
      type: "local.progress",
      playback: {
        track: { videoId: "clicked-song" },
        paused: false,
        positionSeconds: 5,
        buffering: false,
      },
    });
    await controller.handleLocalPlaybackEvent({
      type: "local.play",
      playback: {
        track: { videoId: "clicked-song" },
        paused: false,
        positionSeconds: 6,
        buffering: false,
      },
    });

    expect(connection.sent).toEqual([]);
  });

  it("confirms Resume playback and advances its next natural end", async () => {
    vi.useFakeTimers();
    try {
      const { controller, connection, tabs } = await createHostController();
      await controller.handleLocalPlaybackEvent({
        type: "local.progress",
        playback: {
          track: {
            videoId: "current-track",
            title: "Correct Song",
            artist: "Correct Artist",
          },
          paused: false,
          positionSeconds: 20,
          buffering: false,
        },
      });
      const requeued = roomState();
      requeued.revision = 3;
      requeued.queue = [
        {
          id: "requeued",
          track: {
            videoId: "current-track",
            title: "Correct Song",
            artist: "Correct Artist",
          },
          addedByParticipantId: "host",
          addedAtMs: Date.now(),
        },
        {
          id: "next",
          track: { videoId: "queued-next" },
          addedByParticipantId: "host",
          addedAtMs: Date.now(),
        },
      ];
      requeued.playback = {
        track: null,
        paused: true,
        positionSeconds: 0,
        effectiveAtMs: Date.now(),
      };
      connection.snapshotOnHostRequeue = requeued;
      connection.sent = [];
      tabs.playback = {
        track: { videoId: "clicked-song" },
        paused: false,
        positionSeconds: 0,
        buffering: false,
      };

      await controller.handleLocalPlaybackEvent({
        type: "local.track_changed",
        playback: tabs.playback,
      });
      await vi.advanceTimersByTimeAsync(1_500);
      await flushControllerWork();

      expect(controller.getView().localSyncStatus).toBe("ready_to_resume");
      expect(tabs.playback.track?.videoId).toBe("clicked-song");
      expect(connection.sent).toContainEqual(
        expect.objectContaining({
          type: "playback.host_requeue",
          track: {
            videoId: "current-track",
            title: "Correct Song",
            artist: "Correct Artist",
          },
        }),
      );

      const resumed = roomState();
      resumed.revision = 4;
      resumed.queue = [requeued.queue[1]!];
      resumed.playback = {
        track: { videoId: "current-track" },
        paused: false,
        positionSeconds: 0,
        effectiveAtMs: Date.now(),
      };
      connection.snapshotOnSkip = resumed;
      connection.sent = [];
      tabs.failAfterApply = true;

      await controller.resumePlayback();
      await flushControllerWork();

      expect(controller.getView().localSyncStatus).toBe("in_sync");
      expect(tabs.playback.track?.videoId).toBe("current-track");
      expect(
        connection.sent.filter(
          (message) =>
            message.type === "participant.status" &&
            message.syncStatus === "in_sync",
        ),
      ).toHaveLength(1);

      const afterEnd = roomState();
      afterEnd.revision = 5;
      afterEnd.queue = [];
      afterEnd.playback = {
        track: { videoId: "queued-next" },
        paused: false,
        positionSeconds: 0,
        effectiveAtMs: Date.now(),
      };
      connection.snapshotOnSkip = afterEnd;
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
      await flushControllerWork();

      expect(
        connection.sent.filter((message) => message.type === "playback.skip"),
      ).toHaveLength(1);
      expect(tabs.playback.track?.videoId).toBe("queued-next");
      expect(controller.getView().localSyncStatus).toBe("in_sync");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores late snapshots and expiration events from a replaced party", async () => {
    const oldConnection = new FakeConnection();
    const newConnection = new FakeConnection();
    const tabs = new FakeTabs();
    const storage = new FakeStorage({
      roomId: "old-room",
      participantId: "old-host",
      participantToken: "old-token",
      displayName: "Old Host",
      localSyncStatus: "in_sync",
    });
    const controller = new PartyController(
      {
        async createRoom() {
          return {
            roomId: "new-room",
            inviteCode: "NEW123",
            inviteUrl: "https://party.example/join/NEW123",
            participantId: "new-host",
            participantToken: "new-token",
          };
        },
        async joinRoom() {
          throw new Error("Not used");
        },
        async leaveRoom() {
          throw new Error("Not used");
        },
      },
      storage,
      tabs,
      (credentials) =>
        credentials.roomId === "old-room" ? oldConnection : newConnection,
      () => undefined,
    );

    await controller.initialize();
    const oldState = roomState();
    oldState.roomId = "old-room";
    oldState.hostParticipantId = "old-host";
    oldConnection.emitSnapshot(oldState);
    await flushControllerWork();

    await controller.createParty("New Host");
    const newState = roomState();
    newState.roomId = "new-room";
    newState.hostParticipantId = "new-host";
    newState.playback.track = { videoId: "new-party-track" };
    newConnection.emitSnapshot(newState);
    await flushControllerWork();

    const staleState = roomState();
    staleState.roomId = "old-room";
    staleState.hostParticipantId = "old-host";
    staleState.playback.track = { videoId: "stale-old-track" };
    oldConnection.emitSnapshot(staleState);
    oldConnection.emitConnectionState("expired");
    await flushControllerWork();

    expect(controller.getView().roomId).toBe("new-room");
    expect(controller.getView().state?.roomId).toBe("new-room");
    expect(storage.saved?.roomId).toBe("new-room");
    expect(tabs.applied.at(-1)?.track?.videoId).not.toBe("stale-old-track");
  });

  it("accepts a host-selected song when the new party has no current track", async () => {
    const { controller, connection } = await createHostController();
    const empty = roomState();
    empty.revision = 3;
    empty.playback = {
      track: null,
      paused: true,
      positionSeconds: 0,
      effectiveAtMs: Date.now(),
    };
    connection.emitSnapshot(empty);
    await flushControllerWork();
    connection.sent = [];

    await controller.handleLocalPlaybackEvent({
      type: "local.track_changed",
      playback: {
        track: { videoId: "host-selected" },
        paused: false,
        positionSeconds: 0,
        buffering: false,
      },
    });

    expect(
      connection.sent.filter((message) => message.type === "playback.host_state"),
    ).toHaveLength(1);
    expect(connection.sent).toContainEqual(
      expect.objectContaining({
        type: "playback.host_state",
        playback: expect.objectContaining({
          track: { videoId: "host-selected" },
        }),
      }),
    );
  });

  it("suppresses duplicate native events until the queued track finishes applying", async () => {
    const { controller, connection, tabs } = await createHostController();
    const advanced = roomState();
    advanced.revision = 3;
    advanced.playback = {
      track: { videoId: "queued-next" },
      paused: false,
      positionSeconds: 0,
      effectiveAtMs: Date.now(),
    };
    connection.snapshotOnSkip = advanced;
    connection.sent = [];
    tabs.applicationResult = "navigating";

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
    await flushControllerWork();

    await controller.handleLocalPlaybackEvent({
      type: "local.progress",
      playback: {
        track: { videoId: "youtube-native-next" },
        paused: false,
        positionSeconds: 2,
        buffering: false,
      },
    });
    await controller.handleLocalPlaybackEvent({
      type: "local.ended",
      playback: {
        track: { videoId: "youtube-native-next" },
        paused: true,
        positionSeconds: 3,
        durationSeconds: 3,
        buffering: false,
      },
    });

    expect(
      connection.sent.filter((message) => message.type === "playback.skip"),
    ).toHaveLength(1);

    tabs.applicationResult = "applied";
    await controller.handleContentReady();
    await controller.handleLocalPlaybackEvent({
      type: "local.pause",
      playback: {
        track: { videoId: "queued-next" },
        paused: true,
        positionSeconds: 4,
        buffering: false,
      },
    });

    expect(controller.getView().localSyncStatus).toBe("in_sync");
    expect(
      connection.sent.filter((message) => message.type === "playback.host_state"),
    ).toHaveLength(1);
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
