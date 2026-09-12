import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("page player identity", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", Object.assign(new EventTarget(), {
      setTimeout,
      clearTimeout,
    }));
    vi.stubGlobal("location", { href: "https://music.youtube.com/watch?v=requested" });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it("does not treat the requested URL as a verified loaded player", async () => {
    vi.stubGlobal("document", { querySelector: () => ({}) });
    const bridge = await import("./page-bridge");
    bridge.installPageBridgeListener();
    expect(await bridge.getPagePlayerVideoId()).toBeNull();
    // The metadata-only path can still display a URL-derived placeholder.
    expect(await bridge.getPagePlayerTrack()).toMatchObject({ videoId: "requested" });
  });

  it("uses actual player identity when it disagrees with the requested URL", async () => {
    vi.stubGlobal("document", {
      querySelector: () => ({ playerApi: { getVideoData: () => ({ video_id: "playing" }) } }),
    });
    const bridge = await import("./page-bridge");
    bridge.installPageBridgeListener();
    expect(await bridge.getPagePlayerVideoId()).toBe("playing");
  });
});
