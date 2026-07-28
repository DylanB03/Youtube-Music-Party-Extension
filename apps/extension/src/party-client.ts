import {
  type ClientMessage,
  type PartyRoomState,
  estimateClockOffsetMs,
} from "@ytm-party/shared";
import { wsUrl } from "./config";
import { PendingOperationRegistry } from "./pending-operations";
import { parseServerMessage } from "./server-message";
import type {
  ConnectionState,
  MutationMessage,
  OperationResult,
} from "./session-types";

type Listener = (state: PartyRoomState) => void;
type ErrorListener = (message: string) => void;
type ConnectionStateListener = (state: ConnectionState) => void;
const OPERATION_TIMEOUT_MS = 15_000;
const CLOCK_RESYNC_INTERVAL_MS = 5 * 60_000;
const SOCKET_OPEN_TIMEOUT_MS = 10_000;
const RECONNECT_FAILURE_AFTER_MS = 2 * 60_000;

export class PartyClient {
  private socket: WebSocket | null = null;
  private latestState: PartyRoomState | null = null;
  private listeners = new Set<Listener>();
  private errorListeners = new Set<ErrorListener>();
  private connectionStateListeners = new Set<ConnectionStateListener>();
  private pendingOperations: PendingOperationRegistry;
  private pendingMessages: ClientMessage[] = [];
  private intentionallyClosed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private socketOpenTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectStartedAtMs: number | null = null;
  private opening = false;
  clockOffsetMs = 0;

  constructor(
    private readonly roomId: string,
    private readonly requestConnectionTicket: () => Promise<string>,
  ) {
    this.pendingOperations = new PendingOperationRegistry(
      OPERATION_TIMEOUT_MS,
      () => {
        this.emitError("A party action timed out. Refreshing the room state...");
        this.send({ type: "room.snapshot.request" });
      },
    );
  }

  connect(): void {
    if (this.opening || (this.socket && this.socket.readyState <= WebSocket.OPEN)) return;
    this.intentionallyClosed = false;
    this.emitConnectionState(
      this.reconnectAttempt > 0 ? this.reconnectState() : "connecting",
    );
    this.opening = true;
    void this.openSocket();
  }

  private async openSocket(): Promise<void> {
    let ticket: string;
    try {
      ticket = await this.requestConnectionTicket();
    } catch (error) {
      this.opening = false;
      if (error instanceof Error && error.name === "PartyExpiredError") {
        this.intentionallyClosed = true;
        this.emitError("This party has expired. Create or join another party.");
        this.emitConnectionState("expired");
        return;
      }
      this.emitError("Could not authorize the party connection.");
      this.scheduleReconnect();
      return;
    }

    if (this.intentionallyClosed) {
      this.opening = false;
      return;
    }
    const url = wsUrl(`/rooms/${this.roomId}/connect?ticket=${encodeURIComponent(ticket)}`);
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.opening = false;
      this.emitError("Party connection failed.");
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.clearSocketOpenTimer();
      this.opening = false;
      this.reconnectAttempt = 0;
      this.reconnectStartedAtMs = null;
      this.emitConnectionState("connected");
      this.resendPendingOperations();
      this.flushPendingMessages();
      this.send({ type: "room.snapshot.request" });
      this.syncClockAndScheduleRefresh();
    });
    socket.addEventListener("message", (event) => this.handleMessage(event.data));
    socket.addEventListener("error", () => this.emitError("Party connection failed."));
    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) return;
      this.clearSocketOpenTimer();
      this.opening = false;
      this.socket = null;
      if (event.code === 1001 && event.reason === "Party expired") {
        this.intentionallyClosed = true;
        this.emitError("This party has expired. Create or join another party.");
        this.emitConnectionState("expired");
        return;
      }
      if (!this.intentionallyClosed) {
        this.emitError("Party connection closed. Reconnecting...");
        this.scheduleReconnect();
      }
    });
    this.socketOpenTimer = setTimeout(() => {
      if (this.socket !== socket || socket.readyState !== WebSocket.CONNECTING) return;
      this.socket = null;
      this.opening = false;
      this.emitError("Party connection timed out.");
      socket.close();
      this.scheduleReconnect();
    }, SOCKET_OPEN_TIMEOUT_MS);
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this.opening = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.pingTimer) clearTimeout(this.pingTimer);
    this.pingTimer = null;
    this.clearSocketOpenTimer();
    this.reconnectStartedAtMs = null;
    this.socket?.close();
    this.socket = null;
    this.pendingMessages = [];
    this.pendingOperations.rejectAll(new Error("Party connection was closed."));
    this.emitConnectionState("closed");
  }

  onSnapshot(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.latestState) listener(this.latestState);
    return () => this.listeners.delete(listener);
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onConnectionState(listener: ConnectionStateListener): () => void {
    this.connectionStateListeners.add(listener);
    return () => this.connectionStateListeners.delete(listener);
  }

  send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.pendingMessages.push(message);
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  async sendOperation(message: MutationMessage): Promise<OperationResult> {
    const result = this.pendingOperations.create(message);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
    return result;
  }

  private handleMessage(raw: unknown): void {
    const message = parseServerMessage(raw);
    if (!message) {
      this.emitError("The party sent an invalid message. Reconnecting...");
      this.socket?.close(1002, "Invalid party protocol message");
      return;
    }

    if (message.type === "room.snapshot") {
      this.latestState = message.state;
      for (const listener of this.listeners) listener(message.state);
      return;
    }

    if (message.type === "room.error") {
      this.emitError(message.message);
      return;
    }

    if (message.type === "operation.result") {
      this.pendingOperations.resolve(message);
      return;
    }

    if (message.type === "clock.pong") {
      this.clockOffsetMs = estimateClockOffsetMs(
        message.clientSentAtMs,
        Date.now(),
        message.serverSentAtMs,
      );
    }
  }

  private syncClockAndScheduleRefresh(): void {
    if (this.pingTimer) clearTimeout(this.pingTimer);
    this.send({ type: "clock.ping", clientSentAtMs: Date.now() });
    this.pingTimer = setTimeout(() => {
      this.pingTimer = null;
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.syncClockAndScheduleRefresh();
      }
    }, CLOCK_RESYNC_INTERVAL_MS);
  }

  private scheduleReconnect(): void {
    if (this.intentionallyClosed || this.reconnectTimer) return;
    this.reconnectStartedAtMs ??= Date.now();
    this.reconnectAttempt += 1;
    const exponentialDelay = 500 * 2 ** Math.min(this.reconnectAttempt - 1, 6);
    const jitter = Math.floor(Math.random() * 250);
    const state = this.reconnectState();
    if (state === "failed") {
      this.emitError(
        "Reconnection is taking longer than expected. Automatic retries will continue.",
      );
    }
    this.emitConnectionState(state);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, Math.min(exponentialDelay + jitter, 30_000));
  }

  private reconnectState(): Extract<ConnectionState, "reconnecting" | "failed"> {
    return this.reconnectStartedAtMs !== null &&
      Date.now() - this.reconnectStartedAtMs >= RECONNECT_FAILURE_AFTER_MS
      ? "failed"
      : "reconnecting";
  }

  private clearSocketOpenTimer(): void {
    if (this.socketOpenTimer) clearTimeout(this.socketOpenTimer);
    this.socketOpenTimer = null;
  }

  private resendPendingOperations(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.pendingOperations.resend((message) => {
      this.socket?.send(JSON.stringify(message));
    });
  }

  private flushPendingMessages(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const pending = this.pendingMessages;
    this.pendingMessages = [];
    for (const message of pending) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private emitError(message: string): void {
    for (const listener of this.errorListeners) listener(message);
  }

  private emitConnectionState(state: ConnectionState): void {
    for (const listener of this.connectionStateListeners) listener(state);
  }
}
