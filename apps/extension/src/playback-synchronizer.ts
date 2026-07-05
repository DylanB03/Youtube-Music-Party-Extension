import {
  currentPlaybackPositionSeconds,
  type LocalPlaybackEvent,
  type LocalPlaybackState,
  type PartyPlaybackState,
  shouldMarkOutOfSync,
} from "@ytm-party/shared";
import {
  canonicalPlaybackNeedsApplication,
  decideGuestPlaybackAction,
} from "./playback-policy";
import type { PlaybackApplicationResult } from "./playback-application";
import type { ActiveSession } from "./session-types";

type PlaybackTabPort = {
  getPlayback(tabId?: number): Promise<LocalPlaybackState>;
  applyPlayback(
    playback: PartyPlaybackState,
    tabId?: number,
  ): Promise<PlaybackApplicationResult>;
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

  async reconcile(
    session: ActiveSession,
    tabId?: number,
  ): Promise<PlaybackSyncResult> {
    const canonical = session.state?.playback;
    if (!canonical) return "unchanged";
    const local = await this.tabs.getPlayback(tabId);
    if (!canonical.track) {
      if (!local.track || local.paused) return "unchanged";
      return this.apply(session, tabId);
    }
    const nowMs = Date.now() + session.client.clockOffsetMs;
    if (!canonicalPlaybackNeedsApplication(local, canonical, nowMs)) {
      return "unchanged";
    }
    return this.apply(session, tabId);
  }

  async apply(session: ActiveSession, tabId?: number): Promise<PlaybackSyncResult> {
    const canonical = session.state?.playback;
    if (!canonical) return "applied";

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const nowMs = Date.now() + session.client.clockOffsetMs;
      const playback: PartyPlaybackState = {
        ...canonical,
        positionSeconds: currentPlaybackPositionSeconds(canonical, nowMs),
        effectiveAtMs: Date.now(),
      };
      let applicationResult: PlaybackApplicationResult | null = null;
      try {
        applicationResult = await this.tabs.applyPlayback(playback, tabId);
      } catch {
        // A page command can throw after YouTube Music has already accepted it.
        // Read the actual player state before declaring the track unavailable.
      }

      let local: LocalPlaybackState | null = null;
      try {
        local = await this.tabs.getPlayback(tabId);
      } catch {
        // Verification failure is handled as an unavailable track below.
      }

      if (local && this.matchesAppliedPlayback(local, playback)) return "applied";
      if (applicationResult === "navigating") return "navigating";

      const correctTrack = playback.track
        ? local?.track?.videoId === playback.track.videoId
        : local?.paused === true;
      if (attempt === 0 && correctTrack) continue;
      return "track_unavailable";
    }

    return "track_unavailable";
  }

  private matchesAppliedPlayback(
    local: LocalPlaybackState,
    applied: PartyPlaybackState,
  ): boolean {
    if (!applied.track) return local.paused;
    if (local.track?.videoId !== applied.track.videoId) return false;
    if (local.paused !== applied.paused) return false;
    return !shouldMarkOutOfSync(local.positionSeconds, applied, Date.now());
  }
}
