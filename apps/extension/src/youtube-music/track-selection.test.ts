import { describe, expect, it } from "vitest";
import { TrackSelectionStore } from "./track-selection";

describe("track selection store", () => {
  it("consumes a selected track only once", () => {
    const store = new TrackSelectionStore(() => 100, 1_000);
    store.remember({ videoId: "selected" });

    expect(store.take()?.videoId).toBe("selected");
    expect(store.take()).toBeNull();
  });

  it("expires stale selections", () => {
    let nowMs = 100;
    const store = new TrackSelectionStore(() => nowMs, 1_000);
    store.remember({ videoId: "selected" });

    expect(store.peek()?.videoId).toBe("selected");
    nowMs = 1_101;
    expect(store.peek()).toBeNull();
  });
});
