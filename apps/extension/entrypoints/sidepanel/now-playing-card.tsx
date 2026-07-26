import type {
  PartyRoomState,
  SyncStatus,
} from "@ytm-party/shared";
import { summarizePartySync } from "./room-presentation";
import type { PartyAction } from "./use-party-session";

type NowPlayingCardProps = {
  state: PartyRoomState | null;
  localSyncStatus: SyncStatus;
  canSkip: boolean;
  pendingAction: string | null;
  act: PartyAction;
};

export function NowPlayingCard({
  state,
  localSyncStatus,
  canSkip,
  pendingAction,
  act,
}: NowPlayingCardProps) {
  const track = state?.playback.track ?? null;
  const partySync = summarizePartySync(state?.participants ?? []);
  const needsSyncAction =
    localSyncStatus === "ready_to_join" ||
    localSyncStatus === "out_of_sync" ||
    localSyncStatus === "track_unavailable" ||
    localSyncStatus === "ready_to_resume";

  return (
    <section className="card now-playing-card" aria-labelledby="now-playing-title">
      <div className="now-playing-header">
        <p className="label">Now playing</p>
        <button
          className="skip-button"
          type="button"
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
          {pendingAction === "skip" ? "Skipping..." : "Skip"}
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m6 6 9 6-9 6V6Zm11 0v12" />
          </svg>
        </button>
      </div>
      <div className="now-playing-layout">
        <span className="now-playing-artwork" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M15 4.5v10.1a3.5 3.5 0 1 1-1.5-2.87V7.15l-6 1.42v8.03A3.5 3.5 0 1 1 6 13.73V7.38l9-2.13V4.5Z" />
          </svg>
          {track ? (
            <img
              src={
                track.thumbnailUrl ??
                youtubeThumbnailUrl(track.videoId)
              }
              alt=""
              decoding="async"
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          ) : null}
        </span>
        <div className="now-playing-details">
          <h1 id="now-playing-title">
            {track?.title ?? "Nothing playing yet"}
          </h1>
          <p className="now-playing-artist">
            {track?.artist ??
              (track
                ? "Unknown artist"
                : "Choose a song in YouTube Music to get started")}
          </p>
          <span className={`track-sync tone-${partySync.tone}`}>
            <span className="status-dot" aria-hidden="true" />
            {partySync.label}
          </span>
        </div>
      </div>
      {needsSyncAction ? (
        <div className="playback-actions">
          {localSyncStatus === "ready_to_join" ? (
            <button
              className="primary"
              type="button"
              disabled={Boolean(pendingAction)}
              onClick={() =>
                act(
                  "join-playback",
                  { type: "party.joinPlayback" },
                  "Playback joined.",
                )
              }
            >
              {pendingAction === "join-playback"
                ? "Joining..."
                : "Join playback"}
            </button>
          ) : null}
          {localSyncStatus === "out_of_sync" ||
          localSyncStatus === "track_unavailable" ? (
            <button
              className="primary"
              type="button"
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
          {localSyncStatus === "ready_to_resume" ? (
            <button
              className="primary"
              type="button"
              disabled={Boolean(pendingAction)}
              onClick={() =>
                act(
                  "resume-playback",
                  { type: "party.resumePlayback" },
                  "Playback resumed.",
                )
              }
            >
              {pendingAction === "resume-playback" ? "Resuming..." : "Resume"}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
}
