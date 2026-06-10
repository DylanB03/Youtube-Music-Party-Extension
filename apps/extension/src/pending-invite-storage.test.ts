import { describe, expect, it } from "vitest";
import { normalizeInviteCode } from "./invite-code";

describe("pending invite storage", () => {
  it("normalizes codes from links and user input", () => {
    expect(normalizeInviteCode(" ab-c 123 ")).toBe("ABC123");
  });
});
