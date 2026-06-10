import type { Track } from "@ytm-party/shared";
import type { TrackSelectionStore } from "./track-selection";

export type SelectedMenuTrack =
  | {
      valid: true;
      track: Track;
    }
  | {
      valid: false;
      reason: string;
    };

export function consumeMenuTrack(
  selectionStore: TrackSelectionStore,
  expectedVideoId: string,
): SelectedMenuTrack {
  const selectedTrack = selectionStore.take();
  if (!selectedTrack || selectedTrack.videoId !== expectedVideoId) {
    return {
      valid: false,
      reason: "This song selection expired. Open its menu again.",
    };
  }

  return {
    valid: true,
    track: selectedTrack,
  };
}
