import type { PartyRoomState } from "@ytm-party/shared";

export type RoomLifecycle = {
  maxAgeMs: number;
  idleTtlMs: number;
};

export function nextRoomExpirationAtMs(
  state: PartyRoomState,
  hasConnections: boolean,
  lifecycle: RoomLifecycle,
): number {
  const createdAtMs = state.createdAtMs ?? state.lastActivityAtMs ?? Date.now();
  const lastActivityAtMs = state.lastActivityAtMs ?? createdAtMs;
  const absoluteExpiration =
    state.expiresAtMs ?? createdAtMs + lifecycle.maxAgeMs;
  if (hasConnections) return absoluteExpiration;
  return Math.min(absoluteExpiration, lastActivityAtMs + lifecycle.idleTtlMs);
}

export function roomShouldExpire(
  state: PartyRoomState,
  hasConnections: boolean,
  nowMs: number,
  lifecycle: RoomLifecycle,
): boolean {
  return nowMs >= nextRoomExpirationAtMs(state, hasConnections, lifecycle);
}
