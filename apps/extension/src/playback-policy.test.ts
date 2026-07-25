import { describe, expect, it } from "vitest";
import type { LocalPlaybackEvent, PartyPlaybackState } from "@ytm-party/shared";
import {
  canonicalPlaybackNeedsApplication,
  decideGuestPlaybackAction,
} from "./playback-policy";

const canonical: PartyPlaybackState = {
  track: { videoId: "track-a" },
  paused: false,
  positionSeconds: 10,
  effectiveAtMs: 1_000,
};

function progress(positionSeconds: number): LocalPlaybackEvent {
  return {
    type: "local.progress",
    playback: {
      track: { videoId: "track-a" },
      paused: false,
      positionSeconds,
      buffering: false,
    },
  };
}

describe("guest playback policy", () => {
  it("corrects medium drift without forcing manual rejoin", () => {
    expect(decideGuestPlaybackAction(progress(12.6), canonical, 3_000)).toBe(
      "reconcile",
    );
  });

  it("auto-corrects large same-track drift instead of forcing manual rejoin", () => {
    expect(decideGuestPlaybackAction(progress(15), canonical, 3_000)).toBe(
      "reconcile",
    );
  });

  it("marks unavailable playback separately", () => {
    const event: LocalPlaybackEvent = {
      type: "local.interruption",
      playback: {
        track: { videoId: "track-a" },
        paused: true,
        positionSeconds: 12,
        buffering: false,
        interruption: "unavailable",
      },
    };
    expect(decideGuestPlaybackAction(event, canonical, 3_000)).toBe(
      "track_unavailable",
    );
  });

  it("ignores advertisements even when YouTube reports different ad playback", () => {
    const event: LocalPlaybackEvent = {
      type: "local.interruption",
      playback: {
        track: { videoId: "ad-video" },
        paused: false,
        positionSeconds: 3,
        buffering: false,
        interruption: "advertisement",
      },
    };

    expect(decideGuestPlaybackAction(event, canonical, 3_000)).toBe("ignore");
  });

  it("ignores same-track buffering instead of forcing a manual rejoin", () => {
    const event: LocalPlaybackEvent = {
      type: "local.pause",
      playback: {
        track: { videoId: "track-a" },
        paused: true,
        positionSeconds: 10,
        buffering: true,
      },
    };

    expect(decideGuestPlaybackAction(event, canonical, 3_000)).toBe("ignore");
  });

  it("ignores buffering drift while the correct track is still loading", () => {
    const event: LocalPlaybackEvent = {
      type: "local.buffering",
      playback: {
        track: { videoId: "track-a" },
        paused: false,
        positionSeconds: 0,
        buffering: true,
      },
    };

    expect(decideGuestPlaybackAction(event, canonical, 3_000)).toBe("ignore");
  });

  it("automatically restores a guest on the wrong track", () => {
    const event: LocalPlaybackEvent = {
      type: "local.progress",
      playback: {
        track: { videoId: "wrong-track" },
        paused: false,
        positionSeconds: 12,
        buffering: false,
      },
    };

    expect(decideGuestPlaybackAction(event, canonical, 3_000)).toBe(
      "reconcile",
    );
  });

  it("automatically restores an unbuffered guest pause", () => {
    const event: LocalPlaybackEvent = {
      type: "local.pause",
      playback: {
        track: { videoId: "track-a" },
        paused: true,
        positionSeconds: 12,
        buffering: false,
      },
    };

    expect(decideGuestPlaybackAction(event, canonical, 3_000)).toBe(
      "reconcile",
    );
  });

  it("automatically restores a guest seek", () => {
    const event: LocalPlaybackEvent = {
      type: "local.seek",
      playback: {
        track: { videoId: "track-a" },
        paused: false,
        positionSeconds: 30,
        buffering: false,
      },
    };

    expect(decideGuestPlaybackAction(event, canonical, 3_000)).toBe(
      "reconcile",
    );
  });

  it("applies canonical playback when track or pause state differs", () => {
    expect(
      canonicalPlaybackNeedsApplication(
        {
          track: { videoId: "track-b" },
          paused: false,
          positionSeconds: 12,
          buffering: false,
        },
        canonical,
        3_000,
      ),
    ).toBe(true);
  });

  it("does not fight YouTube while an advertisement is active", () => {
    expect(
      canonicalPlaybackNeedsApplication(
        {
          track: { videoId: "ad-video" },
          paused: false,
          positionSeconds: 3,
          buffering: false,
          interruption: "advertisement",
        },
        canonical,
        3_000,
      ),
    ).toBe(false);
  });
});
