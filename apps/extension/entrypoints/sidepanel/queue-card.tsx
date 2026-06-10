import type { PartyRoomState } from "@ytm-party/shared";
import type { PartyAction } from "./use-party-session";

type QueueCardProps = {
  state: PartyRoomState | null;
  isHost: boolean;
  canSkip: boolean;
  pendingAction: string | null;
  act: PartyAction;
};

export function QueueCard({
  state,
  isHost,
  canSkip,
  pendingAction,
  act,
}: QueueCardProps) {
  async function moveQueueItem(from: number, to: number): Promise<void> {
    if (!state) return;
    const ids = state.queue.map((item) => item.id);
    const [moved] = ids.splice(from, 1);
    if (!moved) return;
    ids.splice(to, 0, moved);
    await act(
      "queue-reorder",
      { type: "party.queueReorder", queueItemIds: ids },
      "Queue order updated.",
    );
  }

  return (
    <section className="card stack">
      <div className="queue-heading">
        <p className="label">Queue</p>
        <button
          disabled={!canSkip || Boolean(pendingAction)}
          title={
            canSkip
              ? "Play the next queued song"
              : "The host has disabled guest skipping"
          }
          onClick={() =>
            act("skip", { type: "party.skip" }, "Skipped to the next song.")
          }
        >
          Skip
        </button>
      </div>
      {state?.queue.length ? (
        <ol className="queue">
          {state.queue.map((item, index) => (
            <li key={item.id}>
              <span>
                {item.track.title ?? item.track.videoId}
                {item.track.artist ? <small>{item.track.artist}</small> : null}
              </span>
              {isHost ? (
                <div className="queue-actions">
                  <button
                    disabled={index === 0 || Boolean(pendingAction)}
                    onClick={() => moveQueueItem(index, index - 1)}
                  >
                    Up
                  </button>
                  <button
                    disabled={
                      index === state.queue.length - 1 || Boolean(pendingAction)
                    }
                    onClick={() => moveQueueItem(index, index + 1)}
                  >
                    Down
                  </button>
                  <button
                    disabled={Boolean(pendingAction)}
                    onClick={() =>
                      act(
                        "queue-remove",
                        { type: "party.queueRemove", queueItemId: item.id },
                        "Song removed from the queue.",
                      )
                    }
                  >
                    {pendingAction === "queue-remove" ? "Removing..." : "Remove"}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">
          Open a YouTube Music song menu and choose Add to party queue.
        </p>
      )}
    </section>
  );
}
