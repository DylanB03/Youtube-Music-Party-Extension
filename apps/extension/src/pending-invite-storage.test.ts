import { describe, expect, it } from "vitest";
import { normalizeInviteCode } from "./invite-code";
import { PendingInviteStorage } from "./pending-invite-storage";

class FakeStorage {
  values: Record<string, unknown> = {};
  removed: string[] = [];

  async get(): Promise<Record<string, unknown>> {
    return this.values;
  }

  async set(values: Record<string, unknown>): Promise<void> {
    Object.assign(this.values, values);
  }

  async remove(key: string): Promise<void> {
    this.removed.push(key);
    delete this.values[key];
  }
}

describe("pending invite storage", () => {
  it("normalizes codes from links and user input", () => {
    expect(normalizeInviteCode(" ab-c 123 ")).toBe("ABC123");
  });

  it("expires prepared invites after thirty minutes", async () => {
    const storage = new FakeStorage();
    const pendingInvites = new PendingInviteStorage(storage, () => 1_000);
    await pendingInvites.save("ABC123");

    const expiredInvites = new PendingInviteStorage(
      storage,
      () => 1_000 + 30 * 60_000 + 1,
    );

    await expect(expiredInvites.load()).resolves.toBeNull();
    expect(storage.removed).toContain("pendingPartyInvite");
  });

  it("clears malformed persisted invite data", async () => {
    const storage = new FakeStorage();
    storage.values.pendingPartyInvite = {
      inviteCode: "not normalized",
      receivedAtMs: "yesterday",
    };

    await expect(new PendingInviteStorage(storage).load()).resolves.toBeNull();
    expect(storage.removed).toContain("pendingPartyInvite");
  });

  it("rejects an empty invite code", async () => {
    const storage = new FakeStorage();
    await expect(new PendingInviteStorage(storage).save("---")).rejects.toThrow(
      "invalid",
    );
  });
});
