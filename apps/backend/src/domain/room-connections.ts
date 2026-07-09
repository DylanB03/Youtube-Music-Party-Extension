import type { ServerMessage } from "@ytm-party/shared";
import type { SessionMeta } from "../types";

/**
 * Wraps the Durable Object's hibernatable WebSocket set. Connection metadata is
 * stored on each socket via `serializeAttachment`, so it survives Durable Object
 * hibernation and eviction without an in-memory registry. The room therefore
 * stops billing duration while idle and rehydrates session state on wake.
 */
export class RoomConnections {
  constructor(private readonly state: DurableObjectState) {}

  get size(): number {
    return this.state.getWebSockets().length;
  }

  accept(socket: WebSocket, session: SessionMeta): void {
    this.state.acceptWebSocket(socket, [session.participantId]);
    socket.serializeAttachment(session);
  }

  meta(socket: WebSocket): SessionMeta | null {
    return (socket.deserializeAttachment() as SessionMeta | null) ?? null;
  }

  rememberMeta(socket: WebSocket, session: SessionMeta): void {
    try {
      socket.serializeAttachment(session);
    } catch {
      // The socket is closing; persisted counters no longer matter.
    }
  }

  hasOtherParticipantSocket(participantId: string, excluding: WebSocket): boolean {
    return this.state
      .getWebSockets(participantId)
      .some((socket) => socket !== excluding);
  }

  connectionCountExcluding(socket: WebSocket): number {
    return this.state.getWebSockets().filter((candidate) => candidate !== socket)
      .length;
  }

  participantIds(): Set<string> {
    const participantIds = new Set<string>();
    for (const socket of this.state.getWebSockets()) {
      const meta = this.meta(socket);
      if (meta) participantIds.add(meta.participantId);
    }
    return participantIds;
  }

  send(socket: WebSocket, message: ServerMessage): void {
    this.deliver(socket, JSON.stringify(message));
  }

  broadcast(message: ServerMessage): void {
    const serialized = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      this.deliver(socket, serialized);
    }
  }

  closeAll(code: number, reason: string): void {
    for (const socket of this.state.getWebSockets()) {
      try {
        socket.close(code, reason);
      } catch {
        // Already closing.
      }
    }
  }

  closeParticipant(participantId: string, code: number, reason: string): void {
    for (const socket of this.state.getWebSockets(participantId)) {
      try {
        socket.close(code, reason);
      } catch {
        // Already closing.
      }
    }
  }

  private deliver(socket: WebSocket, serialized: string): void {
    try {
      socket.send(serialized);
    } catch {
      // The socket is mid-close; the runtime will surface a close event.
    }
  }
}
