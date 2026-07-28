import type {
  ParticipantState,
  SyncStatus,
} from "@ytm-party/shared";

export type StatusTone = "success" | "warning" | "danger" | "neutral";

export type StatusPresentation = {
  label: string;
  tone: StatusTone;
};

export function presentSyncStatus(status: SyncStatus): StatusPresentation {
  switch (status) {
    case "in_sync":
      return { label: "In sync", tone: "success" };
    case "navigating":
      return { label: "Syncing", tone: "warning" };
    case "reconnecting":
      return { label: "Reconnecting", tone: "warning" };
    case "connection_failed":
      return { label: "Connection unavailable", tone: "danger" };
    case "ready_to_join":
      return { label: "Ready to join", tone: "warning" };
    case "ready_to_resume":
      return { label: "Ready to resume", tone: "warning" };
    case "out_of_sync":
      return { label: "Out of sync", tone: "danger" };
    case "track_unavailable":
      return { label: "Track unavailable", tone: "danger" };
    case "not_joined":
      return { label: "Not joined", tone: "neutral" };
  }
}

export function summarizePartySync(
  participants: ParticipantState[],
): StatusPresentation {
  if (participants.length === 0) {
    return { label: "Waiting for listeners", tone: "neutral" };
  }

  if (participants.every((participant) => participant.syncStatus === "in_sync")) {
    return { label: "Everyone in sync", tone: "success" };
  }

  const needingAttention = participants.filter(
    (participant) =>
      participant.syncStatus === "out_of_sync" ||
      participant.syncStatus === "track_unavailable" ||
      participant.syncStatus === "connection_failed",
  ).length;
  if (needingAttention > 0) {
    return {
      label: listenerSummary(needingAttention, "needs", "need", "attention"),
      tone: "danger",
    };
  }

  const reconnecting = participants.filter(
    (participant) => participant.syncStatus === "reconnecting",
  ).length;
  if (reconnecting > 0) {
    return {
      label: listenerSummary(
        reconnecting,
        "is",
        "are",
        "reconnecting",
      ),
      tone: "warning",
    };
  }

  const waiting = participants.filter((participant) =>
    ["not_joined", "ready_to_join", "ready_to_resume"].includes(
      participant.syncStatus,
    ),
  ).length;
  if (waiting > 0) {
    return {
      label: listenerSummary(waiting, "is", "are", "ready to join"),
      tone: "warning",
    };
  }

  const syncing = participants.filter(
    (participant) => participant.syncStatus === "navigating",
  ).length;
  return {
    label: listenerSummary(
      Math.max(syncing, 1),
      "is",
      "are",
      "syncing",
    ),
    tone: "warning",
  };
}

function listenerSummary(
  count: number,
  singularVerb: string,
  pluralVerb: string,
  state: string,
): string {
  return `${count} ${count === 1 ? "listener" : "listeners"} ${
    count === 1 ? singularVerb : pluralVerb
  } ${state}`;
}
