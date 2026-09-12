import { describe, expect, it, vi } from "vitest";
import { PartyMutationCoordinator } from "./party-mutation-coordinator";
import type { MutationMessage, OperationResult, PartyConnection } from "./session-types";

const skip = (operationId: string, expectedRevision: number): MutationMessage =>
  ({ type: "playback.skip", operationId, expectedRevision });
const accepted = (revision: number): OperationResult =>
  ({ type: "operation.result", operationId: "op", accepted: true, revision });

describe("party mutation coordination", () => {
  it("does not regress a newer snapshot when a cached acknowledgment arrives", async () => {
    let finish!: (value: OperationResult) => void;
    const sendOperation = vi.fn()
      .mockImplementationOnce(() => new Promise<OperationResult>((resolve) => { finish = resolve; }))
      .mockResolvedValue(accepted(11));
    const client = { sendOperation } as unknown as PartyConnection;
    const coordinator = new PartyMutationCoordinator();
    const first = coordinator.execute(client, 2, skip);
    await Promise.resolve();
    coordinator.observeRevision(10);
    finish(accepted(3));
    await first;
    await coordinator.execute(client, 10, skip);
    expect(sendOperation.mock.calls[1]![0].expectedRevision).toBe(10);
  });

  it("cancels queued old-room actions and ignores their late acknowledgments after reset", async () => {
    let finish!: (value: OperationResult) => void;
    const sendOperation = vi.fn(() => new Promise<OperationResult>((resolve) => { finish = resolve; }));
    const oldClient = { sendOperation } as unknown as PartyConnection;
    const coordinator = new PartyMutationCoordinator();
    const first = coordinator.execute(oldClient, 2, skip);
    const queued = coordinator.execute(oldClient, 2, skip);
    const firstError = expect(first).rejects.toThrow("session changed");
    const queuedError = expect(queued).rejects.toThrow("session changed");
    await Promise.resolve();
    coordinator.reset();
    finish(accepted(20));
    await firstError;
    await queuedError;
    expect(sendOperation).toHaveBeenCalledTimes(1);
    const nextSend = vi.fn().mockResolvedValue(accepted(2));
    await coordinator.execute({ sendOperation: nextSend } as unknown as PartyConnection, 1, skip);
    expect(nextSend.mock.calls[0]![0].expectedRevision).toBe(1);
  });
});
