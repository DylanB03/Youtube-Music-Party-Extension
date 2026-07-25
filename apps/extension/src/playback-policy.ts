import {
  type LocalPlaybackEvent,
  type LocalPlaybackState,
  type PartyPlaybackState,
  shouldCorrectDrift,
} from "@ytm-party/shared";

export type GuestPlaybackDecision =
  | "ignore"
  | "reconcile"
  | "track_unavailable";

export function decideGuestPlaybackAction(
  event: LocalPlaybackEvent,
  canonical: PartyPlaybackState,
  nowMs: number,
): GuestPlaybackDecision {
  if (event.playback.interruption === "advertisement") {
    return "ignore";
  }
  if (event.playback.interruption === "unavailable") {
    return "track_unavailable";
  }
  if (event.playback.track?.videoId !== canonical.track?.videoId) {
    return "reconcile";
  }
  if (event.playback.buffering) {
    return "ignore";
  }
  if (event.type === "local.play" && canonical.paused) {
    return "reconcile";
  }
  if (event.type === "local.pause" && !canonical.paused) {
    return "reconcile";
  }
  if (event.type === "local.interruption") {
    return "reconcile";
  }
  if (
    event.type !== "local.progress" &&
    event.type !== "local.buffering" &&
    event.type !== "local.play" &&
    event.type !== "local.pause" &&
    event.type !== "local.seek" &&
    event.type !== "local.track_changed"
  ) {
    return "ignore";
  }
  if (shouldCorrectDrift(event.playback.positionSeconds, canonical, nowMs)) {
    return "reconcile";
  }
  return "ignore";
}

export function canonicalPlaybackNeedsApplication(
  local: LocalPlaybackState,
  canonical: PartyPlaybackState,
  nowMs: number,
): boolean {
  if (local.interruption === "advertisement") return false;
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
