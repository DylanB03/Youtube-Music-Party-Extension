import type { ServerMessage } from "@ytm-party/shared";

export type Env = {
  PARTY_ROOMS: DurableObjectNamespace;
  INVITES: KVNamespace;
};

export type RoomAuth = {
  participantTokens: Record<string, string>;
  connectionTickets: Record<
    string,
    {
      participantId: string;
      displayName: string;
      expiresAtMs: number;
    }
  >;
  operationResults: Record<
    string,
    Extract<ServerMessage, { type: "operation.result" }>
  >;
};

export type SessionMeta = {
  participantId: string;
  displayName: string;
};
