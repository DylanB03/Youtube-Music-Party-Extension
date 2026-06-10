import type {
  ClientMessage,
  ConnectionTicketResponse,
  CreateRoomResponse,
  JoinRoomResponse,
  PartyPlaybackState,
  ServerMessage,
} from "../../../packages/shared/src/index";

const API_BASE_URL = "http://127.0.0.1:8787";

type ParticipantCredentials = {
  roomId: string;
  participantId: string;
  participantToken: string;
  displayName: string;
};

export class PartyTestClient {
  private messages: ServerMessage[] = [];
  private listeners = new Set<() => void>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      this.messages.push(JSON.parse(String(event.data)) as ServerMessage);
      for (const listener of this.listeners) listener();
    });
  }

  static async connect(credentials: ParticipantCredentials): Promise<PartyTestClient> {
    const ticket = await createTicket(credentials);
    const socketUrl = new URL(
      `/rooms/${credentials.roomId}/connect`,
      API_BASE_URL,
    );
    socketUrl.protocol = "ws:";
    socketUrl.searchParams.set("ticket", ticket.ticket);
    const socket = new WebSocket(socketUrl);

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("WebSocket connection failed.")),
        { once: true },
      );
    });
    return new PartyTestClient(socket);
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  async waitFor<T extends ServerMessage>(
    predicate: (message: ServerMessage) => message is T,
    timeoutMs = 5_000,
  ): Promise<T> {
    const existing = this.messages.find(predicate);
    if (existing) return existing;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.listeners.delete(checkMessages);
        reject(new Error("Timed out waiting for a party message."));
      }, timeoutMs);
      const checkMessages = () => {
        const match = this.messages.find(predicate);
        if (!match) return;
        clearTimeout(timeout);
        this.listeners.delete(checkMessages);
        resolve(match);
      };
      this.listeners.add(checkMessages);
    });
  }

  close(): void {
    this.socket.close();
  }
}

export async function createTestParty(
  displayName: string,
  initialPlayback: PartyPlaybackState,
): Promise<CreateRoomResponse> {
  const response = await fetch(`${API_BASE_URL}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName, initialPlayback }),
  });
  if (!response.ok) {
    throw new Error(`Could not create test party: ${response.status}`);
  }
  return response.json() as Promise<CreateRoomResponse>;
}

export async function joinTestParty(
  inviteCode: string,
  displayName: string,
): Promise<JoinRoomResponse> {
  const response = await fetch(`${API_BASE_URL}/rooms/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviteCode, displayName }),
  });
  if (!response.ok) {
    throw new Error(`Could not join test party: ${response.status}`);
  }
  return response.json() as Promise<JoinRoomResponse>;
}

async function createTicket(
  credentials: ParticipantCredentials,
): Promise<ConnectionTicketResponse> {
  const response = await fetch(
    `${API_BASE_URL}/rooms/${credentials.roomId}/tickets`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credentials.participantToken}`,
      },
      body: JSON.stringify({
        participantId: credentials.participantId,
        displayName: credentials.displayName,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Could not create connection ticket: ${response.status}`);
  }
  return response.json() as Promise<ConnectionTicketResponse>;
}
