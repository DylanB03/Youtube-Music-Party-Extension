import { useEffect, useState } from "react";
import type { ExtensionRequest } from "@ytm-party/shared";
import { browser } from "../../src/browser";
import { sendExtensionRequest } from "../../src/extension-messaging";
import type { SessionView } from "../../src/session-types";

const initialView: SessionView = {
  roomId: null,
  participantId: null,
  displayName: null,
  localSyncStatus: "not_joined",
  state: null,
};

export type PartyFeedback = {
  kind: "error" | "success";
  message: string;
};

export type PartyAction = (
  actionName: string,
  request: ExtensionRequest,
  successMessage?: string,
) => Promise<boolean>;

export function usePartySession() {
  const [view, setView] = useState<SessionView>(initialView);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<PartyFeedback | null>(null);

  useEffect(() => {
    void refresh();
    const listener = (message: { type?: string; state?: SessionView }) => {
      if (message.type !== "party.stateChanged" || !message.state) return;
      setView(message.state);
    };
    browser.runtime.onMessage.addListener(listener);
    return () => {
      browser.runtime.onMessage.removeListener(listener);
    };
  }, []);

  async function refresh(): Promise<void> {
    try {
      const response = await sendExtensionRequest<SessionView>({
        type: "party.getState",
      });
      if (response.ok) {
        setView(response.data);
      } else {
        setFeedback({ kind: "error", message: response.error });
      }
    } catch {
      setFeedback({
        kind: "error",
        message: "The extension service worker is unavailable. Reopen the panel.",
      });
    }
  }

  async function act(
    actionName: string,
    request: ExtensionRequest,
    successMessage?: string,
  ): Promise<boolean> {
    if (pendingAction) return false;
    setPendingAction(actionName);
    setFeedback(null);

    try {
      const response = await sendExtensionRequest<SessionView>(request);
      if (!response.ok) {
        setFeedback({ kind: "error", message: response.error });
        return false;
      }

      setView(response.data);
      if (successMessage) {
        setFeedback({ kind: "success", message: successMessage });
      }
      return true;
    } catch {
      setFeedback({
        kind: "error",
        message: "The action could not reach the extension service worker.",
      });
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  function clearFeedback(): void {
    setFeedback(null);
  }

  function reportFeedback(nextFeedback: PartyFeedback): void {
    setFeedback(nextFeedback);
  }

  return {
    view,
    pendingAction,
    feedback,
    act,
    clearFeedback,
    reportFeedback,
  };
}
