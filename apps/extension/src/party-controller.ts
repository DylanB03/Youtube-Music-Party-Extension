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
} from "@ytm-party/shared";
import {
  localToPartyPlayback,
  playbackKey,
} from "./playback-policy";
import type { PlaybackApplicationResult } from "./playback-application";
import { PartyMutationCoordinator } from "./party-mutation-coordinator";
import {
  PlaybackSynchronizer,
  type PlaybackSyncResult,
} from "./playback-synchronizer";
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
type PendingAutoAdvance = {
  key: string;
  revision: number;
  startedAtMs: number;
};

const AUTO_ADVANCE_EVENT_SUPPRESSION_MS = 15_000;

export class PartyController {
  private session: ActiveSession | null = null;
  private terminalError: string | undefined;
  private lastAutoAdvanceKey: string | null = null;
  private pendingAutoAdvance: PendingAutoAdvance | null = null;
  private readonly mutations = new PartyMutationCoordinator();
  private readonly playback: PlaybackSynchronizer;

  constructor(
    private readonly api: PartyApiPort,
    private readonly storage: SessionStoragePort,
    private readonly tabs: TabGatewayPort,
    private readonly createConnection: ConnectionFactory,
    private readonly onStateChanged: StateListener,
  ) {
    this.playback = new PlaybackSynchronizer(tabs);
  }

  async initialize(): Promise<void> {
    const saved = await this.storage.load();
    if (!saved) return;
    await this.connect(saved);
  }

  async createParty(displayName: string): Promise<SessionView> {
    this.terminalError = undefined;
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
    this.terminalError = undefined;
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
    this.terminalError = undefined;
    this.mutations.reset();
    await this.storage.clear();
    this.publishState();
    return this.getView();
  }

  async joinPlayback(): Promise<SessionView> {
    const session = this.requireSession();
    const result = await this.playback.apply(session);
    if (result === "applied") await this.setLocalSyncStatus("in_sync");
    else {
      await this.handlePlaybackResult(result, {
        keepHostInSync: session.state?.hostParticipantId === session.participantId,
      });
    }
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
    const session = this.requireSession();
    const result = await this.playback.apply(session);
    if (status === "navigating" && result === "applied") {
      await this.setLocalSyncStatus("in_sync");
    } else {
      await this.handlePlaybackResult(result, {
        keepHostInSync: session.state?.hostParticipantId === session.participantId,
      });
    }
  }

  async handleLocalPlaybackEvent(event: LocalPlaybackEvent): Promise<void> {
    const session = this.session;
    if (!session?.state) return;

    const isHost = session.state.hostParticipantId === session.participantId;
    if (event.type === "local.ended") {
      if (isHost) await this.advanceAfterTrackEnd(session.state);
      return;
    }

    if (isHost) {
      if (this.shouldIgnoreHostEventDuringAutoAdvance(event)) return;
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
      lastError: this.session?.lastError ?? this.terminalError,
    };
  }

  private async enqueueMutation(
    buildMessage: (operationId: string, expectedRevision: number) => MutationMessage,
  ): Promise<SessionView> {
    const session = this.requireSession();
    const result = await this.mutations.execute(
      session.client,
      this.requireRevision(),
      buildMessage,
    );
    if (!result.accepted) {
      const message = result.error?.message ?? "The room rejected the action.";
      session.lastError = message;
      this.publishState();
      throw new Error(message);
    }
    return this.getView();
  }

  private async connect(credentials: StoredSession): Promise<void> {
    this.session?.client.disconnect();
    this.mutations.reset();
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
    const session = this.session;
    if (!session) return;
    const previousPlaybackKey = session.state
      ? playbackKey(session.state.playback)
      : null;
    session.state = state;
    this.mutations.observeRevision(state.revision);
    session.lastError = undefined;

    const playbackChanged = previousPlaybackKey !== playbackKey(state.playback);
    if (playbackChanged && session.localSyncStatus === "in_sync") {
      const result = await this.playback.reconcile(session);
      await this.handlePlaybackResult(result, {
        keepHostInSync: state.hostParticipantId === session.participantId,
      });
      if (state.hostParticipantId === session.participantId) {
        this.clearAutoAdvanceAfterCanonicalApply(state, result);
      }
    }
    this.publishState();
  }

  private async handleConnectionState(
    state: "connecting" | "connected" | "reconnecting" | "closed" | "expired",
  ): Promise<void> {
    const session = this.session;
    if (!session) return;

    if (state === "expired") {
      session.client.disconnect();
      this.session = null;
      this.mutations.reset();
      this.terminalError = "This party has expired. Create or join another party.";
      await this.storage.clear();
      this.publishState();
      return;
    }

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

  private async advanceAfterTrackEnd(state: PartyRoomState): Promise<void> {
    const key = `${state.revision}:${state.playback.track?.videoId ?? "none"}`;
    if (this.lastAutoAdvanceKey === key) return;
    this.lastAutoAdvanceKey = key;
    this.pendingAutoAdvance = {
      key,
      revision: state.revision,
      startedAtMs: Date.now(),
    };

    try {
      await this.skip();
    } catch (error) {
      this.lastAutoAdvanceKey = null;
      this.pendingAutoAdvance = null;
      throw error;
    }
  }

  private shouldIgnoreHostEventDuringAutoAdvance(event: LocalPlaybackEvent): boolean {
    const pending = this.pendingAutoAdvance;
    if (!pending) return false;
    if (Date.now() - pending.startedAtMs > AUTO_ADVANCE_EVENT_SUPPRESSION_MS) {
      this.pendingAutoAdvance = null;
      return false;
    }
    return (
      event.type === "local.play" ||
      event.type === "local.pause" ||
      event.type === "local.seek" ||
      event.type === "local.track_changed"
    );
  }

  private clearAutoAdvanceAfterCanonicalApply(
    state: PartyRoomState,
    result: PlaybackSyncResult,
  ): void {
    const pending = this.pendingAutoAdvance;
    if (!pending) return;
    if (state.revision <= pending.revision) return;
    if (result === "track_unavailable" || result === "navigating") return;
    this.pendingAutoAdvance = null;
  }

  private async handleGuestPlaybackEvent(event: LocalPlaybackEvent): Promise<void> {
    if (this.session?.localSyncStatus !== "in_sync") return;

    const decision = this.playback.decideGuestAction(event, this.session);
    switch (decision) {
      case "out_of_sync":
        await this.setLocalSyncStatus("out_of_sync");
        return;

      case "track_unavailable":
        await this.setLocalSyncStatus("track_unavailable");
        return;

      case "correct_drift":
        await this.handlePlaybackResult(await this.playback.apply(this.session));
        return;

      case "ignore":
        return;
    }
  }

  private async handlePlaybackResult(
    result: PlaybackSyncResult,
    options: { keepHostInSync?: boolean } = {},
  ): Promise<void> {
    if (options.keepHostInSync && result === "track_unavailable") {
      const session = this.requireSession();
      session.lastError =
        "YouTube Music has not loaded the party track yet. Keeping host playback active.";
      this.publishState();
      return;
    }
    if (result === "navigating") {
      await this.setLocalSyncStatus("navigating");
    } else if (result === "track_unavailable") {
      await this.setLocalSyncStatus("track_unavailable");
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
