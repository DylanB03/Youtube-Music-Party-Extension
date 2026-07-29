import { afterEach, describe, expect, it, vi } from "vitest";

import type { ConnectionState } from "./session-types";
import { PartyExpiredError } from "./party-api";
import { PartyClient } from "./party-client";

type SocketEvent = "open" | "message" | "error" | "close";
type SocketListener = (event: MessageEvent | CloseEvent | Event) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static readonly instances: FakeWebSocket[] = [];

  readonly sentMessages: string[] = [];
  private readonly listeners = new Map<SocketEvent, SocketListener[]>();
  readyState = FakeWebSocket.CONNECTING;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: SocketEvent, listener: SocketListener): void {
    const typeListeners = this.listeners.get(type) ?? [];
    typeListeners.push(listener);
    this.listeners.set(type, typeListeners);
  }

  send(message: string): void {
    this.sentMessages.push(message);
  }

  close(code = 1000, reason = ""): void {
    this.readyState = FakeWebSocket.CLOSED;
    const event = { code, reason } as CloseEvent;
    for (const listener of this.listeners.get("close") ?? []) listener(event);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    const event = {} as Event;
    for (const listener of this.listeners.get("open") ?? []) listener(event);
  }
}

describe("PartyClient clock synchronization", () => {
  afterEach(() => {
    FakeWebSocket.instances.length = 0;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("takes a clock-sample burst on connection and refreshes once per minute", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);

    const client = new PartyClient("party-id", async () => {
      return "socket-ticket";
    });

    client.connect();
    await Promise.resolve();
    await Promise.resolve();

    const socket = FakeWebSocket.instances[0];
    if (!socket) {
      throw new Error("PartyClient did not open a WebSocket.");
    }
    socket.open();

    expect(
      socket.sentMessages.map((message) => JSON.parse(message).type as string),
    ).toEqual([
      "room.snapshot.request",
      "clock.ping",
      "clock.ping",
      "clock.ping",
      "clock.ping",
      "clock.ping",
    ]);

    await vi.advanceTimersByTimeAsync(59_999);
    expect(
      socket.sentMessages.filter((message) => JSON.parse(message).type === "clock.ping"),
    ).toHaveLength(5);

    await vi.advanceTimersByTimeAsync(1);
    expect(
      socket.sentMessages.filter((message) => JSON.parse(message).type === "clock.ping"),
    ).toHaveLength(10);

    client.disconnect();
  });

  it("marks invalid participant credentials as an expired session", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const states: ConnectionState[] = [];
    const client = new PartyClient("party-id", async () => {
      throw new PartyExpiredError("Participant is no longer active");
    });
    client.onConnectionState((state) => states.push(state));

    client.connect();
    await Promise.resolve();
    await Promise.resolve();

    expect(states).toEqual(["connecting", "expired"]);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("stops presenting an endless reconnect after two minutes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.spyOn(Math, "random").mockReturnValue(0);
    const states: ConnectionState[] = [];
    const client = new PartyClient("party-id", async () => {
      throw new Error("Network unavailable");
    });
    client.onConnectionState((state) => states.push(state));

    client.connect();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(122_000);

    expect(states).toContain("failed");
    client.disconnect();
  });

  it("times out a WebSocket that never opens and retries", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const states: ConnectionState[] = [];
    const client = new PartyClient("party-id", async () => "socket-ticket");
    client.onConnectionState((state) => states.push(state));

    client.connect();
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(states).toContain("reconnecting");
    client.disconnect();
  });
});
