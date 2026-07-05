import type { QueueItem } from "@ytm-party/shared";

export function reorderQueueItemIds(
  queue: QueueItem[],
  movedItemId: string,
  targetItemId: string,
): string[] | null {
  const movedIndex = queue.findIndex((item) => item.id === movedItemId);
  const targetIndex = queue.findIndex((item) => item.id === targetItemId);
  if (movedIndex < 0 || targetIndex < 0 || movedIndex === targetIndex) return null;

  const ids = queue.map((item) => item.id);
  const [movedId] = ids.splice(movedIndex, 1);
  if (!movedId) return null;
  ids.splice(targetIndex, 0, movedId);
  return ids;
}
