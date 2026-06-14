import { describe, expect, it } from "vitest";
import { parseServerMessage } from "./server-message";

describe("server message parser", () => {
  it("parses validated server messages", () => {
    expect(
      parseServerMessage(
        JSON.stringify({
          type: "clock.pong",
          clientSentAtMs: 10,
          serverSentAtMs: 12,
        }),
      ),
    ).toEqual({
      type: "clock.pong",
      clientSentAtMs: 10,
      serverSentAtMs: 12,
    });
  });

  it("rejects invalid JSON and unknown message shapes", () => {
    expect(parseServerMessage("{")).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "room.snapshot" }))).toBeNull();
  });
});
