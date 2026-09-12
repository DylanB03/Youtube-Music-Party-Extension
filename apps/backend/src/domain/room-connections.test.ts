import { describe, expect, it, vi } from "vitest";
import { RoomConnections } from "./room-connections";

describe("room connection presence", () => {
  it("does not count closing sockets as connected participants", () => {
    const socket = (participantId: string, readyState: number) => ({
      readyState,
      deserializeAttachment: () => ({ participantId }),
      send: vi.fn(),
    }) as unknown as WebSocket;
    const host = socket("host", WebSocket.CLOSING);
    const oldGuest = socket("guest", WebSocket.CLOSED);
    const guest = socket("guest", WebSocket.OPEN);
    const state = {
      getWebSockets: (tag?: string) => [host, oldGuest, guest].filter(
        (entry) => !tag || entry.deserializeAttachment().participantId === tag,
      ),
    } as unknown as DurableObjectState;
    const connections = new RoomConnections(state);

    expect(connections.size).toBe(1);
    expect(connections.participantIds()).toEqual(new Set(["guest"]));
    expect(connections.hasOtherParticipantSocket("guest", guest)).toBe(false);
    expect(connections.connectionCountExcluding(guest)).toBe(0);
  });
});
