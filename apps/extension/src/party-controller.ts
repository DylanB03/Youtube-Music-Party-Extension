import {
  type CreateRoomResponse,
  type ExtensionRequest,
  type JoinRoomResponse,
  type LocalPlaybackEvent,
  type LocalPlaybackState,
  type PartyPlaybackState,
  type PartyRoomState,
  type RoomPermissions,
  type SyncStatus,
  type Track,
  currentPlaybackPositionSeconds,
} from "@ytm-party/shared";
import {
  canonicalPlaybackNeedsApplication,
  decideGuestPlaybackAction,
  localToPartyPlayback,
  playbackKey,
} from "./playback-policy";
import type { PlaybackApplicationResult } from "./playback-application";
import type {
  ActiveSession,
  MutationMessage,
  PartyConnection,
  SessionView,
  StoredSession,
} from "./session-types";

type StateListener = (view: SessionView) => void;
type PartyApiPort = {
  createRoom(
    displayName: string,
    initialPlayback: PartyPlaybackState,
  ): Promise<CreateRoomResponse>;
  joinRoom(inviteCode: string, displayName: string): Promise<JoinRoomResponse>;
};
type SessionStoragePort = {
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
};
type TabGatewayPort = {
  getPlayback(): Promise<LocalPlaybackState>;
  applyPlayback(playback: PartyPlaybackState): Promise<PlaybackApplicationResult>;
  getContextSong(tabId?: number): Promise<Track | null>;
};
type ConnectionFactory = (credentials: StoredSession) => PartyConnection;

export class PartyController {
  private session: ActiveSession | null = null;
  private mutationRevision = 0;
  private mutationChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly api: PartyApiPort,
    private readonly storage: SessionStoragePort,
    private readonly tabs: TabGatewayPort,
    private readonly createConnection: ConnectionFactory,
    private readonly onStateChanged: StateListener,
  ) {}

  async initialize(): Promise<void> {
    const saved = await this.storage.load();
    if (!saved) return;
    await this.connect(saved);
  }

  async createParty(displayName: string): Promise<SessionView> {
    const local = await this.tabs.getPlayback();
    const initialPlayback: PartyPlaybackState = {
      track: local.track,
      paused: local.paused,
      positionSeconds: local.positionSeconds,
      effectiveAtMs: Date.now(),
    };
    const created = await this.api.createRoom(displayName, initialPlayback);
    await this.connect({
      roomId: created.roomId,
      participantId: created.participantId,
      participantToken: created.participantToken,
      displayName,
      localSyncStatus: "in_sync",
    });
    return this.getView();
  }

  async joinParty(inviteCode: string, displayName: string): Promise<SessionView> {
    const joined = await this.api.joinRoom(inviteCode, displayName);
    await this.connect({
      roomId: joined.roomId,
      participantId: joined.participantId,
      participantToken: joined.participantToken,
      displayName,
      localSyncStatus: "ready_to_join",
    });
    return this.getView();
  }

  async leaveParty(): Promise<SessionView> {
    this.session?.client.disconnect();
    this.session = null;
    this.mutationRevision = 0;
    this.mutationChain = Promise.resolve();
    await this.storage.clear();
    this.publishState();
    return this.getView();
  }

  async joinPlayback(): Promise<SessionView> {
    const applied = await this.applyCanonicalPlayback();
    if (applied) await this.setLocalSyncStatus("in_sync");
    return this.getView();
  }

  async updatePermissions(permissions: RoomPermissions): Promise<SessionView> {
    return this.enqueueMutation((operationId, expectedRevision) => ({
      type: "permissions.update",
      operationId,
      permissions,
      expectedRevision,
    }));
  }

  async addTrack(track: Track): Promise<SessionView> {
    return this.enqueueMutation((operationId, expectedRevision) => ({
      type: "queue.add",
      operationId,
      track,
      expectedRevision,
    }));
  }

  async removeQueueItem(queueItemId: string): Promise<SessionView> {
    return this.enqueueMutation((operationId, expectedRevision) => ({
      type: "queue.remove",
      operationId,
      queueItemId,
      expectedRevision,
    }));
  }

  async reorderQueue(queueItemIds: string[]): Promise<SessionView> {
    return this.enqueueMutation((operationId, expectedRevision) => ({
      type: "queue.reorder",
      operationId,
      queueItemIds,
      expectedRevision,
    }));
  }

  async skip(): Promise<SessionView> {
    return this.enqueueMutation((operationId, expectedRevision) => ({
      type: "playback.skip",
      operationId,
      expectedRevision,
    }));
  }

  async addContextSong(tabId?: number): Promise<void> {
    const track = await this.tabs.getContextSong(tabId);
    if (!track) {
      const message = "No YouTube Music song was detected for that menu action.";
      if (this.session) {
        this.session.lastError = message;
        this.publishState();
      }
      throw new Error(message);
    }
    await this.addTrack(track);
  }

  async handleContentReady(): Promise<void> {
    const status = this.session?.localSyncStatus;
    if (status !== "navigating" && status !== "in_sync") return;
    const applied = await this.applyCanonicalPlayback();
    if (status === "navigating" && applied) {
      await this.setLocalSyncStatus("in_sync");
    }
  }

  async handleLocalPlaybackEvent(event: LocalPlaybackEvent): Promise<void> {
    const session = this.session;
    if (!session?.state) return;

    const isHost = session.state.hostParticipantId === session.participantId;
    if (event.type === "local.ended") {
      if (isHost) await this.skip();
      return;
    }

    if (isHost) {
      await this.handleHostPlaybackEvent(event);
      return;
    }

    await this.handleGuestPlaybackEvent(event);
  }

  getView(): SessionView {
    return {
      roomId: this.session?.roomId ?? null,
      participantId: this.session?.participantId ?? null,
      displayName: this.session?.displayName ?? null,
      localSyncStatus: this.session?.localSyncStatus ?? "not_joined",
      state: this.session?.state ?? null,
      lastError: this.session?.lastError,
    };
  }

  private async enqueueMutation(
    buildMessage: (operationId: string, expectedRevision: number) => MutationMessage,
  ): Promise<SessionView> {
    const execution = this.mutationChain.then(async () => {
      const session = this.requireSession();
      const operationId = crypto.randomUUID();
      const expectedRevision = this.mutationRevision || this.requireRevision();
      const result = await session.client.sendOperation(
        buildMessage(operationId, expectedRevision),
      );
      this.mutationRevision = result.revision;

      if (!result.accepted) {
        const message = result.error?.message ?? "The room rejected the action.";
        session.lastError = message;
        this.publishState();
        throw new Error(message);
      }
    });
    this.mutationChain = execution.catch(() => undefined);
    await execution;
    return this.getView();
  }

  private async connect(credentials: StoredSession): Promise<void> {
    this.session?.client.disconnect();
    this.mutationRevision = 0;
    this.mutationChain = Promise.resolve();
    const client = this.createConnection(credentials);
    this.session = {
      ...credentials,
      client,
      state: null,
      resumeSyncStatus:
        credentials.localSyncStatus === "reconnecting"
          ? "ready_to_join"
          : credentials.localSyncStatus,
    };

    client.onSnapshot((state) => {
      void this.handleSnapshot(state);
    });
    client.onError((message) => {
      if (!this.session) return;
      this.session.lastError = message;
      this.publishState();
    });
    client.onConnectionState((state) => {
      void this.handleConnectionState(state);
    });
    client.connect();
    client.send({
      type: "participant.status",
      syncStatus: credentials.localSyncStatus,
    });
    await this.storage.save(credentials);
  }

  private async handleSnapshot(state: PartyRoomState): Promise<void> {
    if (!this.session) return;
    const previousPlaybackKey = this.session.state
      ? playbackKey(this.session.state.playback)
      : null;
    this.session.state = state;
    this.mutationRevision = Math.max(this.mutationRevision, state.revision);
    this.session.lastError = undefined;

    const playbackChanged = previousPlaybackKey !== playbackKey(state.playback);
    if (playbackChanged && this.session.localSyncStatus === "in_sync") {
      await this.reconcileCanonicalPlayback();
    }
    this.publishState();
  }

  private async handleConnectionState(
    state: "connecting" | "connected" | "reconnecting" | "closed",
  ): Promise<void> {
    const session = this.session;
    if (!session) return;

    if (state === "reconnecting") {
      if (session.localSyncStatus !== "reconnecting") {
        session.resumeSyncStatus = session.localSyncStatus;
      }
      session.localSyncStatus = "reconnecting";
      this.publishState();
      return;
    }

    if (state !== "connected" || session.localSyncStatus !== "reconnecting") return;
    session.localSyncStatus = session.resumeSyncStatus;
    session.client.send({
      type: "participant.status",
      syncStatus: session.localSyncStatus,
    });
    await this.storage.save({
      roomId: session.roomId,
      participantId: session.participantId,
      participantToken: session.participantToken,
      displayName: session.displayName,
      localSyncStatus: session.localSyncStatus,
    });
    this.publishState();
  }

  private async handleHostPlaybackEvent(event: LocalPlaybackEvent): Promise<void> {
    if (
      event.type !== "local.play" &&
      event.type !== "local.pause" &&
      event.type !== "local.seek" &&
      event.type !== "local.track_changed"
    ) {
      return;
    }
    if (!event.playback.track) return;

    await this.enqueueMutation((operationId, expectedRevision) => ({
      type: "playback.host_state",
      operationId,
      playback: localToPartyPlayback(event.playback, Date.now()),
      expectedRevision,
    }));
  }

  private async handleGuestPlaybackEvent(event: LocalPlaybackEvent): Promise<void> {
    if (this.session?.localSyncStatus !== "in_sync") return;

    const playback = this.session.state?.playback;
    if (!playback) return;

    const nowMs = Date.now() + this.session.client.clockOffsetMs;
    const decision = decideGuestPlaybackAction(event, playback, nowMs);
    switch (decision) {
      case "out_of_sync":
        await this.setLocalSyncStatus("out_of_sync");
        return;

      case "track_unavailable":
        await this.setLocalSyncStatus("track_unavailable");
        return;

      case "correct_drift":
        await this.applyCanonicalPlayback();
        return;

      case "ignore":
        return;
    }
  }

  private async reconcileCanonicalPlayback(): Promise<void> {
    const session = this.requireSession();
    const canonical = session.state?.playback;
    if (!canonical?.track) return;

    const local = await this.tabs.getPlayback();
    const nowMs = Date.now() + session.client.clockOffsetMs;
    if (!canonicalPlaybackNeedsApplication(local, canonical, nowMs)) return;

    await this.applyCanonicalPlayback();
  }

  private async applyCanonicalPlayback(): Promise<boolean> {
    const session = this.requireSession();
    const canonical = session.state?.playback;
    if (!canonical?.track) return true;

    const nowMs = Date.now() + session.client.clockOffsetMs;
    const playback: PartyPlaybackState = {
      ...canonical,
      positionSeconds: currentPlaybackPositionSeconds(canonical, nowMs),
      effectiveAtMs: Date.now(),
    };

    try {
      const result = await this.tabs.applyPlayback(playback);
      if (result === "navigating") {
        await this.setLocalSyncStatus("navigating");
        return false;
      }
      return true;
    } catch {
      await this.setLocalSyncStatus("track_unavailable");
      return false;
    }
  }

  private async setLocalSyncStatus(status: SyncStatus): Promise<void> {
    const session = this.requireSession();
    if (session.localSyncStatus === status) return;
    session.localSyncStatus = status;
    session.client.send({ type: "participant.status", syncStatus: status });
    await this.storage.save({
      roomId: session.roomId,
      participantId: session.participantId,
      participantToken: session.participantToken,
      displayName: session.displayName,
      localSyncStatus: status,
    });
    this.publishState();
  }

  private requireSession(): ActiveSession {
    if (!this.session) throw new Error("Join or create a party first.");
    return this.session;
  }

  private requireRevision(): number {
    const revision = this.requireSession().state?.revision;
    if (!revision) throw new Error("Room snapshot is not ready yet.");
    return revision;
  }

  private publishState(): void {
    this.onStateChanged(this.getView());
  }
}

export type PartyControllerRequest = Extract<
  ExtensionRequest,
  { type: `party.${string}` | "content.localPlaybackEvent" | "content.ready" }
>;
