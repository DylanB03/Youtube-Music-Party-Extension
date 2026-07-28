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
import { isNearTrackEnd, looksLikeNaturalTrackAdvance } from "./youtube-music/playback-transition";
import type { PlaybackApplicationResult } from "./playback-application";
import { PartyMutationCoordinator } from "./party-mutation-coordinator";
import {
  PlaybackSynchronizer,
  type PlaybackSyncResult,
} from "./playback-synchronizer";
import type {
  ActiveSession,
  ConnectionState,
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
  leaveRoom(
    roomId: string,
    participantId: string,
    participantToken: string,
  ): Promise<void>;
};
type SessionStoragePort = {
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
};
type TabGatewayPort = {
  getPlayback(tabId?: number): Promise<LocalPlaybackState>;
  applyPlayback(
    playback: PartyPlaybackState,
    tabId?: number,
  ): Promise<PlaybackApplicationResult>;
  getContextSong(tabId?: number): Promise<Track | null>;
  resolveActivePartyTabId(): Promise<number | null>;
};
type ConnectionFactory = (credentials: StoredSession) => PartyConnection;
type PendingAutoAdvance = {
  key: string;
  revision: number;
  startedAtMs: number;
};

const AUTO_ADVANCE_EVENT_SUPPRESSION_MS = 15_000;
const EXTERNAL_NAV_DEFER_MS = 1_500;
const LOCAL_DRIFT_MONITOR_INTERVAL_MS = 1_000;
const LOCAL_DRIFT_CORRECTION_COOLDOWN_MS = 3_000;
const PLAYBACK_FAILURES_BEFORE_MANUAL_RECOVERY = 3;

export class PartyController {
  private session: ActiveSession | null = null;
  private terminalError: string | undefined;
  private partyTabId: number | null = null;
  private lastAutoAdvanceKey: string | null = null;
  private pendingAutoAdvance: PendingAutoAdvance | null = null;
  private hostRequeueInFlight = false;
  private hostResumeInFlight = false;
  private externalNavTimer: ReturnType<typeof setTimeout> | null = null;
  private localDriftMonitorTimer: ReturnType<typeof setInterval> | null = null;
  private localDriftMonitorInFlight = false;
  private lastLocalDriftCorrectionAtMs = 0;
  private guestAdBreakActive = false;
  private playbackFailureKey: string | null = null;
  private playbackFailureCount = 0;
  private hostCanonicalMaxTrackId: string | null = null;
  private hostCanonicalMaxPositionSeconds = 0;
  private lastHostCanonicalPlayback: LocalPlaybackState | null = null;
  private lastHostLocalPlayback: LocalPlaybackState | null = null;
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
    this.partyTabId = await this.tabs.resolveActivePartyTabId();
    const local = await this.tabs.getPlayback(this.partyTabId ?? undefined);
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
    this.partyTabId = await this.tabs.resolveActivePartyTabId();
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
    const session = this.session;
    // Start remote cleanup while the credentials are still available, but
    // never let network or room state gate the user's local escape hatch.
    const remoteLeave = session
      ? this.api
          .leaveRoom(
            session.roomId,
            session.participantId,
            session.participantToken,
          )
          .catch(() => undefined)
      : null;

    this.resetPlaybackRuntimeState();
    this.session = null;
    session?.client.disconnect();
    this.terminalError = undefined;
    this.partyTabId = null;
    this.mutations.reset();
    this.publishState();
    await this.storage.clear();
    void remoteLeave;
    return this.getView();
  }

  async joinPlayback(): Promise<SessionView> {
    const session = this.requireSession();
    const result = await this.playback.apply(session, this.partyTabId ?? undefined);
    if (this.session !== session) return this.getView();
    if (result === "applied") {
      if (session.state?.hostParticipantId === session.participantId) {
        this.clearAutoAdvanceAfterCanonicalApply(session.state, result);
      }
      await this.setLocalSyncStatus("in_sync");
    } else {
      await this.handlePlaybackResult(result);
    }
    return this.getView();
  }

  async resumePlayback(): Promise<SessionView> {
    const session = this.requireSession();
    if (session.state?.hostParticipantId !== session.participantId) {
      return this.joinPlayback();
    }
    if (!session.state?.queue.length) {
      session.lastError = "Add a song to the queue, then resume.";
      this.publishState();
      return this.getView();
    }

    this.cancelDeferredExternalNavigation();
    this.hostResumeInFlight = true;
    try {
      await this.skip();
      if (this.session !== session) return this.getView();
      const playback = await this.waitForCanonicalPlayback(session);
      if (this.session !== session) return this.getView();
      if (!playback?.track) {
        session.lastError = "Add a song to the queue, then resume.";
        this.publishState();
        return this.getView();
      }

      await this.setLocalSyncStatus("navigating");
      this.resetHostCanonicalTracking(playback.track.videoId);
      const result = await this.playback.apply(session, this.partyTabId ?? undefined);
      if (result === "applied") {
        await this.setLocalSyncStatus("in_sync");
      } else if (result === "track_unavailable") {
        session.lastError = "Could not load the party track. Try again.";
        await this.setLocalSyncStatus("track_unavailable");
      } else {
        await this.handlePlaybackResult(result);
      }
    } finally {
      if (this.session === session) {
        this.hostResumeInFlight = false;
      }
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

  async handleContentReady(tabId?: number): Promise<void> {
    this.adoptPartyTab(tabId);
    const status = this.session?.localSyncStatus;
    if (status !== "navigating" && status !== "in_sync") return;
    const session = this.requireSession();
    const result = await this.playback.apply(session, this.partyTabId ?? undefined);
    if (this.session !== session) return;
    if (session.state?.hostParticipantId === session.participantId) {
      this.clearAutoAdvanceAfterCanonicalApply(session.state, result);
    }
    if (status === "navigating" && result === "applied") {
      await this.setLocalSyncStatus("in_sync");
    } else {
      await this.handlePlaybackResult(result);
    }
  }

  async handleLocalPlaybackEvent(
    event: LocalPlaybackEvent,
    tabId?: number,
  ): Promise<void> {
    const session = this.session;
    if (!session?.state) return;
    if (!this.adoptOrMatchesPartyTab(tabId)) return;

    const isHost = session.state.hostParticipantId === session.participantId;
    if (isHost) {
      await this.handleHostLocalEvent(session, event);
      return;
    }

    if (event.type === "local.ended") return;
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
    this.resetPlaybackRuntimeState();
    this.session?.client.disconnect();
    this.mutations.reset();
    const client = this.createConnection(credentials);
    this.session = {
      ...credentials,
      client,
      state: null,
      resumeSyncStatus:
        credentials.localSyncStatus === "reconnecting" ||
        credentials.localSyncStatus === "connection_failed"
          ? "ready_to_join"
          : credentials.localSyncStatus,
    };

    client.onSnapshot((state) => {
      if (this.session?.client !== client) return;
      void this.handleSnapshot(state);
    });
    client.onError((message) => {
      if (this.session?.client !== client) return;
      this.session.lastError = message;
      this.publishState();
    });
    client.onConnectionState((state) => {
      if (this.session?.client !== client) return;
      void this.handleConnectionState(state);
    });
    this.startLocalDriftMonitor();
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
    if (
      playbackChanged &&
      this.shouldReconcileCanonicalPlayback(session, state)
    ) {
      const result = await this.playback.reconcile(
        session,
        this.partyTabId ?? undefined,
      );
      if (this.session !== session) return;
      // Snapshot handlers can overlap while YouTube Music is navigating. A
      // result started for an older snapshot must not clear transition guards
      // or change recovery state for the newer canonical song.
      if (session.state !== state) {
        this.publishState();
        return;
      }
      await this.handlePlaybackResult(result);
      if (this.session !== session) return;
      if (state.hostParticipantId === session.participantId) {
        this.clearAutoAdvanceAfterCanonicalApply(state, result);
      }
      if (
        !this.hostResumeInFlight &&
        session.localSyncStatus === "ready_to_resume" &&
        result === "applied" &&
        state.playback.track
      ) {
        await this.setLocalSyncStatus("in_sync");
      }
    }
    this.publishState();
  }

  private async handleConnectionState(
    state: ConnectionState,
  ): Promise<void> {
    const session = this.session;
    if (!session) return;

    if (state === "expired") {
      this.resetPlaybackRuntimeState();
      session.client.disconnect();
      this.session = null;
      this.partyTabId = null;
      this.mutations.reset();
      this.terminalError = "This party has expired. Create or join another party.";
      await this.storage.clear();
      this.publishState();
      return;
    }

    if (state === "reconnecting" || state === "failed") {
      if (
        session.localSyncStatus !== "reconnecting" &&
        session.localSyncStatus !== "connection_failed"
      ) {
        session.resumeSyncStatus = session.localSyncStatus;
      }
      session.localSyncStatus =
        state === "failed" ? "connection_failed" : "reconnecting";
      if (state === "failed") {
        session.lastError =
          "Could not reconnect to this party. Automatic retries will continue, or you can leave and start a new session.";
      }
      this.publishState();
      return;
    }

    if (
      state !== "connected" ||
      (session.localSyncStatus !== "reconnecting" &&
        session.localSyncStatus !== "connection_failed")
    ) {
      return;
    }
    session.localSyncStatus = session.resumeSyncStatus;
    session.lastError = undefined;
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

  private async handleHostLocalEvent(
    session: ActiveSession,
    event: LocalPlaybackEvent,
  ): Promise<void> {
    // Ignore every transient native event until the authoritative next party
    // track has actually been applied. Otherwise progress or duplicate ended
    // events from YouTube Music's auto-next can skip multiple queued songs.
    if (this.shouldIgnoreHostEventDuringAutoAdvance()) return;

    const previousLocal = this.lastHostLocalPlayback;
    this.lastHostLocalPlayback = event.playback;
    const canonical = session.state?.playback;
    if (canonical) this.recordHostCanonicalProgress(event.playback, canonical);

    // While waiting for the host to select Resume, their local playback is
    // intentionally local-only: it must not advance the queue or overwrite the
    // canonical playback state.
    if (session.localSyncStatus === "ready_to_resume") return;

    if (event.type === "local.ended") {
      this.cancelDeferredExternalNavigation();
      if (session.state) await this.advanceAfterTrackEnd(session.state);
      return;
    }

    const canonicalTrackId = canonical?.track?.videoId;
    const localTrackId = event.playback.track?.videoId;
    const playbackDiverged = Boolean(
      canonicalTrackId && localTrackId && canonicalTrackId !== localTrackId,
    );
    const hasCanonicalEndEvidence = Boolean(
      canonicalTrackId &&
        this.lastHostCanonicalPlayback?.track?.videoId === canonicalTrackId &&
        looksLikeNaturalTrackAdvance(
          this.lastHostCanonicalPlayback,
          this.hostCanonicalMaxPositionSeconds,
        ),
    );

    if (playbackDiverged && hasCanonicalEndEvidence) {
      this.cancelDeferredExternalNavigation();
      if (session.state) await this.advanceAfterTrackEnd(session.state);
      return;
    }

    // A wrong-track progress report without end-of-track evidence is commonly
    // stale YouTube Music metadata just after a party navigation. Restore the
    // current canonical song locally; advancing the shared queue here can
    // consume every queued (or newly added) song in a loop.
    if (
      playbackDiverged &&
      event.type === "local.progress" &&
      this.externalNavTimer === null
    ) {
      const result = await this.playback.reconcile(
        session,
        this.partyTabId ?? undefined,
      );
      if (this.session === session) {
        await this.handlePlaybackResult(result);
      }
      return;
    }

    if (canonical && this.isExternalHostNavigation(event, canonical, previousLocal)) {
      if (session.localSyncStatus === "in_sync") {
        this.scheduleDeferredExternalNavigation();
        return;
      }
      await this.handleHostExternalNavigation();
      return;
    }

    await this.handleHostPlaybackEvent(event);
  }

  // Detects the host manually switching to a different song outside the
  // extension. Only `local.track_changed` qualifies: the adapter classifies an
  // end-of-track transition (YouTube Music auto-advancing to its own next song)
  // as `local.ended`, so a `track_changed` is always a deliberate mid-song
  // switch. Reacting to play/seek/pause here would race the auto-advance, since
  // YouTube Music fires `local.play` for its auto-next song before the poll can
  // emit `local.ended`.
  private isExternalHostNavigation(
    event: LocalPlaybackEvent,
    canonical: PartyPlaybackState,
    previousLocal: LocalPlaybackState | null,
  ): boolean {
    if (event.type !== "local.track_changed") return false;
    if (this.pendingAutoAdvance) return false;
    const localTrack = event.playback.track;
    if (!localTrack || !canonical.track) return false;
    if (previousLocal?.track?.videoId === canonical.track.videoId && isNearTrackEnd(previousLocal)) {
      return false;
    }
    return localTrack.videoId !== canonical.track.videoId;
  }

  private shouldReconcileCanonicalPlayback(
    session: ActiveSession,
    state: PartyRoomState,
  ): boolean {
    if (this.hostResumeInFlight || this.hostRequeueInFlight) return false;
    if (
      session.localSyncStatus === "in_sync" ||
      session.localSyncStatus === "out_of_sync"
    ) {
      return true;
    }
    // After a host requeue the party has no current track until the host resumes
    // or adds a song. Apply server-selected playback in those cases.
    if (
      session.localSyncStatus === "ready_to_resume" &&
      state.playback.track !== null
    ) {
      return true;
    }
    return false;
  }

  private recordHostCanonicalProgress(
    playback: LocalPlaybackState,
    canonical: PartyPlaybackState,
  ): void {
    const videoId = canonical.track?.videoId;
    if (!videoId || playback.track?.videoId !== videoId) return;
    this.lastHostCanonicalPlayback = playback;
    if (this.hostCanonicalMaxTrackId !== videoId) {
      this.hostCanonicalMaxTrackId = videoId;
      this.hostCanonicalMaxPositionSeconds = 0;
    }
    this.hostCanonicalMaxPositionSeconds = Math.max(
      this.hostCanonicalMaxPositionSeconds,
      playback.positionSeconds,
    );
  }

  private resetHostCanonicalTracking(videoId: string): void {
    this.hostCanonicalMaxTrackId = videoId;
    this.hostCanonicalMaxPositionSeconds = 0;
    this.lastHostCanonicalPlayback = null;
    this.lastHostLocalPlayback = null;
  }

  private cancelDeferredExternalNavigation(): void {
    if (!this.externalNavTimer) return;
    clearTimeout(this.externalNavTimer);
    this.externalNavTimer = null;
  }

  private resetPlaybackRuntimeState(): void {
    this.cancelDeferredExternalNavigation();
    this.stopLocalDriftMonitor();
    this.lastAutoAdvanceKey = null;
    this.pendingAutoAdvance = null;
    this.hostRequeueInFlight = false;
    this.hostResumeInFlight = false;
    this.hostCanonicalMaxTrackId = null;
    this.hostCanonicalMaxPositionSeconds = 0;
    this.lastHostCanonicalPlayback = null;
    this.lastHostLocalPlayback = null;
    this.lastLocalDriftCorrectionAtMs = 0;
    this.guestAdBreakActive = false;
    this.resetPlaybackFailures();
  }

  private startLocalDriftMonitor(): void {
    if (this.localDriftMonitorTimer) return;
    this.localDriftMonitorTimer = setInterval(() => {
      void this.monitorLocalGuestDrift();
    }, LOCAL_DRIFT_MONITOR_INTERVAL_MS);
    (
      this.localDriftMonitorTimer as unknown as { unref?: () => void }
    ).unref?.();
  }

  private stopLocalDriftMonitor(): void {
    if (!this.localDriftMonitorTimer) return;
    clearInterval(this.localDriftMonitorTimer);
    this.localDriftMonitorTimer = null;
    this.localDriftMonitorInFlight = false;
  }

  private async monitorLocalGuestDrift(): Promise<void> {
    if (this.localDriftMonitorInFlight) return;
    const session = this.session;
    if (!session?.state) return;
    if (session.localSyncStatus !== "in_sync") return;
    if (session.state.hostParticipantId === session.participantId) return;
    if (!session.state.playback.track) return;
    if (
      Date.now() - this.lastLocalDriftCorrectionAtMs <
      LOCAL_DRIFT_CORRECTION_COOLDOWN_MS
    ) {
      return;
    }

    this.localDriftMonitorInFlight = true;
    try {
      const result = await this.playback.reconcile(
        session,
        this.partyTabId ?? undefined,
      );
      if (this.session !== session) return;
      if (result !== "unchanged") {
        this.lastLocalDriftCorrectionAtMs = Date.now();
      }
      await this.handlePlaybackResult(result);
    } finally {
      this.localDriftMonitorInFlight = false;
    }
  }

  private scheduleDeferredExternalNavigation(): void {
    this.cancelDeferredExternalNavigation();
    const session = this.session;
    this.externalNavTimer = setTimeout(() => {
      this.externalNavTimer = null;
      if (this.session !== session) return;
      void this.handleHostExternalNavigation();
    }, EXTERNAL_NAV_DEFER_MS);
  }

  private async waitForCanonicalPlayback(
    session: ActiveSession,
  ): Promise<PartyPlaybackState | null> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline && this.session === session) {
      const playback = session.state?.playback;
      if (playback?.track) return playback;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });
    }
    return this.session === session ? session.state?.playback ?? null : null;
  }

  private async handleHostExternalNavigation(): Promise<void> {
    const session = this.session;
    if (!session?.state || session.localSyncStatus !== "in_sync") return;

    const canonical = session.state.playback;
    if (!canonical.track) return;
    const localTrackId = this.lastHostLocalPlayback?.track?.videoId;
    if (!localTrackId || localTrackId === canonical.track.videoId) return;

    // Guard against the burst of deliberate events YouTube Music fires for a
    // single manual track change (e.g. play + track_changed) enqueuing the
    // requeue more than once during the in-flight round trip.
    if (this.hostRequeueInFlight) return;
    this.hostRequeueInFlight = true;
    try {
      const observedTrack = this.lastHostCanonicalPlayback?.track;
      const requeueTrack =
        observedTrack?.videoId === canonical.track.videoId
          ? {
              ...canonical.track,
              title: observedTrack.title ?? canonical.track.title,
              artist: observedTrack.artist ?? canonical.track.artist,
              thumbnailUrl:
                observedTrack.thumbnailUrl ?? canonical.track.thumbnailUrl,
            }
          : canonical.track;
      await this.enqueueMutation((operationId, expectedRevision) => ({
        type: "playback.host_requeue",
        operationId,
        track: requeueTrack,
        expectedRevision,
      }));
      if (this.session !== session) return;
      await this.setLocalSyncStatus("ready_to_resume");
    } finally {
      if (this.session === session) {
        this.hostRequeueInFlight = false;
      }
    }
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

    // Ignore play/pause/seek that reference a different track than the party's
    // current song. These fire transiently when YouTube Music auto-advances at
    // the end of a track (before the adapter emits `local.ended`) or right
    // after a manual switch (before `local.track_changed`); promoting them to
    // canonical host state would clobber the party with YouTube Music's own
    // next song. Seeding an empty party (canonical track null) is still allowed.
    const canonicalTrack = this.session?.state?.playback.track;
    if (canonicalTrack && event.playback.track.videoId !== canonicalTrack.videoId) {
      return;
    }

    await this.enqueueMutation((operationId, expectedRevision) => ({
      type: "playback.host_state",
      operationId,
      playback: localToPartyPlayback(event.playback, Date.now()),
      expectedRevision,
    }));
  }

  private async advanceAfterTrackEnd(state: PartyRoomState): Promise<void> {
    const session = this.session;
    if (!session) return;
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
      if (this.session === session) {
        this.lastAutoAdvanceKey = null;
        this.pendingAutoAdvance = null;
      }
      throw error;
    }
  }

  private shouldIgnoreHostEventDuringAutoAdvance(): boolean {
    const pending = this.pendingAutoAdvance;
    if (!pending) return false;
    if (Date.now() - pending.startedAtMs > AUTO_ADVANCE_EVENT_SUPPRESSION_MS) {
      this.pendingAutoAdvance = null;
      return false;
    }
    return true;
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
    const session = this.session;
    if (!session) return;

    if (event.playback.interruption === "advertisement") {
      this.guestAdBreakActive = true;
      return;
    }

    if (this.guestAdBreakActive) {
      this.guestAdBreakActive = false;
      if (session.state?.playback.track) {
        const result = await this.playback.apply(
          session,
          this.partyTabId ?? undefined,
        );
        if (this.session !== session) return;
        if (result === "applied") {
          await this.setLocalSyncStatus("in_sync");
        } else {
          await this.handlePlaybackResult(result);
        }
      }
      return;
    }

    if (session.localSyncStatus !== "in_sync") return;

    const decision = this.playback.decideGuestAction(event, session);
    switch (decision) {
      case "track_unavailable":
        await this.setLocalSyncStatus("track_unavailable");
        return;

      case "reconcile": {
        const result = await this.playback.reconcile(
          session,
          this.partyTabId ?? undefined,
        );
        if (this.session !== session) return;
        await this.handlePlaybackResult(result);
        return;
      }

      case "ignore":
        return;
    }
  }

  private async handlePlaybackResult(
    result: PlaybackSyncResult,
  ): Promise<void> {
    const session = this.requireSession();
    if (result === "applied" || result === "unchanged") {
      this.resetPlaybackFailures();
      if (
        session.localSyncStatus === "out_of_sync" ||
        session.localSyncStatus === "track_unavailable"
      ) {
        await this.setLocalSyncStatus("in_sync");
      }
      return;
    }

    if (result === "navigating") {
      this.resetPlaybackFailures();
      await this.setLocalSyncStatus("navigating");
    } else if (result === "out_of_sync") {
      // A correct-track verification miss is recoverable. Keep the participant
      // active so the drift monitor can retry instead of forcing a manual
      // "Join playback" action. This is especially important for the host,
      // whose player is the source of authority.
      this.recordPlaybackFailure();
      if (session.localSyncStatus !== "in_sync") {
        await this.setLocalSyncStatus("in_sync");
      }
    } else if (result === "track_unavailable") {
      const failureCount = this.recordPlaybackFailure();
      if (
        session.localSyncStatus !== "in_sync" ||
        failureCount >= PLAYBACK_FAILURES_BEFORE_MANUAL_RECOVERY
      ) {
        await this.setLocalSyncStatus("track_unavailable");
      }
    }
  }

  private recordPlaybackFailure(): number {
    const key = this.session?.state
      ? playbackKey(this.session.state.playback)
      : null;
    if (this.playbackFailureKey !== key) {
      this.playbackFailureKey = key;
      this.playbackFailureCount = 0;
    }
    this.playbackFailureCount += 1;
    return this.playbackFailureCount;
  }

  private resetPlaybackFailures(): void {
    this.playbackFailureKey = null;
    this.playbackFailureCount = 0;
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

  private adoptPartyTab(tabId?: number): void {
    if (this.session && tabId != null && this.partyTabId === null) {
      this.partyTabId = tabId;
    }
  }

  // Binds the first reporting YouTube Music tab as the party tab and ignores
  // playback events from any other tab so a second open tab cannot hijack the
  // shared session. Events without a tab id (e.g. unit tests) always match.
  private adoptOrMatchesPartyTab(tabId?: number): boolean {
    if (tabId == null) return true;
    this.adoptPartyTab(tabId);
    return this.partyTabId === null || this.partyTabId === tabId;
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
