import { describe, expect, it, vi } from "vitest";
import type {
  LocalPlaybackState,
  PartyPlaybackState,
  PartyRoomState,
} from "@ytm-party/shared";
import { currentPlaybackPositionSeconds } from "@ytm-party/shared";
import { PlaybackSynchronizer } from "./playback-synchronizer";
import type { ActiveSession } from "./session-types";

class VerificationTabs {
  applyCount = 0;
  rateAdjustments: Array<{ playbackRate: number; durationMs: number }> = [];
  throwAfterApply = false;
  acceptPlayback = true;
  positionOffsetSeconds = 0;
  applyDelayMs = 0;
  local: LocalPlaybackState = {
    track: { videoId: "wrong-track" },
    paused: false,
    positionSeconds: 0,
    buffering: false,
  };

  async getPlayback(): Promise<LocalPlaybackState> {
    return this.local;
  }

  async applyPlayback(playback: PartyPlaybackState): Promise<"applied"> {
    this.applyCount += 1;
    if (this.applyDelayMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, this.applyDelayMs);
      });
    }
    if (this.acceptPlayback) {
      this.local = {
        track: playback.track,
        paused: playback.paused,
        positionSeconds:
          currentPlaybackPositionSeconds(playback, Date.now()) +
          this.positionOffsetSeconds,
        buffering: false,
      };
    }
    if (this.throwAfterApply) throw new Error("Late page error");
    return "applied";
  }

  async adjustPlaybackRate(
    playbackRate: number,
    durationMs: number,
  ): Promise<void> {
    this.rateAdjustments.push({ playbackRate, durationMs });
    this.local = { ...this.local, playbackRate };
  }
}

function activeSession(playback: PartyPlaybackState): ActiveSession {
  const state: PartyRoomState = {
    roomId: "room",
    revision: 1,
    hostParticipantId: "host",
    inviteCode: "ABC123",
    permissions: {
      guestsCanSkip: true,
      guestsCanAddToQueue: true,
      guestsCanRemoveFromQueue: false,
    },
    playback,
    queue: [],
    participants: [],
  };
  return {
    roomId: "room",
    participantId: "host",
    participantToken: "token",
    displayName: "Host",
    localSyncStatus: "navigating",
    resumeSyncStatus: "in_sync",
    state,
    client: { clockOffsetMs: 0 } as ActiveSession["client"],
  };
}

function canonicalPlayback(): PartyPlaybackState {
  return {
    track: { videoId: "canonical-track" },
    paused: false,
    positionSeconds: 0,
    effectiveAtMs: Date.now(),
  };
}

describe("PlaybackSynchronizer application verification", () => {
  it("reports applied only after reading back matching playback", async () => {
    const tabs = new VerificationTabs();
    const synchronizer = new PlaybackSynchronizer(tabs);

    await expect(synchronizer.apply(activeSession(canonicalPlayback()))).resolves.toBe(
      "applied",
    );
    expect(tabs.local.track?.videoId).toBe("canonical-track");
  });

  it("accepts a command that throws after YouTube Music loaded the track", async () => {
    const tabs = new VerificationTabs();
    tabs.throwAfterApply = true;
    const synchronizer = new PlaybackSynchronizer(tabs);

    await expect(synchronizer.apply(activeSession(canonicalPlayback()))).resolves.toBe(
      "applied",
    );
    expect(tabs.applyCount).toBe(1);
  });

  it("rejects an unverified command that leaves the wrong track playing", async () => {
    const tabs = new VerificationTabs();
    tabs.acceptPlayback = false;
    const synchronizer = new PlaybackSynchronizer(tabs);

    await expect(synchronizer.apply(activeSession(canonicalPlayback()))).resolves.toBe(
      "track_unavailable",
    );
    expect(tabs.local.track?.videoId).toBe("wrong-track");
  });

  it("rejects a correction that lands on the right track but remains audibly off", async () => {
    const tabs = new VerificationTabs();
    tabs.positionOffsetSeconds = 1;
    const synchronizer = new PlaybackSynchronizer(tabs);

    await expect(synchronizer.apply(activeSession(canonicalPlayback()))).resolves.toBe(
      "out_of_sync",
    );
    expect(tabs.applyCount).toBe(2);
    expect(tabs.local.track?.videoId).toBe("canonical-track");
  });

  it("keeps the room time anchor while a slow player loads", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    try {
      const tabs = new VerificationTabs();
      tabs.applyDelayMs = 1_000;
      const synchronizer = new PlaybackSynchronizer(tabs);
      const application = synchronizer.apply(activeSession(canonicalPlayback()));

      await vi.advanceTimersByTimeAsync(1_000);

      await expect(application).resolves.toBe("applied");
      expect(tabs.applyCount).toBe(1);
      expect(tabs.local.positionSeconds).toBeCloseTo(1, 3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a temporary rate correction for moderate drift", async () => {
    const canonical = canonicalPlayback();
    const tabs = new VerificationTabs();
    tabs.local = {
      track: canonical.track,
      paused: false,
      positionSeconds: 0.2,
      playbackRate: 1,
      buffering: false,
    };
    const synchronizer = new PlaybackSynchronizer(tabs);

    await expect(
      synchronizer.reconcile(activeSession(canonical)),
    ).resolves.toBe("correcting");
    expect(tabs.applyCount).toBe(0);
    expect(tabs.rateAdjustments[0]?.playbackRate).toBeLessThan(1);
  });
});
