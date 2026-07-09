import {
  isClientMessage,
  type ClientMessage,
  type PartyRoomState,
  type ServerMessage,
} from "@ytm-party/shared";
import { generateId } from "../lib/ids";
import type { RoomAuth, SessionMeta } from "../types";
import {
  consumeMessageAllowance,
  messageSizeBytes,
} from "./connection-guard";
import {
  removeParticipantAuth,
  rememberOperationResult,
} from "./room-auth";
import type { RoomLimits } from "./room-limits";
import { applyRoomMutation } from "./room-state";

type RoomMessageContext = {
  socket: WebSocket;
  raw: unknown;
  session: SessionMeta;
  room: PartyRoomState;
  auth: RoomAuth;
  limits: RoomLimits;
  send: (message: ServerMessage) => void;
  persist: () => Promise<void>;
  broadcast: () => void;
  connectedParticipantIds: () => Set<string>;
  closeParticipant: (participantId: string, code: number, reason: string) => void;
  now: () => number;
};

export async function processRoomMessage({
  socket,
  raw,
  session,
  room,
  auth,
  limits,
  send,
  persist,
  broadcast,
  connectedParticipantIds,
  closeParticipant,
  now,
}: RoomMessageContext): Promise<void> {
  if (messageSizeBytes(raw) > limits.maxMessageBytes) {
    send({
      type: "room.error",
      code: "message_too_large",
      message: "Party message is too large.",
    });
    socket.close(1009, "Message too large");
    return;
  }
  if (
    !consumeMessageAllowance(
      session,
      now(),
      limits.maxMessagesPerWindow,
      limits.messageWindowMs,
    )
  ) {
    send({
      type: "room.error",
      code: "rate_limited",
      message: "Too many party messages.",
    });
    socket.close(1008, "Message rate exceeded");
    return;
  }

  const message = parseClientMessage(raw);
  if (!message) {
    send({
      type: "room.error",
      code: "invalid_message",
      message: "Message must be valid JSON with a known shape.",
    });
    return;
  }
  if (message.type === "clock.ping") {
    send({
      type: "clock.pong",
      clientSentAtMs: message.clientSentAtMs,
      serverSentAtMs: now(),
    });
    return;
  }
  if (message.type === "room.snapshot.request") {
    send({ type: "room.snapshot", state: room });
    return;
  }

  const eventTimeMs = now();
  if (message.type === "participant.status") {
    // Presence updates broadcast a fresh snapshot but intentionally do NOT
    // increment the room revision. The revision drives optimistic-concurrency
    // checks for queue/playback/permission mutations, and a guest's sync status
    // flapping must never invalidate another participant's in-flight action.
    const result = applyRoomMutation(
      room,
      message,
      session.participantId,
      eventTimeMs,
      () => generateId("queue"),
      limits,
    );
    if (result.changed) {
      room.lastActivityAtMs = eventTimeMs;
      await persist();
      broadcast();
    }
    return;
  }

  const cachedResult = auth.operationResults[message.operationId];
  if (cachedResult) {
    send(cachedResult);
    return;
  }
  const result = applyRoomMutation(
    room,
    message,
    session.participantId,
    eventTimeMs,
    () => generateId("queue"),
    limits,
    connectedParticipantIds(),
  );
  if (result.error) {
    const operationResult: Extract<
      ServerMessage,
      { type: "operation.result" }
    > = {
      type: "operation.result",
      operationId: message.operationId,
      accepted: false,
      revision: room.revision,
      error: {
        code: result.error.code,
        message: result.error.message,
      },
    };
    rememberOperationResult(auth, operationResult);
    await persist();
    send(operationResult);
    if (result.error.includeSnapshot) {
      send({ type: "room.snapshot", state: room });
    }
    return;
  }
  if (!result.changed) return;

  room.lastActivityAtMs = eventTimeMs;
  room.revision += 1;
  const operationResult: Extract<
    ServerMessage,
    { type: "operation.result" }
  > = {
    type: "operation.result",
    operationId: message.operationId,
    accepted: true,
    revision: room.revision,
  };
  rememberOperationResult(auth, operationResult);
  if (message.type === "participant.leave") {
    removeParticipantAuth(auth, session.participantId);
  }
  await persist();
  broadcast();
  send(operationResult);
  if (message.type === "participant.leave") {
    closeParticipant(session.participantId, 1000, "Participant left");
  }
}

function parseClientMessage(raw: unknown): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return null;
  }
  if (!isClientMessage(parsed)) return null;
  return parsed;
}
