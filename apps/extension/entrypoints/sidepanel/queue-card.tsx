import { useState, type DragEvent, type KeyboardEvent } from "react";
import type { PartyRoomState } from "@ytm-party/shared";
import { reorderQueueItemIds } from "./queue-order";
import type { PartyAction } from "./use-party-session";

type QueueCardProps = {
  state: PartyRoomState | null;
  isHost: boolean;
  pendingAction: string | null;
  act: PartyAction;
};

export function QueueCard({
  state,
  isHost,
  pendingAction,
  act,
}: QueueCardProps) {
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  async function moveQueueItem(movedItemId: string, targetItemId: string): Promise<void> {
    if (!state) return;
    const ids = reorderQueueItemIds(state.queue, movedItemId, targetItemId);
    if (!ids) return;
    await act(
      "queue-reorder",
      { type: "party.queueReorder", queueItemIds: ids },
      "Queue order updated.",
    );
  }

  function beginDrag(event: DragEvent<HTMLButtonElement>, itemId: string): void {
    setDraggedItemId(itemId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
  }

  function allowDrop(event: DragEvent<HTMLLIElement>, itemId: string): void {
    if (!isHost || pendingAction || draggedItemId === itemId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetId(itemId);
  }

  function finishDrop(event: DragEvent<HTMLLIElement>, targetItemId: string): void {
    event.preventDefault();
    const movedItemId = draggedItemId ?? event.dataTransfer.getData("text/plain");
    setDraggedItemId(null);
    setDropTargetId(null);
    if (!movedItemId) return;
    void moveQueueItem(movedItemId, targetItemId);
  }

  function clearDragState(): void {
    setDraggedItemId(null);
    setDropTargetId(null);
  }

  function moveWithKeyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    itemId: string,
    index: number,
  ): void {
    if (!state || pendingAction) return;
    const targetIndex =
      event.key === "ArrowUp"
        ? index - 1
        : event.key === "ArrowDown"
          ? index + 1
          : -1;
    const targetItem = state.queue[targetIndex];
    if (!targetItem) return;
    event.preventDefault();
    void moveQueueItem(itemId, targetItem.id);
  }

  return (
    <section className="card stack">
      <p className="label">Queue</p>
      {state?.queue.length ? (
        <ol className="queue">
          {state.queue.map((item, index) => (
            <li
              key={item.id}
              className={`${draggedItemId === item.id ? "dragging" : ""} ${
                dropTargetId === item.id ? "drop-target" : ""
              }`}
              onDragOver={(event) => allowDrop(event, item.id)}
              onDrop={(event) => finishDrop(event, item.id)}
            >
              <div className="queue-item-main">
                {isHost ? (
                  <button
                    className="drag-handle"
                    draggable={!pendingAction}
                    disabled={Boolean(pendingAction)}
                    title="Drag to reorder; use arrow keys for keyboard reordering"
                    aria-label={`Reorder ${item.track.title ?? item.track.videoId}`}
                    onDragStart={(event) => beginDrag(event, item.id)}
                    onDragEnd={clearDragState}
                    onKeyDown={(event) => moveWithKeyboard(event, item.id, index)}
                  >
                    <svg aria-hidden="true" viewBox="0 0 12 18">
                      <circle cx="3" cy="3" r="1.3" />
                      <circle cx="9" cy="3" r="1.3" />
                      <circle cx="3" cy="9" r="1.3" />
                      <circle cx="9" cy="9" r="1.3" />
                      <circle cx="3" cy="15" r="1.3" />
                      <circle cx="9" cy="15" r="1.3" />
                    </svg>
                  </button>
                ) : null}
                <span className="queue-track">
                  {item.track.title ?? item.track.videoId}
                  {item.track.artist ? <small>{item.track.artist}</small> : null}
                </span>
              </div>
              {isHost ? (
                <div className="queue-actions">
                  <button
                    disabled={Boolean(pendingAction)}
                    onClick={() =>
                      act(
                        `queue-remove:${item.id}`,
                        { type: "party.queueRemove", queueItemId: item.id },
                        "Song removed from the queue.",
                      )
                    }
                  >
                    {pendingAction === `queue-remove:${item.id}`
                      ? "Removing..."
                      : "Remove"}
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
