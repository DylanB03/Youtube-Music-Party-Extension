export type ParticipantRole = "host" | "guest";

export type SyncStatus =
  | "not_joined"
  | "ready_to_join"
  | "navigating"
  | "reconnecting"
  | "in_sync"
  | "out_of_sync"
  | "track_unavailable";

export type RoomPermissions = {
  guestsCanSkip: boolean;
  guestsCanAddToQueue: boolean;
};

export type Track = {
  videoId: string;
  title?: string;
  artist?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
};

export const trackFieldLimits = {
  videoId: 128,
  title: 200,
  artist: 200,
  thumbnailUrl: 2_048,
} as const;

export type QueueItem = {
  id: string;
  track: Track;
  addedByParticipantId: string;
  addedAtMs: number;
};

export type PartyPlaybackState = {
  track: Track | null;
  paused: boolean;
  positionSeconds: number;
  effectiveAtMs: number;
};

export type ParticipantState = {
  participantId: string;
  displayName: string;
  role: ParticipantRole;
  syncStatus: SyncStatus;
  connectedAtMs: number;
  lastSeenAtMs: number;
};

export type PartyRoomState = {
  roomId: string;
  revision: number;
  hostParticipantId: string;
  permissions: RoomPermissions;
  playback: PartyPlaybackState;
  queue: QueueItem[];
  participants: ParticipantState[];
  inviteCode?: string;
  hostDisconnectedAtMs?: number;
  createdAtMs?: number;
  lastActivityAtMs?: number;
  expiresAtMs?: number;
};

export type LocalPlaybackState = {
  track: Track | null;
  paused: boolean;
  positionSeconds: number;
  durationSeconds?: number;
  buffering: boolean;
  interruption?: "advertisement" | "unavailable";
};

export type LocalPlaybackEvent =
  | {
      type: "local.play";
      playback: LocalPlaybackState;
    }
  | {
      type: "local.pause";
      playback: LocalPlaybackState;
    }
  | {
      type: "local.seek";
      playback: LocalPlaybackState;
    }
  | {
      type: "local.ended";
      playback: LocalPlaybackState;
    }
  | {
      type: "local.buffering";
      playback: LocalPlaybackState;
    }
  | {
      type: "local.track_changed";
      playback: LocalPlaybackState;
    }
  | {
      type: "local.progress";
      playback: LocalPlaybackState;
    }
  | {
      type: "local.interruption";
      playback: LocalPlaybackState;
    };

export type CreateRoomRequest = {
  displayName: string;
  initialPlayback?: PartyPlaybackState;
};

export type CreateRoomResponse = {
  roomId: string;
  inviteCode: string;
  inviteUrl: string;
  participantId: string;
  participantToken: string;
};

export type JoinRoomRequest = {
  inviteCode: string;
  displayName: string;
};

export type JoinRoomResponse = {
  roomId: string;
  inviteCode: string;
  participantId: string;
  participantToken: string;
};

export type ConnectionTicketResponse = {
  ticket: string;
  expiresAtMs: number;
};

export type ResolveCodeResponse = {
  roomId: string;
  inviteCode: string;
};

export type PendingInvite = {
  inviteCode: string;
  receivedAtMs: number;
};

export type ClientMessage =
  | {
      type: "clock.ping";
      clientSentAtMs: number;
    }
  | {
      type: "room.snapshot.request";
    }
  | {
      type: "participant.status";
      syncStatus: SyncStatus;
    }
  | {
      type: "permissions.update";
      operationId: string;
      permissions: RoomPermissions;
      expectedRevision: number;
    }
  | {
      type: "playback.host_state";
      operationId: string;
      playback: PartyPlaybackState;
      expectedRevision: number;
    }
  | {
      type: "playback.skip";
      operationId: string;
      expectedRevision: number;
    }
  | {
      type: "queue.add";
      operationId: string;
      track: Track;
      expectedRevision: number;
    }
  | {
      type: "queue.remove";
      operationId: string;
      queueItemId: string;
      expectedRevision: number;
    }
  | {
      type: "queue.reorder";
      operationId: string;
      queueItemIds: string[];
      expectedRevision: number;
    };

export type ServerMessage =
  | {
      type: "clock.pong";
      clientSentAtMs: number;
      serverSentAtMs: number;
    }
  | {
      type: "room.snapshot";
      state: PartyRoomState;
    }
  | {
      type: "room.error";
      code: string;
      message: string;
    }
  | {
      type: "operation.result";
      operationId: string;
      accepted: boolean;
      revision: number;
      error?: {
        code: string;
        message: string;
      };
    };

export type ExtensionRequest =
  | {
      type: "party.create";
      displayName: string;
    }
  | {
      type: "party.join";
      inviteCode: string;
      displayName: string;
    }
  | {
      type: "party.leave";
    }
  | {
      type: "party.getState";
    }
  | {
      type: "party.prepareInvite";
      inviteCode: string;
    }
  | {
      type: "party.getPendingInvite";
    }
  | {
      type: "party.clearPendingInvite";
    }
  | {
      type: "party.joinPlayback";
    }
  | {
      type: "party.rejoinPlayback";
    }
  | {
      type: "party.updatePermissions";
      permissions: RoomPermissions;
    }
  | {
      type: "party.queueAdd";
      track: Track;
    }
  | {
      type: "party.queueRemove";
      queueItemId: string;
    }
  | {
      type: "party.queueReorder";
      queueItemIds: string[];
    }
  | {
      type: "party.skip";
    }
  | {
      type: "content.getPlayback";
    }
  | {
      type: "content.applyPlayback";
      playback: PartyPlaybackState;
    }
  | {
      type: "content.getContextSong";
    }
  | {
      type: "content.getDiagnostics";
    }
  | {
      type: "content.ready";
    }
  | {
      type: "content.localPlaybackEvent";
      event: LocalPlaybackEvent;
    };

export type ExtensionResponse<T = unknown> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

export function isTrack(value: unknown): value is Track {
  if (!value || typeof value !== "object") return false;
  const track = value as Track;
  return (
    isBoundedString(track.videoId, trackFieldLimits.videoId, true) &&
    isBoundedOptionalString(track.title, trackFieldLimits.title) &&
    isBoundedOptionalString(track.artist, trackFieldLimits.artist) &&
    isBoundedOptionalString(track.thumbnailUrl, trackFieldLimits.thumbnailUrl) &&
    (track.durationSeconds === undefined ||
      (isFiniteNumber(track.durationSeconds) && track.durationSeconds >= 0))
  );
}

export function isRoomPermissions(value: unknown): value is RoomPermissions {
  if (!value || typeof value !== "object") return false;
  const permissions = value as RoomPermissions;
  return (
    typeof permissions.guestsCanSkip === "boolean" &&
    typeof permissions.guestsCanAddToQueue === "boolean"
  );
}

export function isSyncStatus(value: unknown): value is SyncStatus {
  return (
    value === "not_joined" ||
    value === "ready_to_join" ||
    value === "navigating" ||
    value === "reconnecting" ||
    value === "in_sync" ||
    value === "out_of_sync" ||
    value === "track_unavailable"
  );
}

export function isPartyPlaybackState(value: unknown): value is PartyPlaybackState {
  if (!value || typeof value !== "object") return false;
  const playback = value as PartyPlaybackState;
  return (
    (playback.track === null || isTrack(playback.track)) &&
    typeof playback.paused === "boolean" &&
    isFiniteNumber(playback.positionSeconds) &&
    isFiniteNumber(playback.effectiveAtMs)
  );
}

export function isClientMessage(value: unknown): value is ClientMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ClientMessage> & Record<string, unknown>;

  switch (message.type) {
    case "clock.ping":
      return isFiniteNumber(message.clientSentAtMs);

    case "room.snapshot.request":
      return true;

    case "participant.status":
      return isSyncStatus(message.syncStatus);

    case "permissions.update":
      return (
        isOperationId(message.operationId) &&
        isRoomPermissions(message.permissions) &&
        isRevision(message.expectedRevision)
      );

    case "playback.host_state":
      return (
        isOperationId(message.operationId) &&
        isPartyPlaybackState(message.playback) &&
        isRevision(message.expectedRevision)
      );

    case "playback.skip":
      return isOperationId(message.operationId) && isRevision(message.expectedRevision);

    case "queue.add":
      return (
        isOperationId(message.operationId) &&
        isTrack(message.track) &&
        isRevision(message.expectedRevision)
      );

    case "queue.remove":
      return (
        isOperationId(message.operationId) &&
        typeof message.queueItemId === "string" &&
        isRevision(message.expectedRevision)
      );

    case "queue.reorder":
      return (
        isOperationId(message.operationId) &&
        Array.isArray(message.queueItemIds) &&
        message.queueItemIds.every((id) => typeof id === "string") &&
        isRevision(message.expectedRevision)
      );

    default:
      return false;
  }
}

export function isServerMessage(value: unknown): value is ServerMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ServerMessage> & Record<string, unknown>;

  switch (message.type) {
    case "clock.pong":
      return (
        isFiniteNumber(message.clientSentAtMs) &&
        isFiniteNumber(message.serverSentAtMs)
      );

    case "room.snapshot":
      return isPartyRoomState(message.state);

    case "room.error":
      return (
        isBoundedString(message.code, 128, true) &&
        isBoundedString(message.message, 1_000, true)
      );

    case "operation.result":
      return (
        isOperationId(message.operationId) &&
        typeof message.accepted === "boolean" &&
        isRevision(message.revision) &&
        (message.error === undefined || isOperationError(message.error))
      );

    default:
      return false;
  }
}

export function defaultPermissions(): RoomPermissions {
  return {
    guestsCanSkip: false,
    guestsCanAddToQueue: true,
  };
}

export function emptyPlayback(nowMs = Date.now()): PartyPlaybackState {
  return {
    track: null,
    paused: true,
    positionSeconds: 0,
    effectiveAtMs: nowMs,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isOperationId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function isPartyRoomState(value: unknown): value is PartyRoomState {
  if (!value || typeof value !== "object") return false;
  const room = value as PartyRoomState;
  return (
    isBoundedString(room.roomId, 256, true) &&
    isRevision(room.revision) &&
    isBoundedString(room.hostParticipantId, 256, true) &&
    isRoomPermissions(room.permissions) &&
    isPartyPlaybackState(room.playback) &&
    Array.isArray(room.queue) &&
    room.queue.every(isQueueItem) &&
    Array.isArray(room.participants) &&
    room.participants.every(isParticipantState) &&
    isBoundedOptionalString(room.inviteCode, 128) &&
    isOptionalFiniteNumber(room.hostDisconnectedAtMs) &&
    isOptionalFiniteNumber(room.createdAtMs) &&
    isOptionalFiniteNumber(room.lastActivityAtMs) &&
    isOptionalFiniteNumber(room.expiresAtMs)
  );
}

function isQueueItem(value: unknown): value is QueueItem {
  if (!value || typeof value !== "object") return false;
  const item = value as QueueItem;
  return (
    isBoundedString(item.id, 256, true) &&
    isTrack(item.track) &&
    isBoundedString(item.addedByParticipantId, 256, true) &&
    isFiniteNumber(item.addedAtMs)
  );
}

function isParticipantState(value: unknown): value is ParticipantState {
  if (!value || typeof value !== "object") return false;
  const participant = value as ParticipantState;
  return (
    isBoundedString(participant.participantId, 256, true) &&
    isBoundedString(participant.displayName, 200, true) &&
    (participant.role === "host" || participant.role === "guest") &&
    isSyncStatus(participant.syncStatus) &&
    isFiniteNumber(participant.connectedAtMs) &&
    isFiniteNumber(participant.lastSeenAtMs)
  );
}

function isOperationError(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const operationError = value as { code?: unknown; message?: unknown };
  return (
    isBoundedString(operationError.code, 128, true) &&
    isBoundedString(operationError.message, 1_000, true)
  );
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

function isBoundedString(
  value: unknown,
  maxLength: number,
  requireContent: boolean,
): value is string {
  if (typeof value !== "string" || value.length > maxLength) return false;
  return !requireContent || value.length > 0;
}

function isBoundedOptionalString(
  value: unknown,
  maxLength: number,
): value is string | undefined {
  return value === undefined || isBoundedString(value, maxLength, false);
}
