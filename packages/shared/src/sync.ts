import type { PartyPlaybackState } from "./protocol";

export const DRIFT_IGNORE_SECONDS = 0.25;
export const DRIFT_REJOIN_SECONDS = 2;

export function currentPlaybackPositionSeconds(
  playback: PartyPlaybackState,
  nowMs = Date.now(),
): number {
  if (playback.paused) {
    return Math.max(0, playback.positionSeconds);
  }

  const elapsedSeconds = Math.max(0, (nowMs - playback.effectiveAtMs) / 1000);
  return Math.max(0, playback.positionSeconds + elapsedSeconds);
}

export function estimateClockOffsetMs(
  clientSentAtMs: number,
  clientReceivedAtMs: number,
  serverSentAtMs: number,
): number {
  const roundTripMs = clientReceivedAtMs - clientSentAtMs;
  const estimatedServerAtReceiveMs = serverSentAtMs + roundTripMs / 2;
  return estimatedServerAtReceiveMs - clientReceivedAtMs;
}

export function shouldMarkOutOfSync(
  localPositionSeconds: number,
  playback: PartyPlaybackState,
  nowMs = Date.now(),
): boolean {
  const expected = currentPlaybackPositionSeconds(playback, nowMs);
  return Math.abs(localPositionSeconds - expected) >= DRIFT_REJOIN_SECONDS;
}

export function shouldCorrectDrift(
  localPositionSeconds: number,
  playback: PartyPlaybackState,
  nowMs = Date.now(),
): boolean {
  const expected = currentPlaybackPositionSeconds(playback, nowMs);
  return Math.abs(localPositionSeconds - expected) > DRIFT_IGNORE_SECONDS;
}
