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
  preferredTime?: number,
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
  const candidates = preferredTime
    ? [
        preferredTime,
        lifecycleExpiration,
        ...(playbackPreparationDeadline === undefined
          ? []
          : [playbackPreparationDeadline]),
        ...cleanupTimes,
      ]
    : [
        lifecycleExpiration,
        ...(playbackPreparationDeadline === undefined
          ? []
          : [playbackPreparationDeadline]),
        ...cleanupTimes,
      ];
  return Math.min(...candidates);
}
