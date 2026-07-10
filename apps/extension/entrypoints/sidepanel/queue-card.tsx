import { useState, type DragEvent, type KeyboardEvent } from "react";
import type { PartyRoomState } from "@ytm-party/shared";
import { reorderQueueItemIds } from "./queue-order";
import type { PartyAction } from "./use-party-session";

type QueueCardProps = {
  state: PartyRoomState | null;
  canReorder: boolean;
  canRemove: boolean;
  pendingAction: string | null;
  act: PartyAction;
};

export function QueueCard({
  state,
  canReorder,
  canRemove,
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
    if (!canReorder || pendingAction || draggedItemId === itemId) return;
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
    if (!state || !canReorder || pendingAction) return;
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
                {canReorder ? (
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
              {canRemove ? (
                <div className="queue-actions">
                  <button
                    className="icon-button danger"
                    disabled={Boolean(pendingAction)}
                    aria-label={`Remove ${item.track.title ?? item.track.videoId} from queue`}
                    title={
                      pendingAction === `queue-remove:${item.id}`
                        ? "Removing..."
                        : "Remove from queue"
                    }
                    onClick={() =>
                      act(
                        `queue-remove:${item.id}`,
                        { type: "party.queueRemove", queueItemId: item.id },
                        "Song removed from the queue.",
                      )
                    }
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <path
                        d="M9 3.75A1.75 1.75 0 0 1 10.75 2h2.5A1.75 1.75 0 0 1 15 3.75V5h4.25a.75.75 0 0 1 0 1.5h-.8l-.74 12.2A3.5 3.5 0 0 1 14.22 22H9.78a3.5 3.5 0 0 1-3.49-3.3L5.55 6.5h-.8a.75.75 0 0 1 0-1.5H9V3.75Zm1.5 0V5h3V3.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Zm-3.44 2.75.73 12.1a2 2 0 0 0 2 1.9h4.42a2 2 0 0 0 2-1.9l.73-12.1H7.06ZM10.25 9a.75.75 0 0 1 .75.75v7a.75.75 0 0 1-1.5 0v-7a.75.75 0 0 1 .75-.75Zm3.5 0a.75.75 0 0 1 .75.75v7a.75.75 0 0 1-1.5 0v-7a.75.75 0 0 1 .75-.75Z"
                      />
                    </svg>
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
