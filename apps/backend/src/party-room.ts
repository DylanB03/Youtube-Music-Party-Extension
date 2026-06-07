import {
  type ClientMessage,
  type ConnectionTicketResponse,
  type JoinRoomResponse,
  type ParticipantState,
  type PartyPlaybackState,
  type PartyRoomState,
  type ServerMessage,
  defaultPermissions,
  isClientMessage,
} from "@ytm-party/shared";
import {
  addParticipant,
  applyRoomMutation,
  markParticipantDisconnected,
  removeInactiveParticipants,
  transferHost,
  upsertConnectedParticipant,
} from "./domain/room-state";
import { jsonResponse } from "./lib/http";
import { generateId, generateToken } from "./lib/ids";
import type { Env, RoomAuth, SessionMeta } from "./types";

const HOST_RECONNECT_GRACE_MS = 30_000;
const PARTICIPANT_RETENTION_MS = 5 * 60_000;
const CONNECTION_TICKET_TTL_MS = 30_000;

export class PartyRoom {
  private sessions = new Map<WebSocket, SessionMeta>();
  private roomState: PartyRoomState | null = null;
  private roomAuth: RoomAuth | null = null;
  private loaded = false;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

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
    if (url.pathname.endsWith("/connect")) {
      return this.connect(request);
    }

    return jsonResponse({ error: "Not found" }, { status: 404 });
  }

  async alarm(): Promise<void> {
    await this.load();
    if (!this.roomState) return;

    const connectedIds = new Set(
      Array.from(this.sessions.values(), (session) => session.participantId),
    );
    const hostChanged = this.roomState.hostDisconnectedAtMs
      ? transferHost(this.roomState, connectedIds)
      : false;
    const participantsRemoved = removeInactiveParticipants(
      this.roomState,
      connectedIds,
      Date.now(),
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
    };
    this.roomAuth = {
      participantTokens: {
        [body.participantId]: body.participantToken,
      },
      connectionTickets: {},
      operationResults: {},
    };

    await this.persist();
    return jsonResponse({ ok: true });
  }

  private async join(request: Request): Promise<Response> {
    if (!this.roomState || !this.roomAuth) {
      return jsonResponse({ error: "Room has not been initialized" }, { status: 409 });
    }

    const body = await request.json<{
      inviteCode: string;
      displayName: string;
      nowMs: number;
    }>();
    if (body.inviteCode !== this.roomState.inviteCode) {
      return jsonResponse({ error: "Invite code does not match room" }, { status: 403 });
    }

    const participantId = generateId("participant");
    const participantToken = generateToken();
    this.roomAuth.participantTokens[participantId] = participantToken;
    addParticipant(this.roomState, {
      participantId,
      displayName: body.displayName || "Guest",
      role: "guest",
      syncStatus: "ready_to_join",
      connectedAtMs: body.nowMs,
      lastSeenAtMs: body.nowMs,
    });
    await this.persist();

    const response: JoinRoomResponse = {
      roomId: this.roomState.roomId,
      inviteCode: this.roomState.inviteCode ?? body.inviteCode,
      participantId,
      participantToken,
    };
    return jsonResponse(response, { status: 201 });
  }

  private async createConnectionTicket(request: Request): Promise<Response> {
    if (!this.roomAuth) {
      return jsonResponse({ error: "Room has not been initialized" }, { status: 409 });
    }

    const body = await request.json<{
      participantId: string;
      participantToken: string;
      displayName: string;
      nowMs: number;
    }>();
    if (
      this.roomAuth.participantTokens[body.participantId] !== body.participantToken
    ) {
      return jsonResponse({ error: "Invalid participant token" }, { status: 401 });
    }

    const ticket = generateToken();
    const expiresAtMs = body.nowMs + CONNECTION_TICKET_TTL_MS;
    this.roomAuth.connectionTickets[ticket] = {
      participantId: body.participantId,
      displayName: body.displayName,
      expiresAtMs,
    };
    this.removeExpiredTickets(body.nowMs);
    await this.persist();

    const response: ConnectionTicketResponse = { ticket, expiresAtMs };
    return jsonResponse(response, { status: 201 });
  }

  private async connect(request: Request): Promise<Response> {
    if (!this.roomState || !this.roomAuth) {
      return jsonResponse({ error: "Room has not been initialized" }, { status: 409 });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return jsonResponse({ error: "Expected WebSocket upgrade" }, { status: 426 });
    }

    const url = new URL(request.url);
    const ticket = url.searchParams.get("ticket") ?? "";
    const ticketDetails = this.roomAuth.connectionTickets[ticket];
    if (!ticketDetails || ticketDetails.expiresAtMs < Date.now()) {
      return jsonResponse({ error: "Invalid or expired connection ticket" }, { status: 401 });
    }
    delete this.roomAuth.connectionTickets[ticket];
    await this.persist();

    const { participantId, displayName } = ticketDetails;

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    this.sessions.set(server, { participantId, displayName });
    upsertConnectedParticipant(this.roomState, participantId, displayName, Date.now());
    this.send(server, { type: "room.snapshot", state: this.roomState });
    this.broadcastSnapshot();

    server.addEventListener("message", (event) => {
      void this.handleMessage(server, event.data);
    });
    server.addEventListener("close", () => {
      void this.disconnect(server);
    });
    server.addEventListener("error", () => {
      void this.disconnect(server);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async handleMessage(socket: WebSocket, raw: unknown): Promise<void> {
    const session = this.sessions.get(socket);
    if (!session || !this.roomState) return;

    const message = this.parseClientMessage(raw);
    if (!message) {
      this.sendError(socket, "invalid_message", "Message must be valid JSON with a known shape.");
      return;
    }

    if (message.type === "clock.ping") {
      this.send(socket, {
        type: "clock.pong",
        clientSentAtMs: message.clientSentAtMs,
        serverSentAtMs: Date.now(),
      });
      return;
    }
    if (message.type === "room.snapshot.request") {
      this.send(socket, { type: "room.snapshot", state: this.roomState });
      return;
    }
    if (message.type === "participant.status") {
      const result = applyRoomMutation(
        this.roomState,
        message,
        session.participantId,
        Date.now(),
        () => generateId("queue"),
      );
      if (result.changed) await this.commitAndBroadcast();
      return;
    }

    const cachedResult = this.roomAuth?.operationResults[message.operationId];
    if (cachedResult) {
      this.send(socket, cachedResult);
      return;
    }

    const result = applyRoomMutation(
      this.roomState,
      message,
      session.participantId,
      Date.now(),
      () => generateId("queue"),
    );
    if (result.error) {
      const operationResult: Extract<ServerMessage, { type: "operation.result" }> = {
        type: "operation.result",
        operationId: message.operationId,
        accepted: false,
        revision: this.roomState.revision,
        error: {
          code: result.error.code,
          message: result.error.message,
        },
      };
      this.rememberOperationResult(operationResult);
      await this.persist();
      this.send(socket, operationResult);
      if (result.error.includeSnapshot) {
        this.send(socket, { type: "room.snapshot", state: this.roomState });
      }
      return;
    }
    if (result.changed) {
      this.roomState.revision += 1;
      const operationResult: Extract<ServerMessage, { type: "operation.result" }> = {
        type: "operation.result",
        operationId: message.operationId,
        accepted: true,
        revision: this.roomState.revision,
      };
      this.rememberOperationResult(operationResult);
      await this.persist();
      this.broadcastSnapshot();
      this.send(socket, operationResult);
    }
  }

  private parseClientMessage(raw: unknown): ClientMessage | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(raw));
    } catch {
      return null;
    }
    if (!isClientMessage(parsed)) return null;
    return parsed;
  }

  private async disconnect(socket: WebSocket): Promise<void> {
    const session = this.sessions.get(socket);
    this.sessions.delete(socket);
    if (!session || !this.roomState) return;

    const stillConnected = Array.from(this.sessions.values()).some(
      (candidate) => candidate.participantId === session.participantId,
    );
    if (stillConnected) return;

    const hostDisconnected = markParticipantDisconnected(
      this.roomState,
      session.participantId,
      Date.now(),
    );
    await this.commitAndBroadcast();
    await this.scheduleNextPresenceAlarm(
      hostDisconnected ? Date.now() + HOST_RECONNECT_GRACE_MS : undefined,
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

  private rememberOperationResult(
    result: Extract<ServerMessage, { type: "operation.result" }>,
  ): void {
    if (!this.roomAuth) return;
    this.roomAuth.operationResults[result.operationId] = result;
    const operationIds = Object.keys(this.roomAuth.operationResults);
    if (operationIds.length <= 256) return;

    for (const operationId of operationIds.slice(0, operationIds.length - 256)) {
      delete this.roomAuth.operationResults[operationId];
    }
  }

  private removeExpiredTickets(nowMs: number): void {
    if (!this.roomAuth) return;
    for (const [ticket, details] of Object.entries(this.roomAuth.connectionTickets)) {
      if (details.expiresAtMs < nowMs) {
        delete this.roomAuth.connectionTickets[ticket];
      }
    }
  }

  private removeOrphanedParticipantTokens(): void {
    if (!this.roomState || !this.roomAuth) return;
    const activeParticipantIds = new Set(
      this.roomState.participants.map((participant) => participant.participantId),
    );
    for (const participantId of Object.keys(this.roomAuth.participantTokens)) {
      if (!activeParticipantIds.has(participantId)) {
        delete this.roomAuth.participantTokens[participantId];
      }
    }
  }

  private async scheduleNextPresenceAlarm(preferredTime?: number): Promise<void> {
    if (!this.roomState) return;
    const connectedIds = new Set(
      Array.from(this.sessions.values(), (session) => session.participantId),
    );
    const cleanupTimes = this.roomState.participants
      .filter((participant) => participant.participantId !== this.roomState?.hostParticipantId)
      .filter((participant) => !connectedIds.has(participant.participantId))
      .map((participant) => participant.lastSeenAtMs + PARTICIPANT_RETENTION_MS);
    const candidates = preferredTime ? [preferredTime, ...cleanupTimes] : cleanupTimes;
    if (candidates.length === 0) return;
    await this.state.storage.setAlarm(Math.min(...candidates));
  }

  private broadcastSnapshot(): void {
    if (!this.roomState) return;
    const message: ServerMessage = { type: "room.snapshot", state: this.roomState };
    for (const socket of this.sessions.keys()) {
      this.send(socket, message);
    }
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    socket.send(JSON.stringify(message));
  }

  private sendError(socket: WebSocket, code: string, message: string): void {
    this.send(socket, { type: "room.error", code, message });
  }
}
