import { useEffect, useState } from "react";
import type { PendingInvite } from "@ytm-party/shared";
import { browser } from "../../src/browser";
import { sendExtensionRequest } from "../../src/extension-messaging";

type PendingInviteChangedMessage = {
  type?: string;
  invite?: PendingInvite;
};

export function usePendingInvite() {
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);

  useEffect(() => {
    void loadPendingInvite();
    const listener = (message: PendingInviteChangedMessage) => {
      if (message.type === "party.pendingInviteChanged" && message.invite) {
        setPendingInvite(message.invite);
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => {
      browser.runtime.onMessage.removeListener(listener);
    };
  }, []);

  async function loadPendingInvite(): Promise<void> {
    try {
      const response = await sendExtensionRequest<PendingInvite | null>({
        type: "party.getPendingInvite",
      });
      if (response.ok) setPendingInvite(response.data);
    } catch {
      setPendingInvite(null);
    }
  }

  async function clearPendingInvite(): Promise<boolean> {
    try {
      const response = await sendExtensionRequest<null>({
        type: "party.clearPendingInvite",
      });
      if (!response.ok) return false;
      setPendingInvite(null);
      return true;
    } catch {
      return false;
    }
  }

  return { pendingInvite, clearPendingInvite };
}
