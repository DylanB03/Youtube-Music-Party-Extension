import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalPlaybackState } from "@ytm-party/shared";
import { observePlayback } from "./youtube-music-adapter";
import { findMediaElement, readPlaybackState } from "./youtube-music/selectors";

vi.mock("./youtube-music/selectors", () => ({
  findMediaElement: vi.fn(),
  readPlaybackState: vi.fn(),
}));
vi.mock("./youtube-music/page-bridge", () => ({
  getPagePlayerTrack: vi.fn(async () => null),
}));

describe("adapter end-of-track evidence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([40, 178])("clears stale end evidence after a backward seek, with previous poll at %i", async (previousPosition) => {
    const media = Object.assign(new EventTarget(), { ended: false });
    let playback: LocalPlaybackState = {
      track: { videoId: "current" }, paused: false, buffering: false,
      positionSeconds: previousPosition, durationSeconds: 180,
    };
    vi.mocked(findMediaElement).mockReturnValue(media as HTMLMediaElement);
    vi.mocked(readPlaybackState).mockImplementation(() => playback);
    const listener = vi.fn();
    const stop = observePlayback(listener);
    try {
      await Promise.resolve();
      playback = { ...playback, positionSeconds: 178 };
      media.dispatchEvent(new Event("timeupdate"));
      playback = { ...playback, positionSeconds: 10 };
      media.dispatchEvent(new Event("seeked"));
      listener.mockClear();
      playback = { ...playback, track: { videoId: "chosen" }, positionSeconds: 0 };
      await vi.advanceTimersByTimeAsync(500);
      expect(listener.mock.calls.map(([event]) => event.type)).toEqual(["local.track_changed"]);
    } finally {
      stop();
    }
  });

  it("preserves end evidence when native auto-next resets the old media to zero", async () => {
    const media = Object.assign(new EventTarget(), { ended: false });
    let playback: LocalPlaybackState = {
      track: { videoId: "current" }, paused: false, buffering: false,
      positionSeconds: 40, durationSeconds: 180,
    };
    vi.mocked(findMediaElement).mockReturnValue(media as HTMLMediaElement);
    vi.mocked(readPlaybackState).mockImplementation(() => playback);
    const listener = vi.fn();
    const stop = observePlayback(listener);
    try {
      await Promise.resolve();
      playback = { ...playback, positionSeconds: 178 };
      media.dispatchEvent(new Event("timeupdate"));
      playback = { ...playback, positionSeconds: 0 };
      media.dispatchEvent(new Event("seeked"));
      listener.mockClear();
      playback = { ...playback, track: { videoId: "native-next" } };
      await vi.advanceTimersByTimeAsync(500);
      expect(listener.mock.calls.map(([event]) => event.type)).toEqual(["local.ended"]);
    } finally {
      stop();
    }
  });
});
