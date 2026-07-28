import type {
  ClientMessage,
  PartyRoomState,
  ServerMessage,
  SyncStatus,
} from "@ytm-party/shared";

export type PartyConnection = {
  clockOffsetMs: number;
  connect(): void;
  disconnect(): void;
  onSnapshot(listener: (state: PartyRoomState) => void): () => void;
  onError(listener: (message: string) => void): () => void;
  onConnectionState(listener: (state: ConnectionState) => void): () => void;
  send(message: ClientMessage): void;
  sendOperation(message: MutationMessage): Promise<OperationResult>;
};

export type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed"
  | "closed"
  | "expired";

export type MutationMessage = Extract<ClientMessage, { operationId: string }>;
export type OperationResult = Extract<ServerMessage, { type: "operation.result" }>;

export type StoredSession = {
  roomId: string;
  participantId: string;
  participantToken: string;
  displayName: string;
  localSyncStatus: SyncStatus;
};

export type ActiveSession = StoredSession & {
  client: PartyConnection;
  state: PartyRoomState | null;
  resumeSyncStatus: SyncStatus;
  lastError?: string;
};

export type SessionView = {
  roomId: string | null;
  participantId: string | null;
  displayName: string | null;
  localSyncStatus: SyncStatus;
  state: PartyRoomState | null;
  lastError?: string;
};
