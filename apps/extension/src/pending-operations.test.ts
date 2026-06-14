import { afterEach, describe, expect, it, vi } from "vitest";
import { PendingOperationRegistry } from "./pending-operations";

const message = {
  type: "playback.skip",
  operationId: "operation",
  expectedRevision: 2,
} as const;

afterEach(() => {
  vi.useRealTimers();
});

describe("pending operation registry", () => {
  it("resolves an acknowledged operation and cancels its timeout", async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const registry = new PendingOperationRegistry(1_000, onTimeout);
    const pending = registry.create(message);

    expect(
      registry.resolve({
        type: "operation.result",
        operationId: "operation",
        accepted: true,
        revision: 3,
      }),
    ).toBe(true);
    await expect(pending).resolves.toMatchObject({ accepted: true, revision: 3 });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("rejects timed-out operations and requests recovery", async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const registry = new PendingOperationRegistry(1_000, onTimeout);
    const pending = registry.create(message);
    const rejection = expect(pending).rejects.toThrow("timed out");

    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it("retains unresolved operations for reconnect resends", async () => {
    const registry = new PendingOperationRegistry(10_000, () => undefined);
    const send = vi.fn();
    const pending = registry.create(message);
    const rejection = expect(pending).rejects.toThrow("closed");

    registry.resend(send);

    expect(send).toHaveBeenCalledWith(message);
    registry.rejectAll(new Error("closed"));
    await rejection;
  });
});
