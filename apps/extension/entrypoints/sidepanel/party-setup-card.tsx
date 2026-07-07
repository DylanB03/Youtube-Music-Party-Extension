import { useEffect, useState } from "react";
import type { PendingInvite } from "@ytm-party/shared";
import type { PartyAction } from "./use-party-session";

type PartySetupCardProps = {
  pendingAction: string | null;
  pendingInvite: PendingInvite | null;
  act: PartyAction;
  clearPendingInvite: () => Promise<boolean>;
};

export function PartySetupCard({
  pendingAction,
  pendingInvite,
  act,
  clearPendingInvite,
}: PartySetupCardProps) {
  const [displayName, setDisplayName] = useState("Listener");
  const [inviteCode, setInviteCode] = useState("");

  useEffect(() => {
    if (pendingInvite) setInviteCode(pendingInvite.inviteCode);
  }, [pendingInvite]);

  async function joinParty(): Promise<void> {
    const joined = await act(
      "join",
      { type: "party.join", inviteCode, displayName },
      "Joined the party. Playback will wait for you.",
    );
    if (joined && pendingInvite) await clearPendingInvite();
  }

  return (
    <section className="card stack">
      {pendingInvite ? (
        <div className="prepared-invite">
          <div>
            <p className="label">Invite ready</p>
            <strong>{pendingInvite.inviteCode}</strong>
          </div>
          <button
            className="quiet compact"
            disabled={Boolean(pendingAction)}
            onClick={() => void clearPendingInvite()}
          >
            Clear
          </button>
        </div>
      ) : null}
      <label>
        Display name
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </label>
      <button
        className="primary"
        disabled={Boolean(pendingAction)}
        onClick={() =>
          void act(
            "create",
            { type: "party.create", displayName },
            "Party created. Share the invite when you are ready.",
          )
        }
      >
        {pendingAction === "create" ? "Creating..." : "Create party"}
      </button>
      <div className="join-row">
        <input
          aria-label="Party invite code"
          placeholder="Short code"
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
        />
        <button
          disabled={Boolean(pendingAction) || inviteCode.trim().length === 0}
          onClick={() => void joinParty()}
        >
          {pendingAction === "join" ? "Joining..." : "Join"}
        </button>
      </div>
      <p className="privacy-note">
        Creating or joining a party shares your display name and current playback
        and queue details with party members through our Cloudflare-hosted service.{" "}
        <a
          href="https://github.com/DylanB03/Youtube-Music-Party-Extension/blob/main/PRIVACY.md"
          target="_blank"
          rel="noreferrer"
        >
          Privacy details
        </a>
      </p>
    </section>
  );
}
