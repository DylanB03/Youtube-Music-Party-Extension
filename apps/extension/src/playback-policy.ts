import {
  type LocalPlaybackEvent,
  type LocalPlaybackState,
  type PartyPlaybackState,
  shouldCorrectDrift,
  shouldMarkOutOfSync,
} from "@ytm-party/shared";

export type GuestPlaybackDecision =
  | "ignore"
  | "correct_drift"
  | "out_of_sync"
  | "track_unavailable";

export function decideGuestPlaybackAction(
  event: LocalPlaybackEvent,
  canonical: PartyPlaybackState,
  nowMs: number,
): GuestPlaybackDecision {
  if (event.playback.interruption === "unavailable") {
    return "track_unavailable";
  }
  if (event.playback.track?.videoId !== canonical.track?.videoId) {
    return "out_of_sync";
  }
  if (
    event.type === "local.play" ||
    event.type === "local.pause" ||
    event.type === "local.seek" ||
    event.type === "local.track_changed" ||
    event.type === "local.interruption"
  ) {
    return "out_of_sync";
  }
  if (event.type !== "local.progress" && event.type !== "local.buffering") {
    return "ignore";
  }
  if (shouldMarkOutOfSync(event.playback.positionSeconds, canonical, nowMs)) {
    return "out_of_sync";
  }
  if (shouldCorrectDrift(event.playback.positionSeconds, canonical, nowMs)) {
    return "correct_drift";
  }
  return "ignore";
}

export function canonicalPlaybackNeedsApplication(
  local: LocalPlaybackState,
  canonical: PartyPlaybackState,
  nowMs: number,
): boolean {
  const trackChanged = local.track?.videoId !== canonical.track?.videoId;
  const pauseChanged = local.paused !== canonical.paused;
  const drifted = shouldCorrectDrift(local.positionSeconds, canonical, nowMs);
  return trackChanged || pauseChanged || drifted;
}

export function localToPartyPlayback(
  playback: LocalPlaybackState,
  nowMs: number,
): PartyPlaybackState {
  return {
    track: playback.track,
    paused: playback.paused,
    positionSeconds: playback.positionSeconds,
    effectiveAtMs: nowMs,
  };
}

export function playbackKey(playback: PartyPlaybackState): string {
  const parts = [
    playback.track?.videoId ?? "",
    playback.paused ? "paused" : "playing",
    playback.positionSeconds,
    playback.effectiveAtMs,
  ];
  return parts.join(":");
}
