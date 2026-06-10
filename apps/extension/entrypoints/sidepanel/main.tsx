import React from "react";
import { createRoot } from "react-dom/client";
import type { RoomPermissions } from "@ytm-party/shared";
import { apiUrl } from "../../src/config";
import "./styles.css";
import { PartySetupCard } from "./party-setup-card";
import { PermissionToggle } from "./permission-toggle";
import { QueueCard } from "./queue-card";
import { usePendingInvite } from "./use-pending-invite";
import { usePartySession } from "./use-party-session";

function App() {
  const {
    view,
    pendingAction,
    feedback,
    act,
    clearFeedback,
    reportFeedback,
  } = usePartySession();
  const { pendingInvite, clearPendingInvite } = usePendingInvite();
  const isHost = view.state?.hostParticipantId === view.participantId;
  const canSkip = isHost || view.state?.permissions.guestsCanSkip === true;

  async function updatePermissions(permissions: RoomPermissions) {
    await act(
      "permissions",
      { type: "party.updatePermissions", permissions },
      "Guest permissions updated.",
    );
  }

  const inviteUrl = view.state?.inviteCode
    ? apiUrl(`/join/${view.state.inviteCode}`)
    : undefined;

  return (
    <main className="panel">
      <section className="hero">
        <p className="eyebrow">YouTube Music Party</p>
        <h1>Listen together without passing the aux cord around.</h1>
        <p className="muted">Create a room, share a code, and keep everyone on the same track.</p>
      </section>

      {feedback ? (
        <button
          className={`notice ${feedback.kind}`}
          onClick={clearFeedback}
          aria-live="polite"
        >
          {feedback.message}
        </button>
      ) : null}
      {!feedback && view.lastError ? (
        <p className="notice error" aria-live="polite">
          {view.lastError}
        </p>
      ) : null}
      {view.state?.hostDisconnectedAtMs ? (
        <p className="notice warning" aria-live="polite">
          Host disconnected. The party is waiting briefly before transferring host
          controls.
        </p>
      ) : null}

      {!view.roomId ? (
        <PartySetupCard
          pendingAction={pendingAction}
          pendingInvite={pendingInvite}
          act={act}
          clearPendingInvite={clearPendingInvite}
        />
      ) : (
        <>
          {pendingInvite ? (
            <p className="notice warning" aria-live="polite">
              Invite {pendingInvite.inviteCode} is ready. Leave this party before
              joining a different one.
            </p>
          ) : null}
          <section className="card">
            <div className="status-row">
              <div>
                <p className="label">Status</p>
                <strong>{view.localSyncStatus.replaceAll("_", " ")}</strong>
              </div>
              {view.localSyncStatus === "ready_to_join" ? (
                <button
                  className="primary"
                  disabled={Boolean(pendingAction)}
                  onClick={() =>
                    act(
                      "join-playback",
                      { type: "party.joinPlayback" },
                      "Playback joined.",
                    )
                  }
                >
                  {pendingAction === "join-playback" ? "Joining..." : "Join playback"}
                </button>
              ) : null}
              {view.localSyncStatus === "out_of_sync" ||
              view.localSyncStatus === "track_unavailable" ? (
                <button
                  className="primary"
                  disabled={Boolean(pendingAction)}
                  onClick={() =>
                    act(
                      "rejoin-playback",
                      { type: "party.rejoinPlayback" },
                      "Playback synchronized.",
                    )
                  }
                >
                  {pendingAction === "rejoin-playback"
                    ? "Rejoining..."
                    : "Rejoin playback"}
                </button>
              ) : null}
            </div>
            <p className="now-playing">
              {view.state?.playback.track?.title ?? "No song selected yet"}
              {view.state?.playback.track?.artist ? (
                <span> by {view.state.playback.track.artist}</span>
              ) : null}
            </p>
            <button
              className="quiet"
              disabled={Boolean(pendingAction)}
              onClick={() =>
                act("leave", { type: "party.leave" }, "You left the party.")
              }
            >
              {pendingAction === "leave" ? "Leaving..." : "Leave party"}
            </button>
          </section>

          <section className="card stack">
            <p className="label">Invite</p>
            <div className="invite-code">{view.state?.inviteCode ?? "------"}</div>
            {inviteUrl ? (
              <button
                disabled={Boolean(pendingAction)}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteUrl);
                    await act("copy-invite", { type: "party.getState" }, "Invite link copied.");
                  } catch {
                    reportFeedback({
                      kind: "error",
                      message: "The invite link could not be copied.",
                    });
                  }
                }}
              >
                {pendingAction === "copy-invite" ? "Copying..." : "Copy link"}
              </button>
            ) : null}
          </section>

          {isHost && view.state ? (
            <section className="card stack">
              <p className="label">Guest permissions</p>
              <PermissionToggle
                label="Guests can skip songs"
                checked={view.state.permissions.guestsCanSkip}
                disabled={Boolean(pendingAction)}
                onChange={(guestsCanSkip) =>
                  updatePermissions({ ...view.state!.permissions, guestsCanSkip })
                }
              />
              <PermissionToggle
                label="Guests can add songs"
                checked={view.state.permissions.guestsCanAddToQueue}
                disabled={Boolean(pendingAction)}
                onChange={(guestsCanAddToQueue) =>
                  updatePermissions({ ...view.state!.permissions, guestsCanAddToQueue })
                }
              />
            </section>
          ) : null}

          <QueueCard
            state={view.state}
            isHost={isHost}
            canSkip={canSkip}
            pendingAction={pendingAction}
            act={act}
          />

          <section className="card stack">
            <p className="label">Participants</p>
            {view.state?.participants.map((participant) => (
              <p className="participant" key={participant.participantId}>
                <span>{participant.displayName}</span>
                <small>
                  {participant.role} · {participant.syncStatus.replaceAll("_", " ")}
                </small>
              </p>
            ))}
          </section>
        </>
      )}
    </main>
  );

}

createRoot(document.getElementById("root")!).render(<App />);
