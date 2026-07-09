import {
  type JoinRoomResponse,
  type ParticipantState,
  type PartyPlaybackState,
  type PartyRoomState,
  type ServerMessage,
  defaultPermissions,
} from "@ytm-party/shared";
import {
  addParticipant,
  markParticipantDisconnected,
  removeParticipant,
  removeInactiveParticipants,
  transferHost,
  upsertConnectedParticipant,
} from "./domain/room-state";
import {
  normalizeDisplayName,
  readRoomLimits,
} from "./domain/room-limits";
import {
  roomShouldExpire,
  type RoomLifecycle,
} from "./domain/room-lifecycle";
import {
  consumeConnectionTicket,
  createRoomAuth,
  issueConnectionTicket,
  removeParticipantAuth,
  removeOrphanedParticipantTokens,
} from "./domain/room-auth";
import { RoomConnections } from "./domain/room-connections";
import { processRoomMessage } from "./domain/room-message-processor";
import { nextPresenceAlarmAtMs } from "./domain/room-presence";
import { jsonResponse } from "./lib/http";
import { generateId, generateToken } from "./lib/ids";
import { readPositiveInteger } from "./lib/config";
import type { Env, RoomAuth } from "./types";

const DEFAULT_HOST_RECONNECT_GRACE_MS = 5_000;
const PARTICIPANT_RETENTION_MS = 5 * 60_000;
const CONNECTION_TICKET_TTL_MS = 30_000;
const DEFAULT_ROOM_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_ROOM_IDLE_TTL_MS = 60 * 60 * 1_000;

export class PartyRoom {
  private readonly connections: RoomConnections;
  private roomState: PartyRoomState | null = null;
  private roomAuth: RoomAuth | null = null;
  private loaded = false;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    this.connections = new RoomConnections(state);
  }

  async fetch(request: Request): Promise<Response> {
    await this.load();
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/initialize") {
      return this.initialize(request);
    }
    if (request.method === "POST" && url.pathname === "/join") {
      return this.join(request);
    }
    if (request.method === "POST" && url.pathname === "/ticket") {
      return this.createConnectionTicket(request);
    }
    if (request.method === "POST" && url.pathname === "/leave") {
      return this.leave(request);
    }
    if (url.pathname.endsWith("/connect")) {
      return this.connect(request);
    }

    return jsonResponse({ error: "Not found" }, { status: 404 });
  }

  async alarm(): Promise<void> {
    await this.load();
    if (!this.roomState) return;
    const nowMs = Date.now();
    if (
      roomShouldExpire(
        this.roomState,
        this.connections.size > 0,
        nowMs,
        this.getLifecycle(),
      )
    ) {
      await this.expireRoom();
      return;
    }

    const connectedIds = this.connections.participantIds();
    const hostChanged = this.roomState.hostDisconnectedAtMs
      ? transferHost(this.roomState, connectedIds)
      : false;
    const participantsRemoved = removeInactiveParticipants(
      this.roomState,
      connectedIds,
      nowMs,
      PARTICIPANT_RETENTION_MS,
    );
    if (participantsRemoved) this.removeOrphanedParticipantTokens();
    if (hostChanged || participantsRemoved) {
      await this.commitAndBroadcast();
    }
    await this.scheduleNextPresenceAlarm();
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.roomState = (await this.state.storage.get<PartyRoomState>("roomState")) ?? null;
    this.roomAuth = (await this.state.storage.get<RoomAuth>("roomAuth")) ?? null;
    if (this.roomAuth && !this.roomAuth.operationResults) {
      this.roomAuth.operationResults = {};
    }
    if (this.roomAuth && !this.roomAuth.connectionTickets) {
      this.roomAuth.connectionTickets = {};
    }
    this.loaded = true;
  }

  private async initialize(request: Request): Promise<Response> {
    if (this.roomState) {
      return jsonResponse({ ok: true, alreadyInitialized: true });
    }

    const body = await request.json<{
      roomId: string;
      inviteCode: string;
      participantId: string;
      participantToken: string;
      displayName: string;
      initialPlayback: PartyPlaybackState;
      nowMs: number;
    }>();

    const host: ParticipantState = {
      participantId: body.participantId,
      displayName: body.displayName,
      role: "host",
      syncStatus: "in_sync",
      connectedAtMs: body.nowMs,
      lastSeenAtMs: body.nowMs,
    };

    this.roomState = {
      roomId: body.roomId,
      revision: 1,
      hostParticipantId: body.participantId,
      inviteCode: body.inviteCode,
      permissions: defaultPermissions(),
      playback: {
        ...body.initialPlayback,
        effectiveAtMs: body.nowMs,
      },
      queue: [],
      participants: [host],
      createdAtMs: body.nowMs,
      lastActivityAtMs: body.nowMs,
      expiresAtMs: body.nowMs + this.getLifecycle().maxAgeMs,
    };
    this.roomAuth = createRoomAuth(body.participantId, body.participantToken);

    await this.persist();
    await this.scheduleNextPresenceAlarm();
    return jsonResponse({ ok: true });
  }

  private async join(request: Request): Promise<Response> {
    if (!this.roomState || !this.roomAuth) {
      return jsonResponse({ error: "Party has expired" }, { status: 410 });
    }

    const body = await request.json<{
      inviteCode: string;
      displayName: string;
      nowMs: number;
    }>();
    const limits = readRoomLimits(this.env);
    if (this.roomState.participants.length >= limits.maxParticipants) {
      return jsonResponse({ error: "Party is full" }, { status: 409 });
    }
    if (body.inviteCode !== this.roomState.inviteCode) {
      return jsonResponse({ error: "Invite code does not match room" }, { status: 403 });
    }
    const displayName = normalizeDisplayName(
      body.displayName,
      "Guest",
      limits.maxDisplayNameLength,
    );
    if (!displayName) {
      return jsonResponse({ error: "Display name is invalid" }, { status: 400 });
    }

    const participantId = generateId("participant");
    const participantToken = generateToken();
    this.roomAuth.participantTokens[participantId] = participantToken;
    addParticipant(this.roomState, {
      participantId,
      displayName,
      role: "guest",
      syncStatus: "ready_to_join",
      connectedAtMs: body.nowMs,
      lastSeenAtMs: body.nowMs,
    });
    this.roomState.lastActivityAtMs = body.nowMs;
    await this.persist();
    await this.scheduleNextPresenceAlarm();

    const response: JoinRoomResponse = {
      roomId: this.roomState.roomId,
      inviteCode: this.roomState.inviteCode ?? body.inviteCode,
      participantId,
      participantToken,
    };
    return jsonResponse(response, { status: 201 });
  }

  private async createConnectionTicket(request: Request): Promise<Response> {
    if (!this.roomState || !this.roomAuth) {
      return jsonResponse({ error: "Party has expired" }, { status: 410 });
    }

    const body = await request.json<{
      participantId: string;
      participantToken: string;
      nowMs: number;
    }>();
    const storedToken = this.roomAuth.participantTokens[body.participantId];
    if (storedToken !== body.participantToken) {
      return jsonResponse({ error: "Invalid participant token" }, { status: 401 });
    }
    const participant = this.roomState.participants.find(
      (candidate) => candidate.participantId === body.participantId,
    );
    if (!participant) {
      return jsonResponse({ error: "Participant is no longer active" }, { status: 401 });
    }

    const response = issueConnectionTicket(
      this.roomAuth,
      participant,
      body.nowMs,
      CONNECTION_TICKET_TTL_MS,
    );
    await this.persist();

    return jsonResponse(response, { status: 201 });
  }

  private async leave(request: Request): Promise<Response> {
    if (!this.roomState || !this.roomAuth) {
      return jsonResponse({ ok: true, alreadyExpired: true });
    }

    const body = await request.json<{
      participantId: string;
      participantToken: string;
      nowMs: number;
    }>();
    const storedToken = this.roomAuth.participantTokens[body.participantId];
    if (!storedToken || storedToken !== body.participantToken) {
      return jsonResponse({ error: "Invalid participant token" }, { status: 401 });
    }

    const connectedParticipantIds = this.connections.participantIds();
    connectedParticipantIds.delete(body.participantId);
    const removed = removeParticipant(
      this.roomState,
      body.participantId,
      connectedParticipantIds,
    );
    removeParticipantAuth(this.roomAuth, body.participantId);
    this.connections.closeParticipant(body.participantId, 1000, "Participant left");

    if (!removed) {
      await this.persist();
      return jsonResponse({ ok: true, alreadyLeft: true });
    }

    if (this.roomState.participants.length === 0) {
      await this.expireRoom();
      return jsonResponse({ ok: true });
    }

    this.roomState.lastActivityAtMs = body.nowMs;
    await this.commitAndBroadcast();
    await this.scheduleNextPresenceAlarm();
    return jsonResponse({ ok: true });
  }

  private async connect(request: Request): Promise<Response> {
    if (!this.roomState || !this.roomAuth) {
      return jsonResponse({ error: "Party has expired" }, { status: 410 });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return jsonResponse({ error: "Expected WebSocket upgrade" }, { status: 426 });
    }

    const url = new URL(request.url);
    const ticket = url.searchParams.get("ticket") ?? "";
    const ticketDetails = consumeConnectionTicket(
      this.roomAuth,
      ticket,
      Date.now(),
    );
    if (!ticketDetails) {
      return jsonResponse({ error: "Invalid or expired connection ticket" }, { status: 401 });
    }
    await this.persist();

    const { participantId, displayName } = ticketDetails;

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.connections.accept(server, {
      participantId,
      displayName,
      messageWindowStartedAtMs: Date.now(),
      messageCount: 0,
    });
    this.roomState.lastActivityAtMs = Date.now();
    upsertConnectedParticipant(this.roomState, participantId, displayName, Date.now());
    await this.persist();
    await this.scheduleNextPresenceAlarm();
    this.connections.send(server, {
      type: "room.snapshot",
      state: this.roomState,
    });
    this.broadcastSnapshot();

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.load();
    await this.handleMessage(socket, message);
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    await this.load();
    await this.disconnect(socket);
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.load();
    await this.disconnect(socket);
  }

  private async handleMessage(
    socket: WebSocket,
    raw: string | ArrayBuffer,
  ): Promise<void> {
    const session = this.connections.meta(socket);
    const room = this.roomState;
    const auth = this.roomAuth;
    if (!session || !room || !auth) return;
    await processRoomMessage({
      socket,
      raw,
      session,
      room,
      auth,
      limits: readRoomLimits(this.env),
      send: (message) => this.send(socket, message),
      persist: () => this.persist(),
      broadcast: () => this.broadcastSnapshot(),
      connectedParticipantIds: () => this.connections.participantIds(),
      closeParticipant: (participantId, code, reason) =>
        this.connections.closeParticipant(participantId, code, reason),
      now: Date.now,
    });
    // Persist mutated per-connection rate-limit counters so they survive
    // Durable Object hibernation between messages.
    this.connections.rememberMeta(socket, session);
  }

  private async disconnect(socket: WebSocket): Promise<void> {
    const session = this.connections.meta(socket);
    if (!session || !this.roomState) return;
    if (
      !this.roomState.participants.some(
        (participant) => participant.participantId === session.participantId,
      )
    ) {
      return;
    }

    if (this.connections.hasOtherParticipantSocket(session.participantId, socket)) {
      return;
    }

    const hostDisconnected = markParticipantDisconnected(
      this.roomState,
      session.participantId,
      Date.now(),
    );
    if (this.connections.connectionCountExcluding(socket) === 0) {
      this.roomState.lastActivityAtMs = Date.now();
    }
    await this.commitAndBroadcast();
    await this.scheduleNextPresenceAlarm(
      hostDisconnected
        ? Date.now() +
            readPositiveInteger(
              this.env.HOST_RECONNECT_GRACE_MS,
              DEFAULT_HOST_RECONNECT_GRACE_MS,
            )
        : undefined,
    );
  }

  private async commitAndBroadcast(): Promise<void> {
    if (!this.roomState) return;
    this.roomState.revision += 1;
    await this.persist();
    this.broadcastSnapshot();
  }

  private async persist(): Promise<void> {
    const entries: Record<string, PartyRoomState | RoomAuth> = {};
    if (this.roomState) entries.roomState = this.roomState;
    if (this.roomAuth) entries.roomAuth = this.roomAuth;
    await this.state.storage.put(entries);
  }

  private removeOrphanedParticipantTokens(): void {
    if (!this.roomState || !this.roomAuth) return;
    const activeParticipantIds = new Set(
      this.roomState.participants.map((participant) => participant.participantId),
    );
    removeOrphanedParticipantTokens(this.roomAuth, activeParticipantIds);
  }

  private async scheduleNextPresenceAlarm(preferredTime?: number): Promise<void> {
    if (!this.roomState) return;
    const alarmAtMs = nextPresenceAlarmAtMs(
      this.roomState,
      this.connections.participantIds(),
      this.connections.size,
      PARTICIPANT_RETENTION_MS,
      this.getLifecycle(),
      preferredTime,
    );
    await this.state.storage.setAlarm(alarmAtMs);
  }

  private getLifecycle(): RoomLifecycle {
    return {
      maxAgeMs: readPositiveInteger(
        this.env.ROOM_MAX_AGE_MS,
        DEFAULT_ROOM_MAX_AGE_MS,
      ),
      idleTtlMs: readPositiveInteger(
        this.env.ROOM_IDLE_TTL_MS,
        DEFAULT_ROOM_IDLE_TTL_MS,
      ),
    };
  }

  private async expireRoom(): Promise<void> {
    const inviteCode = this.roomState?.inviteCode;
    this.connections.closeAll(1001, "Party expired");
    const cleanupTasks: Promise<unknown>[] = [this.state.storage.deleteAll()];
    if (inviteCode) cleanupTasks.push(this.env.INVITES.delete(inviteCode));
    await Promise.all(cleanupTasks);
    this.roomState = null;
    this.roomAuth = null;
  }

  private broadcastSnapshot(): void {
    if (!this.roomState) return;
    const message: ServerMessage = { type: "room.snapshot", state: this.roomState };
    this.connections.broadcast(message);
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    this.connections.send(socket, message);
  }

}
