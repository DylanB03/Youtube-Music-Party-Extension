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
      "correct_drift",
    );
  });

  it("marks large drift out of sync", () => {
    expect(decideGuestPlaybackAction(progress(15), canonical, 3_000)).toBe(
      "out_of_sync",
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

  it("marks a guest on the wrong track out of sync even at the expected position", () => {
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
      "out_of_sync",
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
});
