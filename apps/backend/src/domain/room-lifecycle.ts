import type { PartyRoomState } from "@ytm-party/shared";

export type RoomLifecycle = {
  maxAgeMs: number;
  idleTtlMs: number;
  emptyTtlMs: number;
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
  const expirationCandidates = [absoluteExpiration];
  if (!hasConnections) {
    expirationCandidates.push(lastActivityAtMs + lifecycle.idleTtlMs);
  }
  if (!state.playback.track && state.queue.length === 0) {
    expirationCandidates.push(lastActivityAtMs + lifecycle.emptyTtlMs);
  }
  return Math.min(...expirationCandidates);
}

export function roomShouldExpire(
  state: PartyRoomState,
  hasConnections: boolean,
  nowMs: number,
  lifecycle: RoomLifecycle,
): boolean {
  return nowMs >= nextRoomExpirationAtMs(state, hasConnections, lifecycle);
}
