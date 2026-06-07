import type {
  ConnectionTicketResponse,
  CreateRoomResponse,
  JoinRoomResponse,
  PartyPlaybackState,
} from "@ytm-party/shared";
import { apiUrl } from "./config";

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
    if (!response.ok) throw new Error("Could not create party.");
    return response.json() as Promise<CreateRoomResponse>;
  }

  async joinRoom(inviteCode: string, displayName: string): Promise<JoinRoomResponse> {
    const response = await fetch(apiUrl("/rooms/join"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode, displayName }),
    });
    if (!response.ok) throw new Error("Invite code not found.");
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
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${participantToken}`,
      },
      body: JSON.stringify({ participantId, displayName }),
    });
    if (!response.ok) throw new Error("Could not authorize the party connection.");
    return response.json() as Promise<ConnectionTicketResponse>;
  }
}
