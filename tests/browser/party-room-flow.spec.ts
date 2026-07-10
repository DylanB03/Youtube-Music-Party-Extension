import { expect, test } from "@playwright/test";
import type { ServerMessage } from "../../packages/shared/src/index";
import {
  API_BASE_URL,
  PartyTestClient,
  createTestParty,
  joinTestParty,
} from "./support/party-test-client";

const isSnapshot = (
  message: ServerMessage,
): message is Extract<ServerMessage, { type: "room.snapshot" }> => {
  return message.type === "room.snapshot";
};

test("two clients share queue, permissions, playback, reconnect, and host transfer", async () => {
  const nowMs = Date.now();
  const created = await createTestParty("Host", {
    track: { videoId: "initial-track", title: "Initial" },
    paused: true,
    positionSeconds: 0,
    effectiveAtMs: nowMs,
  });
  const joined = await joinTestParty(created.inviteCode, "Guest");
  const fullPartyResponse = await fetch(`${API_BASE_URL}/rooms/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inviteCode: created.inviteCode,
      displayName: "Third Listener",
    }),
  });
  expect(fullPartyResponse.status).toBe(409);
  const hostCredentials = {
    roomId: created.roomId,
    participantId: created.participantId,
    participantToken: created.participantToken,
    displayName: "Host",
  };
  const guestCredentials = {
    roomId: joined.roomId,
    participantId: joined.participantId,
    participantToken: joined.participantToken,
    displayName: "Guest",
  };
  const host = await PartyTestClient.connect(hostCredentials);
  let guest = await PartyTestClient.connect(guestCredentials);

  try {
    const initial = await guest.waitFor(isSnapshot);
    guest.send({
      type: "queue.add",
      operationId: "guest-add",
      track: { videoId: "guest-track", title: "Guest Track" },
      expectedRevision: initial.state.revision,
    });
    const guestAdd = await guest.waitFor(
      (
        message,
      ): message is Extract<ServerMessage, { type: "operation.result" }> =>
        message.type === "operation.result" &&
        message.operationId === "guest-add",
    );
    expect(guestAdd.accepted).toBe(true);

    const queued = await host.waitFor(
      (message): message is Extract<ServerMessage, { type: "room.snapshot" }> =>
        message.type === "room.snapshot" &&
        message.state.queue.some(
          (item) => item.track.videoId === "guest-track",
        ),
    );
    host.send({
      type: "permissions.update",
      operationId: "disable-guest-add",
      permissions: {
        guestsCanSkip: true,
        guestsCanAddToQueue: false,
        guestsCanRemoveFromQueue: false,
      },
      expectedRevision: queued.state.revision,
    });
    const permissionsResult = await host.waitFor(
      (
        message,
      ): message is Extract<ServerMessage, { type: "operation.result" }> =>
        message.type === "operation.result" &&
        message.operationId === "disable-guest-add",
    );
    expect(permissionsResult.accepted).toBe(true);

    guest.send({
      type: "queue.add",
      operationId: "forbidden-guest-add",
      track: { videoId: "blocked-track" },
      expectedRevision: permissionsResult.revision,
    });
    const forbidden = await guest.waitFor(
      (
        message,
      ): message is Extract<ServerMessage, { type: "operation.result" }> =>
        message.type === "operation.result" &&
        message.operationId === "forbidden-guest-add",
    );
    expect(forbidden.accepted).toBe(false);
    expect(forbidden.error?.code).toBe("forbidden");

    host.send({
      type: "playback.host_state",
      operationId: "host-playback",
      playback: {
        track: { videoId: "playing-track", title: "Playing" },
        paused: false,
        positionSeconds: 12,
        effectiveAtMs: 0,
      },
      expectedRevision: permissionsResult.revision,
    });
    const playbackResult = await host.waitFor(
      (
        message,
      ): message is Extract<ServerMessage, { type: "operation.result" }> =>
        message.type === "operation.result" &&
        message.operationId === "host-playback",
    );
    expect(playbackResult.accepted).toBe(true);

    host.send({
      type: "queue.reorder",
      operationId: "stale-reorder",
      queueItemIds: [],
      expectedRevision: permissionsResult.revision,
    });
    const stale = await host.waitFor(
      (
        message,
      ): message is Extract<ServerMessage, { type: "operation.result" }> =>
        message.type === "operation.result" &&
        message.operationId === "stale-reorder",
    );
    expect(stale.accepted).toBe(false);
    expect(stale.error?.code).toBe("stale_revision");

    guest.close();
    guest = await PartyTestClient.connect(guestCredentials);
    const recovered = await guest.waitFor(
      (message): message is Extract<ServerMessage, { type: "room.snapshot" }> =>
        message.type === "room.snapshot" &&
        message.state.playback.track?.videoId === "playing-track",
    );
    expect(recovered.state.queue[0]?.track.videoId).toBe("guest-track");

    host.close();
    const transferred = await guest.waitFor(
      (message): message is Extract<ServerMessage, { type: "room.snapshot" }> =>
        message.type === "room.snapshot" &&
        message.state.hostParticipantId === joined.participantId,
    );
    expect(transferred.state.participants.find(
      (participant) => participant.participantId === joined.participantId,
    )?.role).toBe("host");
  } finally {
    host.close();
    guest.close();
  }
});

test("abandoned rooms remove their invite mapping after idle expiration", async () => {
  const created = await createTestParty("Short-lived Host", {
    track: null,
    paused: true,
    positionSeconds: 0,
    effectiveAtMs: Date.now(),
  });

  await expect
    .poll(
      async () => {
        const response = await fetch(
          `${API_BASE_URL}/rooms/resolve/${created.inviteCode}`,
        );
        return response.status;
      },
      { timeout: 5_000 },
    )
    .toBe(404);
});
