import { describe, expect, it } from "vitest";
import { isYouTubeMusicTab } from "./side-panel-gating";

describe("isYouTubeMusicTab", () => {
  it("accepts YouTube Music pages", () => {
    expect(isYouTubeMusicTab("https://music.youtube.com/")).toBe(true);
    expect(
      isYouTubeMusicTab("https://music.youtube.com/watch?v=abc"),
    ).toBe(true);
  });

  it("rejects other origins and invalid urls", () => {
    expect(isYouTubeMusicTab("https://www.youtube.com/")).toBe(false);
    expect(isYouTubeMusicTab("https://music.youtube.com.evil.com/")).toBe(false);
    expect(isYouTubeMusicTab("chrome://extensions")).toBe(false);
    expect(isYouTubeMusicTab("not a url")).toBe(false);
    expect(isYouTubeMusicTab(undefined)).toBe(false);
  });
});
