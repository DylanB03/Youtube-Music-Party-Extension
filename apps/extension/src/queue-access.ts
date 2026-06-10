import type { SessionView } from "./session-types";

export type QueueAccess = {
  allowed: boolean;
  reason?: string;
};

export function resolveQueueAccess(view: SessionView): QueueAccess {
  if (!view.roomId) {
    return {
      allowed: false,
      reason: "Join or create a party before adding songs.",
    };
  }

  if (!view.state || !view.participantId) {
    return {
      allowed: false,
      reason: "The party is still loading. Try again in a moment.",
    };
  }

  if (view.state.hostParticipantId === view.participantId) {
    return { allowed: true };
  }

  if (view.state.permissions.guestsCanAddToQueue) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "The host has disabled guest queue additions.",
  };
}
