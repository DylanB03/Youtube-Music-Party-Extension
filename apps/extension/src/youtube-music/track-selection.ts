import type { Track } from "@ytm-party/shared";
import {
  findTrackFromEvent,
  findTrackFromTarget,
  isSongMenuEvent,
} from "./selectors";

const DEFAULT_SELECTION_TTL_MS = 2 * 60_000;

type StoredSelection = {
  track: Track;
  capturedAtMs: number;
};

export class TrackSelectionStore {
  private selection: StoredSelection | null = null;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = DEFAULT_SELECTION_TTL_MS,
  ) {}

  capture(target: EventTarget | null): Track | null {
    const track = findTrackFromTarget(target);
    if (!track) {
      this.selection = null;
      return null;
    }

    this.remember(track);
    return track;
  }

  remember(track: Track): void {
    this.selection = {
      track,
      capturedAtMs: this.now(),
    };
  }

  peek(): Track | null {
    if (!this.selection) return null;
    if (this.now() - this.selection.capturedAtMs > this.ttlMs) {
      this.selection = null;
      return null;
    }
    return this.selection.track;
  }

  take(): Track | null {
    const track = this.peek();
    this.selection = null;
    return track;
  }

  millisecondsUntilExpiry(): number | null {
    if (!this.selection) return null;
    const remaining = this.ttlMs - (this.now() - this.selection.capturedAtMs);
    return Math.max(0, remaining);
  }
}

export function installTrackSelectionCapture(
  store: TrackSelectionStore,
  root: Document = document,
): () => void {
  const handleContextMenu = (event: MouseEvent) => {
    const track = findTrackFromEvent(event);
    if (track) store.remember(track);
  };
  const handlePointerDown = (event: PointerEvent) => {
    if (!isSongMenuEvent(event)) return;
    const track = findTrackFromEvent(event);
    if (track) store.remember(track);
  };

  root.addEventListener("contextmenu", handleContextMenu, true);
  root.addEventListener("pointerdown", handlePointerDown, true);

  return () => {
    root.removeEventListener("contextmenu", handleContextMenu, true);
    root.removeEventListener("pointerdown", handlePointerDown, true);
  };
}
