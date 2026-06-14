import type { PendingInvite } from "@ytm-party/shared";
import { browser } from "./browser";
import { normalizeInviteCode } from "./invite-code";

const STORAGE_KEY = "pendingPartyInvite";
const INVITE_TTL_MS = 30 * 60_000;

type PendingInviteStoragePort = {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
};

export class PendingInviteStorage {
  constructor(
    private readonly storage: PendingInviteStoragePort = browser.storage.local,
    private readonly now: () => number = Date.now,
  ) {}

  async save(inviteCode: string): Promise<PendingInvite> {
    const normalizedCode = normalizeInviteCode(inviteCode);
    if (!normalizedCode) {
      throw new Error("The invite code is invalid.");
    }
    const invite: PendingInvite = {
      inviteCode: normalizedCode,
      receivedAtMs: this.now(),
    };
    await this.storage.set({ [STORAGE_KEY]: invite });
    return invite;
  }

  async load(): Promise<PendingInvite | null> {
    const values = await this.storage.get(STORAGE_KEY);
    const storedInvite = values[STORAGE_KEY];
    if (!isPendingInvite(storedInvite)) {
      if (storedInvite !== undefined) await this.clear();
      return null;
    }
    if (this.now() - storedInvite.receivedAtMs > INVITE_TTL_MS) {
      await this.clear();
      return null;
    }
    return storedInvite;
  }

  async clear(): Promise<void> {
    await this.storage.remove(STORAGE_KEY);
  }
}

function isPendingInvite(value: unknown): value is PendingInvite {
  if (!value || typeof value !== "object") return false;
  const invite = value as PendingInvite;
  return (
    typeof invite.inviteCode === "string" &&
    normalizeInviteCode(invite.inviteCode) === invite.inviteCode &&
    invite.inviteCode.length > 0 &&
    Number.isFinite(invite.receivedAtMs)
  );
}
