import {
  currentPlaybackPositionSeconds,
  type LocalPlaybackEvent,
  type LocalPlaybackState,
  type PartyPlaybackState,
} from "@ytm-party/shared";
import {
  canonicalPlaybackNeedsApplication,
  decideGuestPlaybackAction,
} from "./playback-policy";
import type { PlaybackApplicationResult } from "./playback-application";
import type { ActiveSession } from "./session-types";

type PlaybackTabPort = {
  getPlayback(): Promise<LocalPlaybackState>;
  applyPlayback(playback: PartyPlaybackState): Promise<PlaybackApplicationResult>;
};

export type PlaybackSyncResult =
  | "applied"
  | "unchanged"
  | "navigating"
  | "track_unavailable";

export class PlaybackSynchronizer {
  constructor(private readonly tabs: PlaybackTabPort) {}

  decideGuestAction(
    event: LocalPlaybackEvent,
    session: ActiveSession,
  ): ReturnType<typeof decideGuestPlaybackAction> {
    const playback = session.state?.playback;
    if (!playback) return "ignore";
    const nowMs = Date.now() + session.client.clockOffsetMs;
    return decideGuestPlaybackAction(event, playback, nowMs);
  }

  async reconcile(session: ActiveSession): Promise<PlaybackSyncResult> {
    const canonical = session.state?.playback;
    if (!canonical?.track) return "unchanged";
    const local = await this.tabs.getPlayback();
    const nowMs = Date.now() + session.client.clockOffsetMs;
    if (!canonicalPlaybackNeedsApplication(local, canonical, nowMs)) {
      return "unchanged";
    }
    return this.apply(session);
  }

  async apply(session: ActiveSession): Promise<PlaybackSyncResult> {
    const canonical = session.state?.playback;
    if (!canonical?.track) return "applied";
    const nowMs = Date.now() + session.client.clockOffsetMs;
    const playback: PartyPlaybackState = {
      ...canonical,
      positionSeconds: currentPlaybackPositionSeconds(canonical, nowMs),
      effectiveAtMs: Date.now(),
    };

    try {
      const result = await this.tabs.applyPlayback(playback);
      return result === "navigating" ? "navigating" : "applied";
    } catch {
      return "track_unavailable";
    }
  }
}
