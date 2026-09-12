import type {
  MutationMessage,
  OperationResult,
  PartyConnection,
} from "./session-types";

export class PartyMutationCoordinator {
  private acknowledgedRevision = 0;
  private chain: Promise<void> = Promise.resolve();
  private generation = 0;

  reset(): void {
    this.generation += 1;
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
    const generation = this.generation;
    const execution = this.chain.then(async () => {
      if (generation !== this.generation) throw new Error("The party session changed.");
      const operationId = crypto.randomUUID();
      const expectedRevision = Math.max(this.acknowledgedRevision, snapshotRevision);
      result = await connection.sendOperation(
        buildMessage(operationId, expectedRevision),
      );
      if (generation !== this.generation) throw new Error("The party session changed.");
      this.observeRevision(result.revision);
    });
    this.chain = execution.catch(() => undefined);
    await execution;
    if (!result) throw new Error("The party action did not produce a result.");
    return result;
  }
}
