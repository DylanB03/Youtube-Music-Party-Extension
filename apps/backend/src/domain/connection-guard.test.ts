import { describe, expect, it } from "vitest";
import {
  consumeMessageAllowance,
  messageSizeBytes,
} from "./connection-guard";

describe("connection guard", () => {
  it("measures UTF-8 message bytes", () => {
    expect(messageSizeBytes("party")).toBe(5);
    expect(messageSizeBytes("🎵")).toBe(4);
  });

  it("limits bursts and resets after the window", () => {
    const session = {
      participantId: "guest",
      displayName: "Guest",
      messageWindowStartedAtMs: 100,
      messageCount: 0,
    };

    expect(consumeMessageAllowance(session, 100, 2, 1_000)).toBe(true);
    expect(consumeMessageAllowance(session, 200, 2, 1_000)).toBe(true);
    expect(consumeMessageAllowance(session, 300, 2, 1_000)).toBe(false);
    expect(consumeMessageAllowance(session, 1_100, 2, 1_000)).toBe(true);
  });
});
