import { describe, expect, it } from "vitest";
import type { QueueItem } from "@ytm-party/shared";
import { reorderQueueItemIds } from "./queue-order";

const queue = ["a", "b", "c"].map(
  (id): QueueItem => ({
    id,
    track: { videoId: id },
    addedByParticipantId: "host",
    addedAtMs: 1,
  }),
);

describe("reorderQueueItemIds", () => {
  it("moves an item downward to the target position", () => {
    expect(reorderQueueItemIds(queue, "a", "c")).toEqual(["b", "c", "a"]);
  });

  it("moves an item upward to the target position", () => {
    expect(reorderQueueItemIds(queue, "c", "a")).toEqual(["c", "a", "b"]);
  });

  it("rejects missing or unchanged items", () => {
    expect(reorderQueueItemIds(queue, "a", "a")).toBeNull();
    expect(reorderQueueItemIds(queue, "missing", "b")).toBeNull();
  });
});
