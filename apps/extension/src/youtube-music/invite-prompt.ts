import type { ExtensionResponse, PendingInvite } from "@ytm-party/shared";
import { INVITE_PROMPT_STYLES } from "./invite-prompt-styles";

type InvitePromptOptions = {
  inviteCode: string;
  prepareInvite: () => Promise<ExtensionResponse<PendingInvite>>;
  onComplete: () => void;
};

export function installInvitePrompt({
  inviteCode,
  prepareInvite,
  onComplete,
}: InvitePromptOptions): () => void {
  const host = document.createElement("div");
  host.dataset.ytmPartyInvitePrompt = "";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = INVITE_PROMPT_STYLES;

  const prompt = document.createElement("section");
  prompt.className = "prompt";
  prompt.setAttribute("role", "dialog");
  prompt.setAttribute("aria-label", "YouTube Music party invitation");

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Party invitation";
  const heading = document.createElement("h2");
  heading.textContent = "Join your friends here.";
  const description = document.createElement("p");
  description.textContent =
    "Prepare this invite in the extension panel. Playback will not change until you choose Join playback.";
  const code = document.createElement("div");
  code.className = "code";
  code.textContent = inviteCode;

  const actions = document.createElement("div");
  actions.className = "actions";
  const openButton = document.createElement("button");
  openButton.className = "open";
  openButton.type = "button";
  openButton.textContent = "Open party panel";
  const dismissButton = document.createElement("button");
  dismissButton.className = "dismiss";
  dismissButton.type = "button";
  dismissButton.textContent = "Not now";
  actions.append(openButton, dismissButton);

  const error = document.createElement("p");
  error.className = "error";
  error.hidden = true;
  prompt.append(eyebrow, heading, description, code, actions, error);
  shadow.append(style, prompt);
  document.documentElement.append(host);

  openButton.addEventListener("click", async () => {
    openButton.disabled = true;
    dismissButton.disabled = true;
    openButton.textContent = "Opening...";
    try {
      const response = await prepareInvite();
      if (!response.ok) {
        error.hidden = false;
        error.textContent = response.error;
        openButton.disabled = false;
        dismissButton.disabled = false;
        openButton.textContent = "Try again";
        return;
      }
      onComplete();
      host.remove();
    } catch {
      error.hidden = false;
      error.textContent = "The extension could not prepare this invite.";
      openButton.disabled = false;
      dismissButton.disabled = false;
      openButton.textContent = "Try again";
    }
  });

  dismissButton.addEventListener("click", () => {
    onComplete();
    host.remove();
  });

  return () => {
    host.remove();
  };
}
