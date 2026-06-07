import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { PartyRoomState, RoomPermissions } from "@ytm-party/shared";
import { browser } from "../../src/browser";
import { apiUrl } from "../../src/config";
import { sendExtensionRequest } from "../../src/extension-messaging";
import type { SessionView } from "../../src/session-types";
import "./styles.css";

const initialView: SessionView = {
  roomId: null,
  participantId: null,
  displayName: null,
  localSyncStatus: "not_joined",
  state: null,
};

function App() {
  const [view, setView] = useState<SessionView>(initialView);
  const [displayName, setDisplayName] = useState("Listener");
  const [inviteCode, setInviteCode] = useState("");
  const isHost = view.state?.hostParticipantId === view.participantId;
  const canSkip = isHost || view.state?.permissions.guestsCanSkip === true;

  useEffect(() => {
    void refresh();
    const listener = (message: { type?: string; state?: SessionView }) => {
      if (message.type === "party.stateChanged" && message.state) setView(message.state);
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  async function refresh() {
    const response = await sendExtensionRequest<SessionView>({ type: "party.getState" });
    if (response.ok) setView(response.data);
  }

  async function act(request: Parameters<typeof sendExtensionRequest<SessionView>>[0]) {
    const response = await sendExtensionRequest<SessionView>(request);
    if (response.ok) setView(response.data);
  }

  async function updatePermissions(permissions: RoomPermissions) {
    await act({ type: "party.updatePermissions", permissions });
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

      {view.lastError ? <p className="notice error">{view.lastError}</p> : null}

      {!view.roomId ? (
        <section className="card stack">
          <label>
            Display name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <button className="primary" onClick={() => act({ type: "party.create", displayName })}>
            Create party
          </button>
          <div className="join-row">
            <input
              placeholder="Short code"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
            />
            <button onClick={() => act({ type: "party.join", inviteCode, displayName })}>Join</button>
          </div>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="status-row">
              <div>
                <p className="label">Status</p>
                <strong>{view.localSyncStatus.replaceAll("_", " ")}</strong>
              </div>
              {view.localSyncStatus === "ready_to_join" ? (
                <button className="primary" onClick={() => act({ type: "party.joinPlayback" })}>
                  Join playback
                </button>
              ) : null}
              {view.localSyncStatus === "out_of_sync" ||
              view.localSyncStatus === "track_unavailable" ? (
                <button className="primary" onClick={() => act({ type: "party.rejoinPlayback" })}>
                  Rejoin playback
                </button>
              ) : null}
            </div>
            <p className="now-playing">
              {view.state?.playback.track?.title ?? "No song selected yet"}
              {view.state?.playback.track?.artist ? (
                <span> by {view.state.playback.track.artist}</span>
              ) : null}
            </p>
          </section>

          <section className="card stack">
            <p className="label">Invite</p>
            <div className="invite-code">{view.state?.inviteCode ?? "------"}</div>
            {inviteUrl ? <button onClick={() => navigator.clipboard.writeText(inviteUrl)}>Copy link</button> : null}
          </section>

          {isHost && view.state ? (
            <section className="card stack">
              <p className="label">Guest permissions</p>
              <Toggle
                label="Guests can skip songs"
                checked={view.state.permissions.guestsCanSkip}
                onChange={(guestsCanSkip) =>
                  updatePermissions({ ...view.state!.permissions, guestsCanSkip })
                }
              />
              <Toggle
                label="Guests can add songs"
                checked={view.state.permissions.guestsCanAddToQueue}
                onChange={(guestsCanAddToQueue) =>
                  updatePermissions({ ...view.state!.permissions, guestsCanAddToQueue })
                }
              />
            </section>
          ) : null}

          <section className="card stack">
            <div className="queue-heading">
              <p className="label">Queue</p>
              <button
                disabled={!canSkip}
                title={canSkip ? "Play the next queued song" : "The host has disabled guest skipping"}
                onClick={() => act({ type: "party.skip" })}
              >
                Skip
              </button>
            </div>
            {view.state?.queue.length ? (
              <ol className="queue">
                {view.state.queue.map((item, index) => (
                  <li key={item.id}>
                    <span>
                      {item.track.title ?? item.track.videoId}
                      {item.track.artist ? <small>{item.track.artist}</small> : null}
                    </span>
                    {isHost ? (
                      <div className="queue-actions">
                        <button
                          disabled={index === 0}
                          onClick={() => moveQueueItem(view.state!, index, index - 1)}
                        >
                          Up
                        </button>
                        <button
                          disabled={index === view.state!.queue.length - 1}
                          onClick={() => moveQueueItem(view.state!, index, index + 1)}
                        >
                          Down
                        </button>
                        <button onClick={() => act({ type: "party.queueRemove", queueItemId: item.id })}>
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">Right-click a YouTube Music song and choose Add to party queue.</p>
            )}
          </section>

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

  async function moveQueueItem(state: PartyRoomState, from: number, to: number) {
    const ids = state.queue.map((item) => item.id);
    const [moved] = ids.splice(from, 1);
    if (!moved) return;
    ids.splice(to, 0, moved);
    await act({ type: "party.queueReorder", queueItemIds: ids });
  }
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
