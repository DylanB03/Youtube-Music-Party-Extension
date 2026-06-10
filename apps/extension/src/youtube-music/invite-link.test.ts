import { describe, expect, it } from "vitest";
import {
  readInviteCodeFromLocation,
  removeInviteCodeFromLocation,
} from "./invite-link";

describe("YouTube Music invite links", () => {
  it("extracts and normalizes an invite code", () => {
    expect(
      readInviteCodeFromLocation(
        "https://music.youtube.com/?ytm_party=ab-c123",
      ),
    ).toBe("ABC123");
  });

  it("removes only the party query parameter", () => {
    expect(
      removeInviteCodeFromLocation(
        "https://music.youtube.com/watch?v=track&ytm_party=ABC123",
      ),
    ).toBe("https://music.youtube.com/watch?v=track");
  });
});
