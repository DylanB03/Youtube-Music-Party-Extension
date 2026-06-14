import type { ServerMessage } from "@ytm-party/shared";
import type { SessionMeta } from "../types";

export class RoomConnections {
  private sessions = new Map<WebSocket, SessionMeta>();

  get size(): number {
    const connectionCount = this.sessions.size;
    return connectionCount;
  }

  register(socket: WebSocket, session: SessionMeta): void {
    this.sessions.set(socket, session);
  }

  get(socket: WebSocket): SessionMeta | undefined {
    const session = this.sessions.get(socket);
    return session;
  }

  remove(socket: WebSocket): SessionMeta | undefined {
    const session = this.sessions.get(socket);
    this.sessions.delete(socket);
    return session;
  }

  hasParticipant(participantId: string): boolean {
    for (const session of this.sessions.values()) {
      if (session.participantId === participantId) return true;
    }
    return false;
  }

  participantIds(): Set<string> {
    const participantIds = new Set(
      Array.from(this.sessions.values(), (session) => session.participantId),
    );
    return participantIds;
  }

  send(socket: WebSocket, message: ServerMessage): void {
    socket.send(JSON.stringify(message));
  }

  broadcast(message: ServerMessage): void {
    for (const socket of this.sessions.keys()) {
      this.send(socket, message);
    }
  }

  closeAll(code: number, reason: string): void {
    for (const socket of this.sessions.keys()) socket.close(code, reason);
    this.sessions.clear();
  }
}
