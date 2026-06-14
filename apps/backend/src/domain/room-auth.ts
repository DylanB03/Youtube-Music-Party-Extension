import type {
  ConnectionTicketResponse,
  ParticipantState,
  ServerMessage,
} from "@ytm-party/shared";
import { generateToken } from "../lib/ids";
import type { RoomAuth } from "../types";

type ConnectionTicket = RoomAuth["connectionTickets"][string];
type OperationResult = Extract<ServerMessage, { type: "operation.result" }>;

export function createRoomAuth(
  participantId: string,
  participantToken: string,
): RoomAuth {
  const auth: RoomAuth = {
    participantTokens: {
      [participantId]: participantToken,
    },
    connectionTickets: {},
    operationResults: {},
  };
  return auth;
}

export function issueConnectionTicket(
  auth: RoomAuth,
  participant: ParticipantState,
  nowMs: number,
  ttlMs: number,
): ConnectionTicketResponse {
  removeExpiredTickets(auth, nowMs);
  const ticket = generateToken();
  const expiresAtMs = nowMs + ttlMs;
  auth.connectionTickets[ticket] = {
    participantId: participant.participantId,
    displayName: participant.displayName,
    expiresAtMs,
  };
  return { ticket, expiresAtMs };
}

export function consumeConnectionTicket(
  auth: RoomAuth,
  ticket: string,
  nowMs: number,
): ConnectionTicket | null {
  const details = auth.connectionTickets[ticket];
  delete auth.connectionTickets[ticket];
  if (!details || details.expiresAtMs < nowMs) return null;
  return details;
}

export function rememberOperationResult(
  auth: RoomAuth,
  result: OperationResult,
  maximumResults = 256,
): void {
  auth.operationResults[result.operationId] = result;
  const operationIds = Object.keys(auth.operationResults);
  const excessCount = operationIds.length - maximumResults;
  if (excessCount <= 0) return;
  for (const operationId of operationIds.slice(0, excessCount)) {
    delete auth.operationResults[operationId];
  }
}

export function removeOrphanedParticipantTokens(
  auth: RoomAuth,
  activeParticipantIds: Set<string>,
): void {
  for (const participantId of Object.keys(auth.participantTokens)) {
    if (!activeParticipantIds.has(participantId)) {
      delete auth.participantTokens[participantId];
    }
  }
}

function removeExpiredTickets(auth: RoomAuth, nowMs: number): void {
  for (const [ticket, details] of Object.entries(auth.connectionTickets)) {
    if (details.expiresAtMs < nowMs) delete auth.connectionTickets[ticket];
  }
}
