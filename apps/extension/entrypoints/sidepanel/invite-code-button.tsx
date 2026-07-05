import type { PartyFeedback } from "./use-party-session";

type InviteCodeButtonProps = {
  inviteCode: string;
  disabled: boolean;
  reportFeedback: (feedback: PartyFeedback) => void;
};

export function InviteCodeButton({
  inviteCode,
  disabled,
  reportFeedback,
}: InviteCodeButtonProps) {
  async function copyInviteCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteCode);
      reportFeedback({ kind: "success", message: "Invite code copied." });
    } catch {
      reportFeedback({
        kind: "error",
        message: "The invite code could not be copied.",
      });
    }
  }

  return (
    <button
      className="invite-code"
      disabled={disabled}
      title="Copy invite code"
      aria-label={`Copy invite code ${inviteCode}`}
      onClick={() => void copyInviteCode()}
    >
      <span>{inviteCode}</span>
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </svg>
    </button>
  );
}
