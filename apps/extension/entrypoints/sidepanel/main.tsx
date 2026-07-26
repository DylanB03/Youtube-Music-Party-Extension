import React from "react";
import { createRoot } from "react-dom/client";
import type { RoomPermissions } from "@ytm-party/shared";
import "./styles.css";
import { FeedbackToast } from "./feedback-toast";
import { InviteCodeButton } from "./invite-code-button";
import { NowPlayingCard } from "./now-playing-card";
import { PartySetupCard } from "./party-setup-card";
import { PermissionToggle } from "./permission-toggle";
import { QueueCard } from "./queue-card";
import { RoomHeader } from "./room-header";
import { presentSyncStatus } from "./room-presentation";
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
  const canReorderQueue =
    isHost || view.state?.permissions.guestsCanAddToQueue === true;
  const canRemoveFromQueue =
    isHost || view.state?.permissions.guestsCanRemoveFromQueue === true;

  async function updatePermissions(permissions: RoomPermissions) {
    await act(
      "permissions",
      { type: "party.updatePermissions", permissions },
      "Guest permissions updated.",
    );
  }

  return (
    <main className={`panel ${view.roomId ? "active-room" : "setup-room"}`}>
      {!view.roomId ? (
        <section className="hero">
          <p className="eyebrow">TogetherTune</p>
          <h1>Listen together without passing the aux cord around.</h1>
          <p className="muted">
            Create a room, share a code, and keep everyone on the same track.
          </p>
        </section>
      ) : (
        <RoomHeader
          inviteCode={view.state?.inviteCode ?? "------"}
          listenerCount={view.state?.participants.length ?? null}
          localSyncStatus={view.localSyncStatus}
          pendingAction={pendingAction}
          onLeave={() =>
            void act("leave", { type: "party.leave" }, "You left the party.")
          }
        />
      )}

      {view.roomId ? (
        <section className="room-invite" aria-labelledby="invite-heading">
          <div>
            <p className="label" id="invite-heading">
              Invite listeners
            </p>
            <p className="room-invite-help">Share this room code to listen together.</p>
          </div>
          <InviteCodeButton
            inviteCode={view.state?.inviteCode ?? "------"}
            disabled={Boolean(pendingAction) || !view.state?.inviteCode}
            reportFeedback={reportFeedback}
          />
        </section>
      ) : null}

      {feedback?.kind === "error" ? (
        <div className="notice error dismissible-notice" role="alert">
          <span>{feedback.message}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={clearFeedback}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="m7 7 10 10M17 7 7 17" />
            </svg>
          </button>
        </div>
      ) : null}
      {!feedback && view.lastError ? (
        <p className="notice error" aria-live="polite">
          {view.lastError}
        </p>
      ) : null}
      {view.state?.hostDisconnectedAtMs ? (
        <p className="notice warning" aria-live="polite">
          Host disconnected. Host controls will transfer shortly if they do not
          reconnect.
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
          <NowPlayingCard
            state={view.state}
            localSyncStatus={view.localSyncStatus}
            canSkip={canSkip}
            pendingAction={pendingAction}
            act={act}
          />

          <QueueCard
            state={view.state}
            canReorder={canReorderQueue}
            canRemove={canRemoveFromQueue}
            pendingAction={pendingAction}
            act={act}
          />

          <section className="card section-card" aria-labelledby="participants-heading">
            <div className="section-heading">
              <h2 className="section-title" id="participants-heading">
                Participants
              </h2>
              <span className="count-badge">
                {view.state?.participants.length ?? 0}
              </span>
            </div>
            <ul className="participants">
              {view.state?.participants.map((participant) => {
                const status = presentSyncStatus(participant.syncStatus);
                return (
                  <li className="participant" key={participant.participantId}>
                    <span className="participant-identity">
                      <span className="participant-avatar" aria-hidden="true">
                        {participant.displayName.trim().charAt(0).toUpperCase() ||
                          "?"}
                      </span>
                      <span className="participant-name">
                        <strong>{participant.displayName}</strong>
                        <small>
                          {participant.role === "host" ? "Host" : "Listener"}
                        </small>
                      </span>
                    </span>
                    <span
                      className={`participant-status tone-${status.tone}`}
                      title={status.label}
                    >
                      <span className="status-dot" aria-hidden="true" />
                      <span>{status.label}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {isHost && view.state ? (
            <details className="card permissions-card">
              <summary>
                <span className="permissions-summary-copy">
                  <span className="section-title">Guest permissions</span>
                  <small>Choose who can control the room</small>
                </span>
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="m8 10 4 4 4-4" />
                </svg>
              </summary>
              <div className="permission-options">
                <PermissionToggle
                  label="Allow guests to add songs"
                  checked={view.state.permissions.guestsCanAddToQueue}
                  disabled={Boolean(pendingAction)}
                  onChange={(guestsCanAddToQueue) =>
                    updatePermissions({
                      ...view.state!.permissions,
                      guestsCanAddToQueue,
                    })
                  }
                />
                <PermissionToggle
                  label="Allow guests to skip songs"
                  checked={view.state.permissions.guestsCanSkip}
                  disabled={Boolean(pendingAction)}
                  onChange={(guestsCanSkip) =>
                    updatePermissions({
                      ...view.state!.permissions,
                      guestsCanSkip,
                    })
                  }
                />
                <PermissionToggle
                  label="Allow guests to remove songs"
                  checked={view.state.permissions.guestsCanRemoveFromQueue}
                  disabled={Boolean(pendingAction)}
                  onChange={(guestsCanRemoveFromQueue) =>
                    updatePermissions({
                      ...view.state!.permissions,
                      guestsCanRemoveFromQueue,
                    })
                  }
                />
              </div>
            </details>
          ) : null}
        </>
      )}
      {feedback?.kind === "success" ? (
        <FeedbackToast feedback={feedback} onDismiss={clearFeedback} />
      ) : null}
      <footer className="footer">
        <span>Independent and not affiliated with Google or YouTube.</span>
        <a
          href="https://github.com/DylanB03/Youtube-Music-Party-Extension/blob/main/PRIVACY.md"
          target="_blank"
          rel="noreferrer"
        >
          Privacy
        </a>
        <a
          href="https://github.com/DylanB03/Youtube-Music-Party-Extension/issues"
          target="_blank"
          rel="noreferrer"
        >
          Support
        </a>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
