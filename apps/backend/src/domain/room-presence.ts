import type { PartyRoomState } from "@ytm-party/shared";
import {
  nextRoomExpirationAtMs,
  type RoomLifecycle,
} from "./room-lifecycle";

export function nextPresenceAlarmAtMs(
  room: PartyRoomState,
  connectedParticipantIds: Set<string>,
  connectionCount: number,
  participantRetentionMs: number,
  lifecycle: RoomLifecycle,
  hostReconnectGraceMs = 5_000,
): number {
  const cleanupTimes = room.participants
    .filter((participant) => participant.participantId !== room.hostParticipantId)
    .filter(
      (participant) => !connectedParticipantIds.has(participant.participantId),
    )
    .map(
      (participant) => participant.lastSeenAtMs + participantRetentionMs,
    );
  const lifecycleExpiration = nextRoomExpirationAtMs(
    room,
    connectionCount > 0,
    lifecycle,
  );
  const playbackPreparationDeadline = room.playbackPreparation?.deadlineAtMs;
  const hostDeadline = hostTransferAtMs(
    room,
    connectedParticipantIds,
    hostReconnectGraceMs,
  );
  const candidates = [
    lifecycleExpiration,
    ...(hostDeadline === undefined ? [] : [hostDeadline]),
    ...(playbackPreparationDeadline === undefined ? [] : [playbackPreparationDeadline]),
    ...cleanupTimes,
  ];
  return Math.min(...candidates);
}

export function hostTransferAtMs(
  room: PartyRoomState,
  connectedParticipantIds: Set<string>,
  graceMs: number,
): number | undefined {
  if (
    room.hostDisconnectedAtMs === undefined ||
    connectedParticipantIds.has(room.hostParticipantId)
  ) return undefined;
  // With no replacement, scheduling a past deadline would repeatedly wake the
  // object. A later guest connection will schedule this deadline again.
  if (!room.participants.some(
    (participant) => participant.participantId !== room.hostParticipantId &&
      connectedParticipantIds.has(participant.participantId),
  )) return undefined;
  return room.hostDisconnectedAtMs + graceMs;
}
