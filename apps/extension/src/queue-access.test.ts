import { describe, expect, it } from "vitest";
import type { PartyRoomState } from "@ytm-party/shared";
import type { SessionView } from "./session-types";
import { resolveQueueAccess } from "./queue-access";

function createView(participantId: string | null): SessionView {
  const state: PartyRoomState = {
    roomId: "room",
    revision: 1,
    hostParticipantId: "host",
    permissions: {
      guestsCanSkip: false,
      guestsCanAddToQueue: false,
    },
    playback: {
      track: null,
      paused: true,
      positionSeconds: 0,
      effectiveAtMs: 0,
    },
    queue: [],
    participants: [],
  };

  return {
    roomId: "room",
    participantId,
    displayName: "Listener",
    localSyncStatus: "ready_to_join",
    state,
  };
}

describe("queue access", () => {
  it("allows the host to add songs", () => {
    expect(resolveQueueAccess(createView("host"))).toEqual({ allowed: true });
  });

  it("explains when guest additions are disabled", () => {
    expect(resolveQueueAccess(createView("guest"))).toEqual({
      allowed: false,
      reason: "The host has disabled guest queue additions.",
    });
  });

  it("allows guests after the host enables additions", () => {
    const view = createView("guest");
    if (view.state) view.state.permissions.guestsCanAddToQueue = true;

    expect(resolveQueueAccess(view)).toEqual({ allowed: true });
  });

  it("requires an active party", () => {
    const view = createView(null);
    view.roomId = null;
    view.state = null;

    expect(resolveQueueAccess(view).allowed).toBe(false);
  });
});
