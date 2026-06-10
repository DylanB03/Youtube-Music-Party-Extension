import type { PendingInvite } from "@ytm-party/shared";
import { browser } from "./browser";
import { normalizeInviteCode } from "./invite-code";

const STORAGE_KEY = "pendingPartyInvite";
const INVITE_TTL_MS = 30 * 60_000;

export class PendingInviteStorage {
  async save(inviteCode: string): Promise<PendingInvite> {
    const normalizedCode = normalizeInviteCode(inviteCode);
    if (!normalizedCode) {
      throw new Error("The invite code is invalid.");
    }
    const invite: PendingInvite = {
      inviteCode: normalizedCode,
      receivedAtMs: Date.now(),
    };
    await browser.storage.local.set({ [STORAGE_KEY]: invite });
    return invite;
  }

  async load(): Promise<PendingInvite | null> {
    const values = await browser.storage.local.get(STORAGE_KEY);
    const invite = values[STORAGE_KEY] as PendingInvite | undefined;
    if (!invite || Date.now() - invite.receivedAtMs > INVITE_TTL_MS) {
      if (invite) await this.clear();
      return null;
    }
    return invite;
  }

  async clear(): Promise<void> {
    await browser.storage.local.remove(STORAGE_KEY);
  }
}
