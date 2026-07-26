import { describe, expect, it } from "vitest";
import type { ParticipantState, SyncStatus } from "@ytm-party/shared";
import {
  presentSyncStatus,
  summarizePartySync,
} from "./room-presentation";

describe("room presentation", () => {
  it.each([
    ["in_sync", "In sync", "success"],
    ["ready_to_join", "Ready to join", "warning"],
    ["out_of_sync", "Out of sync", "danger"],
    ["not_joined", "Not joined", "neutral"],
  ] satisfies Array<[SyncStatus, string, string]>)(
    "presents %s as readable UI copy",
    (status, label, tone) => {
      expect(presentSyncStatus(status)).toEqual({ label, tone });
    },
  );

  it("summarizes a fully synchronized party", () => {
    expect(
      summarizePartySync([
        participant("host", "in_sync"),
        participant("guest", "in_sync"),
      ]),
    ).toEqual({ label: "Everyone in sync", tone: "success" });
  });

  it("prioritizes listeners who need attention", () => {
    expect(
      summarizePartySync([
        participant("host", "in_sync"),
        participant("guest", "out_of_sync"),
      ]),
    ).toEqual({ label: "1 listener needs attention", tone: "danger" });
  });

  it("uses plural listener copy", () => {
    expect(
      summarizePartySync([
        participant("host", "reconnecting"),
        participant("guest", "reconnecting"),
      ]),
    ).toEqual({
      label: "2 listeners are reconnecting",
      tone: "warning",
    });
  });
});

function participant(
  participantId: string,
  syncStatus: SyncStatus,
): ParticipantState {
  return {
    participantId,
    displayName: participantId,
    role: participantId === "host" ? "host" : "guest",
    syncStatus,
    connectedAtMs: 0,
    lastSeenAtMs: 0,
  };
}
