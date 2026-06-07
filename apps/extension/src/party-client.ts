import {
  type ClientMessage,
  type PartyRoomState,
  type ServerMessage,
  estimateClockOffsetMs,
} from "@ytm-party/shared";
import { wsUrl } from "./config";
import type {
  ConnectionState,
  MutationMessage,
  OperationResult,
} from "./session-types";

type Listener = (state: PartyRoomState) => void;
type ErrorListener = (message: string) => void;
type ConnectionStateListener = (state: ConnectionState) => void;

export class PartyClient {
  private socket: WebSocket | null = null;
  private latestState: PartyRoomState | null = null;
  private listeners = new Set<Listener>();
  private errorListeners = new Set<ErrorListener>();
  private connectionStateListeners = new Set<ConnectionStateListener>();
  private pendingOperations = new Map<
    string,
    {
      message: MutationMessage;
      resolve: (result: OperationResult) => void;
      reject: (error: Error) => void;
    }
  >();
  private pendingMessages: ClientMessage[] = [];
  private intentionallyClosed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private opening = false;
  clockOffsetMs = 0;

  constructor(
    private readonly roomId: string,
    private readonly requestConnectionTicket: () => Promise<string>,
  ) {}

  connect(): void {
    if (this.opening || (this.socket && this.socket.readyState <= WebSocket.OPEN)) return;
    this.intentionallyClosed = false;
    this.emitConnectionState(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");
    this.opening = true;
    void this.openSocket();
  }

  private async openSocket(): Promise<void> {
    let ticket: string;
    try {
      ticket = await this.requestConnectionTicket();
    } catch {
      this.opening = false;
      this.emitError("Could not authorize the party connection.");
      this.scheduleReconnect();
      return;
    }

    if (this.intentionallyClosed) {
      this.opening = false;
      return;
    }
    const url = wsUrl(
      `/rooms/${this.roomId}/connect?ticket=${encodeURIComponent(ticket)}`,
    );
    this.socket = new WebSocket(url);
    this.socket.addEventListener("open", () => {
      this.opening = false;
      this.reconnectAttempt = 0;
      this.emitConnectionState("connected");
      this.resendPendingOperations();
      this.flushPendingMessages();
      this.send({ type: "room.snapshot.request" });
      this.pingClock();
    });
    this.socket.addEventListener("message", (event) => this.handleMessage(event.data));
    this.socket.addEventListener("error", () => this.emitError("Party connection failed."));
    this.socket.addEventListener("close", () => {
      this.opening = false;
      this.socket = null;
      if (!this.intentionallyClosed) {
        this.emitError("Party connection closed. Reconnecting...");
        this.scheduleReconnect();
      }
    });
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this.opening = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.pendingMessages = [];
    for (const pending of this.pendingOperations.values()) {
      pending.reject(new Error("Party connection was closed."));
    }
    this.pendingOperations.clear();
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
    const result = new Promise<OperationResult>((resolve, reject) => {
      this.pendingOperations.set(message.operationId, { message, resolve, reject });
    });
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
    return result;
  }

  private handleMessage(raw: unknown): void {
    const message = JSON.parse(String(raw)) as ServerMessage;

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
      const pending = this.pendingOperations.get(message.operationId);
      if (!pending) return;
      this.pendingOperations.delete(message.operationId);
      pending.resolve(message);
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

  private pingClock(): void {
    this.send({ type: "clock.ping", clientSentAtMs: Date.now() });
    setTimeout(() => {
      if (this.socket?.readyState === WebSocket.OPEN) this.pingClock();
    }, 15_000);
  }

  private scheduleReconnect(): void {
    if (this.intentionallyClosed || this.reconnectTimer) return;
    this.reconnectAttempt += 1;
    const exponentialDelay = 500 * 2 ** Math.min(this.reconnectAttempt - 1, 6);
    const jitter = Math.floor(Math.random() * 250);
    this.emitConnectionState("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, Math.min(exponentialDelay + jitter, 30_000));
  }

  private resendPendingOperations(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    for (const pending of this.pendingOperations.values()) {
      this.socket.send(JSON.stringify(pending.message));
    }
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
