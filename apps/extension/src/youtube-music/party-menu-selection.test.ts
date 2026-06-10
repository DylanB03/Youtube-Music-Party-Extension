import { describe, expect, it } from "vitest";
import { consumeMenuTrack } from "./party-menu-selection";
import { TrackSelectionStore } from "./track-selection";

describe("party menu selection", () => {
  it("consumes a matching current selection", () => {
    const store = new TrackSelectionStore();
    store.remember({ videoId: "selected" });

    expect(consumeMenuTrack(store, "selected")).toEqual({
      valid: true,
      track: { videoId: "selected" },
    });
    expect(store.peek()).toBeNull();
  });

  it("rejects replaced selections", () => {
    const store = new TrackSelectionStore();
    store.remember({ videoId: "other" });

    expect(consumeMenuTrack(store, "expected")).toEqual({
      valid: false,
      reason: "This song selection expired. Open its menu again.",
    });
    expect(store.peek()).toBeNull();
  });
});
