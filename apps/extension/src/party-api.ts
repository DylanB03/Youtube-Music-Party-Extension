import type {
  ConnectionTicketResponse,
  CreateRoomResponse,
  JoinRoomResponse,
  PartyPlaybackState,
} from "@ytm-party/shared";
import { apiUrl } from "./config";

const CONNECTION_REQUEST_TIMEOUT_MS = 10_000;
const LEAVE_REQUEST_TIMEOUT_MS = 5_000;

export class PartyApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PartyApiError";
  }
}

export class PartyApi {
  async createRoom(
    displayName: string,
    initialPlayback: PartyPlaybackState,
  ): Promise<CreateRoomResponse> {
    const response = await fetch(apiUrl("/rooms"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, initialPlayback }),
    });
    if (!response.ok) {
      throw new PartyApiError(
        response.status,
        await readApiError(response, "Could not create party."),
      );
    }
    return response.json() as Promise<CreateRoomResponse>;
  }

  async joinRoom(inviteCode: string, displayName: string): Promise<JoinRoomResponse> {
    const response = await fetch(apiUrl("/rooms/join"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode, displayName }),
    });
    if (!response.ok) {
      throw new PartyApiError(
        response.status,
        await readApiError(response, "Could not join party."),
      );
    }
    return response.json() as Promise<JoinRoomResponse>;
  }

  async createConnectionTicket(
    roomId: string,
    participantId: string,
    participantToken: string,
    displayName: string,
  ): Promise<ConnectionTicketResponse> {
    const response = await fetch(apiUrl(`/rooms/${encodeURIComponent(roomId)}/tickets`), {
      method: "POST",
      signal: AbortSignal.timeout(CONNECTION_REQUEST_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${participantToken}`,
      },
      body: JSON.stringify({ participantId, displayName }),
    });
    if (!response.ok) {
      const message = await readApiError(
        response,
        "Could not authorize the party connection.",
      );
      if (
        response.status === 401 ||
        response.status === 404 ||
        response.status === 409 ||
        response.status === 410
      ) {
        throw new PartyExpiredError(message);
      }
      throw new PartyApiError(response.status, message);
    }
    return response.json() as Promise<ConnectionTicketResponse>;
  }

  async leaveRoom(
    roomId: string,
    participantId: string,
    participantToken: string,
  ): Promise<void> {
    const response = await fetch(apiUrl(`/rooms/${encodeURIComponent(roomId)}/leave`), {
      method: "POST",
      signal: AbortSignal.timeout(LEAVE_REQUEST_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${participantToken}`,
      },
      body: JSON.stringify({ participantId }),
    });
    if (!response.ok) {
      throw new PartyApiError(
        response.status,
        await readApiError(response, "Could not leave party."),
      );
    }
  }
}

export class PartyExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartyExpiredError";
  }
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    return fallback;
  }
  return fallback;
}
