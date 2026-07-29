import {
  DRIFT_APPLY_TOLERANCE_SECONDS,
  DRIFT_SOFT_CORRECTION_MAX_SECONDS,
  isWithinPlaybackDrift,
  playbackDriftSeconds,
  type LocalPlaybackEvent,
  type LocalPlaybackState,
  type PartyPlaybackState,
} from "@ytm-party/shared";
import {
  canonicalPlaybackNeedsApplication,
  decideGuestPlaybackAction,
  playbackKey,
} from "./playback-policy";
import type { PlaybackApplicationResult } from "./playback-application";
import type { ActiveSession } from "./session-types";

type PlaybackTabPort = {
  getPlayback(tabId?: number): Promise<LocalPlaybackState>;
  applyPlayback(
    playback: PartyPlaybackState,
    tabId?: number,
  ): Promise<PlaybackApplicationResult>;
  adjustPlaybackRate(
    playbackRate: number,
    durationMs: number,
    tabId?: number,
  ): Promise<void>;
};

export type PlaybackSyncResult =
  | "applied"
  | "unchanged"
  | "correcting"
  | "navigating"
  | "out_of_sync"
  | "track_unavailable";

export class PlaybackSynchronizer {
  private applicationInFlight: {
    key: string;
    promise: Promise<PlaybackSyncResult>;
  } | null = null;

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
      if (local.playbackRate && Math.abs(local.playbackRate - 1) > 0.001) {
        await this.tabs.adjustPlaybackRate(1, 0, tabId);
        return "correcting";
      }
      return "unchanged";
    }
    if (
      canonical.track &&
      local.track?.videoId === canonical.track.videoId &&
      !canonical.paused &&
      !local.paused &&
      !local.buffering &&
      !local.interruption
    ) {
      const driftSeconds = playbackDriftSeconds(
        local.positionSeconds,
        canonical,
        nowMs,
      );
      if (Math.abs(driftSeconds) <= DRIFT_SOFT_CORRECTION_MAX_SECONDS) {
        const rateDelta = 0.04;
        const playbackRate = driftSeconds > 0 ? 1 - rateDelta : 1 + rateDelta;
        const durationMs = Math.max(
          300,
          Math.min(
            5_000,
            ((Math.abs(driftSeconds) - 0.03) / rateDelta) * 1_000,
          ),
        );
        await this.tabs.adjustPlaybackRate(playbackRate, durationMs, tabId);
        return "correcting";
      }
    }
    return this.apply(session, tabId);
  }

  async apply(session: ActiveSession, tabId?: number): Promise<PlaybackSyncResult> {
    const canonical = session.state?.playback;
    if (!canonical) return "applied";
    const key = `${tabId ?? "default"}:${playbackKey(canonical)}`;
    const inFlight = this.applicationInFlight;
    if (inFlight) {
      const result = await inFlight.promise;
      if (inFlight.key === key) return result;
      return this.apply(session, tabId);
    }

    const promise = this.applyCanonical(
      canonical,
      session.client.clockOffsetMs,
      tabId,
    );
    this.applicationInFlight = { key, promise };
    try {
      return await promise;
    } finally {
      if (this.applicationInFlight?.promise === promise) {
        this.applicationInFlight = null;
      }
    }
  }

  private async applyCanonical(
    canonical: PartyPlaybackState,
    clockOffsetMs: number,
    tabId?: number,
  ): Promise<PlaybackSyncResult> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const playback: PartyPlaybackState = {
        ...canonical,
        effectiveAtMs: canonical.effectiveAtMs - clockOffsetMs,
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
      return correctTrack ? "out_of_sync" : "track_unavailable";
    }

    return "out_of_sync";
  }

  private matchesAppliedPlayback(
    local: LocalPlaybackState,
    applied: PartyPlaybackState,
  ): boolean {
    if (!applied.track) return local.paused;
    if (local.track?.videoId !== applied.track.videoId) return false;
    if (local.paused !== applied.paused) return false;
    return isWithinPlaybackDrift(
      local.positionSeconds,
      applied,
      Date.now(),
      DRIFT_APPLY_TOLERANCE_SECONDS,
    );
  }
}
