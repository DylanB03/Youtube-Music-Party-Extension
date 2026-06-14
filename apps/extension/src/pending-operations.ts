import type { MutationMessage, OperationResult } from "./session-types";

type PendingOperation = {
  message: MutationMessage;
  resolve: (result: OperationResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export class PendingOperationRegistry {
  private operations = new Map<string, PendingOperation>();

  constructor(
    private readonly timeoutMs: number,
    private readonly onTimeout: () => void,
  ) {}

  create(message: MutationMessage): Promise<OperationResult> {
    return new Promise<OperationResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.operations.delete(message.operationId);
        reject(new Error("The party action timed out. The latest state was requested."));
        this.onTimeout();
      }, this.timeoutMs);
      this.operations.set(message.operationId, {
        message,
        resolve,
        reject,
        timeout,
      });
    });
  }

  resolve(result: OperationResult): boolean {
    const pending = this.operations.get(result.operationId);
    if (!pending) return false;
    clearTimeout(pending.timeout);
    this.operations.delete(result.operationId);
    pending.resolve(result);
    return true;
  }

  rejectAll(error: Error): void {
    for (const pending of this.operations.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.operations.clear();
  }

  resend(send: (message: MutationMessage) => void): void {
    for (const pending of this.operations.values()) {
      send(pending.message);
    }
  }
}
