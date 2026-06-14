import type {
  MutationMessage,
  OperationResult,
  PartyConnection,
} from "./session-types";

export class PartyMutationCoordinator {
  private acknowledgedRevision = 0;
  private chain: Promise<void> = Promise.resolve();

  reset(): void {
    this.acknowledgedRevision = 0;
    this.chain = Promise.resolve();
  }

  observeRevision(revision: number): void {
    this.acknowledgedRevision = Math.max(this.acknowledgedRevision, revision);
  }

  async execute(
    connection: PartyConnection,
    snapshotRevision: number,
    buildMessage: (
      operationId: string,
      expectedRevision: number,
    ) => MutationMessage,
  ): Promise<OperationResult> {
    let result: OperationResult | undefined;
    const execution = this.chain.then(async () => {
      const operationId = crypto.randomUUID();
      const expectedRevision = this.acknowledgedRevision || snapshotRevision;
      result = await connection.sendOperation(
        buildMessage(operationId, expectedRevision),
      );
      this.acknowledgedRevision = result.revision;
    });
    this.chain = execution.catch(() => undefined);
    await execution;
    if (!result) throw new Error("The party action did not produce a result.");
    return result;
  }
}
