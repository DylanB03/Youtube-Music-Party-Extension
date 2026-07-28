import type { ServerMessage } from "@ytm-party/shared";

export type Env = Cloudflare.Env & {
  HOST_RECONNECT_GRACE_MS?: string;
  MAX_PARTICIPANTS?: string;
  MAX_QUEUE_ITEMS?: string;
  MAX_MESSAGE_BYTES?: string;
  MAX_MESSAGES_PER_WINDOW?: string;
  MESSAGE_RATE_WINDOW_MS?: string;
  MAX_DISPLAY_NAME_LENGTH?: string;
  ROOM_MAX_AGE_MS?: string;
  ROOM_IDLE_TTL_MS?: string;
  ROOM_EMPTY_TTL_MS?: string;
  INVITE_TTL_SECONDS?: string;
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
  messageWindowStartedAtMs: number;
  messageCount: number;
};
