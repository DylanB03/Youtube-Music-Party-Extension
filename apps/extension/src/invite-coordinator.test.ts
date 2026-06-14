import { describe, expect, it, vi } from "vitest";
import { preparePendingInvite } from "./invite-coordinator";

describe("invite preparation", () => {
  it("keeps a prepared invite when opening the side panel fails", async () => {
    const invite = { inviteCode: "ABC123", receivedAtMs: 1 };
    const notifyPrepared = vi.fn();

    await expect(
      preparePendingInvite({
        inviteCode: "ABC123",
        storage: {
          async save() {
            return invite;
          },
        },
        async openPanel() {
          throw new Error("Side panel unavailable");
        },
        notifyPrepared,
      }),
    ).resolves.toEqual(invite);
    expect(notifyPrepared).toHaveBeenCalledWith(invite);
  });
});
