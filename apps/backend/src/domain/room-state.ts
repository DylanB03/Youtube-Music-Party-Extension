import {
  type ClientMessage,
  type ParticipantState,
  type PartyRoomState,
  type QueueItem,
  type Track,
} from "@ytm-party/shared";
import type { RoomLimits } from "./room-limits";

export type RoomMutationError = {
  code: string;
  message: string;
  includeSnapshot?: boolean;
};

export type RoomMutationResult = {
  changed: boolean;
  error?: RoomMutationError;
};

type QueueIdFactory = () => string;

export function applyRoomMutation(
  state: PartyRoomState,
  message: ClientMessage,
  participantId: string,
  nowMs: number,
  createQueueId: QueueIdFactory,
  limits?: Pick<RoomLimits, "maxQueueItems">,
): RoomMutationResult {
  touchParticipant(state, participantId, nowMs);

  if (message.type === "clock.ping" || message.type === "room.snapshot.request") {
    return { changed: false };
  }

  if (message.type === "participant.status") {
    updateParticipant(state, participantId, { syncStatus: message.syncStatus });
    return { changed: true };
  }

  const revisionError = validateRevision(state, message.expectedRevision);
  if (revisionError) {
    return { changed: false, error: revisionError };
  }

  switch (message.type) {
    case "permissions.update": {
      const hostError = validateHost(state, participantId);
      if (hostError) return { changed: false, error: hostError };
      state.permissions = message.permissions;
      return { changed: true };
    }

    case "playback.host_state": {
      const hostError = validateHost(state, participantId);
      if (hostError) return { changed: false, error: hostError };
      state.playback = {
        ...message.playback,
        positionSeconds: Math.max(0, message.playback.positionSeconds),
        effectiveAtMs: nowMs,
      };
      return { changed: true };
    }

    case "playback.host_requeue": {
      const hostError = validateHost(state, participantId);
      if (hostError) return { changed: false, error: hostError };
      if (state.playback.track) {
        const observedTrack =
          message.track?.videoId === state.playback.track.videoId
            ? message.track
            : null;
        const requeuedTrack = observedTrack
          ? {
              ...state.playback.track,
              title: observedTrack.title ?? state.playback.track.title,
              artist: observedTrack.artist ?? state.playback.track.artist,
            }
          : state.playback.track;
        // Restore the currently-playing track to the front of the queue so the
        // host can later "resume" into it. This intentionally bypasses
        // maxQueueItems because it is recovering an already-active track rather
        // than queuing a brand new one.
        state.queue.unshift({
          id: createQueueId(),
          track: requeuedTrack,
          addedByParticipantId: participantId,
          addedAtMs: nowMs,
        });
      }
      state.playback = {
        track: null,
        paused: true,
        positionSeconds: 0,
        effectiveAtMs: nowMs,
      };
      return { changed: true };
    }

    case "playback.skip": {
      if (!canSkip(state, participantId)) {
        return {
          changed: false,
          error: {
            code: "forbidden",
            message: "Guests cannot skip unless the host enables guest skipping.",
          },
        };
      }
      advanceQueue(state, nowMs);
      return { changed: true };
    }

    case "queue.add": {
      if (!canAddToQueue(state, participantId)) {
        return {
          changed: false,
          error: {
            code: "forbidden",
            message: "Guests cannot add songs unless the host enables guest queue additions.",
          },
        };
      }
      if (!state.playback.track) {
        state.playback = {
          track: message.track,
          paused: false,
          positionSeconds: 0,
          effectiveAtMs: nowMs,
        };
        return { changed: true };
      }
      if (limits && state.queue.length >= limits.maxQueueItems) {
        return {
          changed: false,
          error: {
            code: "queue_full",
            message: "The party queue is full.",
          },
        };
      }
      addQueueItem(state, message.track, participantId, nowMs, createQueueId());
      return { changed: true };
    }

    case "queue.remove": {
      const hostError = validateHost(state, participantId);
      if (hostError) return { changed: false, error: hostError };
      state.queue = state.queue.filter((item) => item.id !== message.queueItemId);
      return { changed: true };
    }

    case "queue.reorder": {
      const hostError = validateHost(state, participantId);
      if (hostError) return { changed: false, error: hostError };
      reorderQueue(state, message.queueItemIds);
      return { changed: true };
    }
  }
}

export function upsertConnectedParticipant(
  state: PartyRoomState,
  participantId: string,
  displayName: string,
  nowMs: number,
): void {
  const existing = state.participants.find(
    (participant) => participant.participantId === participantId,
  );
  const isHost = participantId === state.hostParticipantId;

  if (existing) {
    existing.displayName = displayName;
    existing.lastSeenAtMs = nowMs;
    existing.role = isHost ? "host" : "guest";
    if (isHost) delete state.hostDisconnectedAtMs;
    return;
  }

  state.participants.push({
    participantId,
    displayName,
    role: isHost ? "host" : "guest",
    syncStatus: "ready_to_join",
    connectedAtMs: nowMs,
    lastSeenAtMs: nowMs,
  });
}

export function markParticipantDisconnected(
  state: PartyRoomState,
  participantId: string,
  nowMs: number,
): boolean {
  touchParticipant(state, participantId, nowMs);
  if (participantId !== state.hostParticipantId) return false;
  state.hostDisconnectedAtMs = nowMs;
  return true;
}

export function transferHost(
  state: PartyRoomState,
  connectedParticipantIds: Set<string>,
): boolean {
  if (!state.hostDisconnectedAtMs) return false;
  if (connectedParticipantIds.has(state.hostParticipantId)) {
    delete state.hostDisconnectedAtMs;
    return true;
  }

  const replacement = state.participants
    .filter((participant) => connectedParticipantIds.has(participant.participantId))
    .filter((participant) => participant.participantId !== state.hostParticipantId)
    .sort((left, right) => left.connectedAtMs - right.connectedAtMs)[0];

  if (!replacement) return false;

  state.hostParticipantId = replacement.participantId;
  delete state.hostDisconnectedAtMs;
  state.participants = state.participants.map((participant) => ({
    ...participant,
    role: participant.participantId === replacement.participantId ? "host" : "guest",
  }));
  return true;
}

export function addParticipant(
  state: PartyRoomState,
  participant: ParticipantState,
): void {
  state.participants.push(participant);
}

export function removeInactiveParticipants(
  state: PartyRoomState,
  connectedParticipantIds: Set<string>,
  nowMs: number,
  retentionMs: number,
): boolean {
  const previousLength = state.participants.length;
  state.participants = state.participants.filter((participant) => {
    if (participant.participantId === state.hostParticipantId) return true;
    if (connectedParticipantIds.has(participant.participantId)) return true;
    return nowMs - participant.lastSeenAtMs < retentionMs;
  });
  return state.participants.length !== previousLength;
}

function validateRevision(
  state: PartyRoomState,
  expectedRevision: number,
): RoomMutationError | null {
  if (expectedRevision === state.revision) return null;
  return {
    code: "stale_revision",
    message: "Room state changed. Refreshing snapshot.",
    includeSnapshot: true,
  };
}

function validateHost(
  state: PartyRoomState,
  participantId: string,
): RoomMutationError | null {
  if (participantId === state.hostParticipantId) return null;
  return {
    code: "forbidden",
    message: "This action is host-only.",
  };
}

function canAddToQueue(state: PartyRoomState, participantId: string): boolean {
  return (
    participantId === state.hostParticipantId ||
    state.permissions.guestsCanAddToQueue
  );
}

function canSkip(state: PartyRoomState, participantId: string): boolean {
  return participantId === state.hostParticipantId || state.permissions.guestsCanSkip;
}

function touchParticipant(
  state: PartyRoomState,
  participantId: string,
  nowMs: number,
): void {
  const participant = state.participants.find(
    (candidate) => candidate.participantId === participantId,
  );
  if (participant) participant.lastSeenAtMs = nowMs;
}

function updateParticipant(
  state: PartyRoomState,
  participantId: string,
  patch: Partial<ParticipantState>,
): void {
  state.participants = state.participants.map((participant) =>
    participant.participantId === participantId ? { ...participant, ...patch } : participant,
  );
}

function addQueueItem(
  state: PartyRoomState,
  track: Track,
  participantId: string,
  nowMs: number,
  queueItemId: string,
): void {
  const queueItem: QueueItem = {
    id: queueItemId,
    track,
    addedByParticipantId: participantId,
    addedAtMs: nowMs,
  };
  state.queue.push(queueItem);
}

function advanceQueue(state: PartyRoomState, nowMs: number): void {
  const next = state.queue.shift();
  state.playback = {
    track: next?.track ?? null,
    paused: !next,
    positionSeconds: 0,
    effectiveAtMs: nowMs,
  };
}

function reorderQueue(state: PartyRoomState, queueItemIds: string[]): void {
  const byId = new Map(state.queue.map((item) => [item.id, item]));
  const reordered: QueueItem[] = [];

  for (const id of queueItemIds) {
    const item = byId.get(id);
    if (item) reordered.push(item);
  }

  const requestedIds = new Set(queueItemIds);
  const omitted = state.queue.filter((item) => !requestedIds.has(item.id));
  state.queue = [...reordered, ...omitted];
}
