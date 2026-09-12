import type { PartyPlaybackState } from "@ytm-party/shared";

export const MEDIA_PLAY_TIMEOUT_MS = 8_000;

/**
 * Preserve playback that YouTube Music has already started. Only pause when
 * the room is paused or is waiting for a scheduled future start.
 */
export function shouldPauseForPlaybackApplication(
  playback: PartyPlaybackState,
  nowMs = Date.now(),
): boolean {
  return playback.paused || playback.effectiveAtMs > nowMs;
}

/**
 * Resolve once playback has actually started and bound the browser play
 * promise so an unsettled HTMLMediaElement.play() cannot strand an extension
 * request indefinitely.
 */
export async function ensureMediaPlaying(
  media: HTMLMediaElement,
  timeoutMs = MEDIA_PLAY_TIMEOUT_MS,
): Promise<void> {
  const isPlaying = () =>
    !media.paused && !media.seeking && !media.ended && !media.error &&
    media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  if (isPlaying()) return;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      globalThis.clearInterval(poll);
      media.removeEventListener("playing", checkPlaying);
      media.removeEventListener("error", onError);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const checkPlaying = () => {
      if (isPlaying()) finish();
    };
    const onError = () => finish(new Error("YouTube Music could not play this song."));
    const poll = globalThis.setInterval(checkPlaying, 50);
    const timeout = globalThis.setTimeout(() => {
      if (isPlaying()) {
        finish();
        return;
      }
      finish(new Error("Timed out starting YouTube Music playback."));
    }, timeoutMs);

    media.addEventListener("playing", checkPlaying);
    media.addEventListener("error", onError, { once: true });
    try {
      void media.play().then(
        checkPlaying,
        (error) => finish(error),
      );
    } catch (error) {
      finish(error);
    }
  });
}
