import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PartyPlaybackState } from "@ytm-party/shared";
import {
  ensureMediaPlaying,
  shouldPauseForPlaybackApplication,
} from "./media-control";

function playback(
  paused: boolean,
  effectiveAtMs: number,
): PartyPlaybackState {
  return {
    track: { videoId: "party-track" },
    paused,
    positionSeconds: 12,
    effectiveAtMs,
  };
}

describe("YouTube Music media control", () => {
  beforeEach(() => {
    vi.stubGlobal("HTMLMediaElement", { HAVE_FUTURE_DATA: 3 });
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  it("does not pause a playing canonical track while applying it", () => {
    expect(
      shouldPauseForPlaybackApplication(playback(false, 9_000), 10_000),
    ).toBe(false);
  });

  it("pauses canonical playback that is paused or scheduled in the future", () => {
    expect(
      shouldPauseForPlaybackApplication(playback(true, 9_000), 10_000),
    ).toBe(true);
    expect(
      shouldPauseForPlaybackApplication(playback(false, 11_000), 10_000),
    ).toBe(true);
  });

  it("does not invoke play again when YouTube Music already started the song", async () => {
    const play = vi.fn(() => new Promise<void>(() => undefined));
    const media = { paused: false, readyState: 3, play } as unknown as HTMLMediaElement;

    await expect(ensureMediaPlaying(media)).resolves.toBeUndefined();
    expect(play).not.toHaveBeenCalled();
  });

  it("waits for playable data even after play fires and paused becomes false", async () => {
    vi.useFakeTimers();
    try {
      const media = Object.assign(new EventTarget(), {
        paused: true, readyState: 2, seeking: false,
        play: vi.fn(() => {
          media.paused = false;
          media.dispatchEvent(new Event("play"));
          return new Promise<void>(() => undefined);
        }),
        pause: vi.fn(),
      });
      let settled = false;
      const starting = ensureMediaPlaying(media as unknown as HTMLMediaElement).then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(100);
      expect(settled).toBe(false);
      media.readyState = 3;
      media.dispatchEvent(new Event("playing"));
      await starting;
      expect(settled).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects instead of hanging when the browser play promise never settles", async () => {
    vi.useFakeTimers();
    try {
      const media = {
        paused: true,
        play: () => new Promise<void>(() => undefined),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as HTMLMediaElement;

      const result = ensureMediaPlaying(media, 250);
      const expectation = expect(result).rejects.toThrow(
        "Timed out starting YouTube Music playback.",
      );
      await vi.advanceTimersByTimeAsync(250);

      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });
});
